import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedEnvelope } from "@/lib/contracts";
import { ApiError, type Snapshot } from "@/lib/api";
import {
  ACK_TIMEOUT_MS,
  HANDSHAKE_TIMEOUT_MS,
  BACKOFF,
  createMatchSocket,
  retryDelay,
  SUBPROTOCOL,
  TICK_MS,
  type MatchSocket,
} from "@/lib/socket";
import { createMatchStore, notices, STALE_AFTER_MS, type MatchStore } from "@/lib/store";
import { envelope, eventEnv, makeSetup, MATCH, statusEnv } from "./fixtures";

// ---- a stand-in for the browser's WebSocket that the test drives by hand
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
  serverClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const group = (data: unknown) => ({ type: "message", from: "group", group: `match-${MATCH}`, dataType: "json", data });
const connectedMessage = { type: "system", event: "connected", userId: null, connectionId: "c1" };
const ack = (ackId: number, success = true) => ({ type: "ack", ackId, success });

function snapshotOf(envelopes: ParsedEnvelope[], rejected = { count: 0, samples: [] as string[] }): Snapshot {
  return { matchId: MATCH, setup: makeSetup(), status: null, envelopes, rejected };
}

/** A promise the test resolves or rejects when it wants the snapshot to arrive. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let store: MatchStore;
let socket: MatchSocket;
let negotiate: ReturnType<typeof vi.fn>;
let getSnapshot: ReturnType<typeof vi.fn>;
let snapshot: ReturnType<typeof deferred<Snapshot>>;
let warn: ReturnType<typeof vi.spyOn>;

const settle = () => vi.advanceTimersByTimeAsync(0);
const ws = (n = FakeWebSocket.instances.length - 1) => FakeWebSocket.instances[n];
const state = () => store.getState();
const rowKeys = () => state().timeline.rows.map((r) => r.key);

/** Opens the connection, lets the server say "connected" and acknowledge the join. */
async function connectAndJoin(n = FakeWebSocket.instances.length - 1) {
  ws(n).open();
  ws(n).receive(connectedMessage);
  await settle();
  const join = JSON.parse(ws(n).sent[0]) as { ackId: number };
  ws(n).receive(ack(join.ackId));
  await settle();
}

/** The whole happy path up to a finished catch-up with the given history. */
async function fullyConnected(history: ParsedEnvelope[] = []) {
  socket.start();
  await settle();
  await connectAndJoin();
  snapshot.resolve(snapshotOf(history));
  await settle();
  store.flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  FakeWebSocket.instances = [];
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  store = createMatchStore(MATCH, { now: () => Date.now(), onReject: () => undefined });
  snapshot = deferred<Snapshot>();
  negotiate = vi.fn(async (groups: string[]) => ({ url: `ws://fake/client/hubs/live?groups=${groups.join(",")}` }));
  getSnapshot = vi.fn(() => snapshot.promise);
  socket = createMatchSocket(store, {
    negotiate: negotiate as never,
    getSnapshot: getSnapshot as never,
    WebSocketImpl: FakeWebSocket as never,
    now: () => Date.now(),
    random: () => 0,
  });
});

afterEach(() => {
  socket.stop();
  store.destroy();
  warn.mockRestore();
  vi.useRealTimers();
});

describe("connecting", () => {
  it("negotiates for the match group and opens the Web PubSub socket", async () => {
    socket.start();
    await settle();
    expect(negotiate).toHaveBeenCalledWith([`match-${MATCH}`]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(ws().url).toBe(`ws://fake/client/hubs/live?groups=match-${MATCH}`);
    expect(ws().protocols).toBe(SUBPROTOCOL);
    expect(SUBPROTOCOL).toBe("json.webpubsub.azure.v1");
    store.flush();
    expect(state().connection.status).toBe("connecting");
    expect(state().notice.text).toBe(notices.connecting);
  });

  it("does nothing until the server says connected, then starts the catch-up", async () => {
    socket.start();
    await settle();
    ws().open();
    await settle();
    expect(ws().sent).toEqual([]);
    ws().receive(connectedMessage);
    await settle();
    store.flush();
    expect(state().connection.status).toBe("connecting");
    expect(state().notice.text).toBe(notices.loadingHistory);
  });

  it("joins the match group and waits for the acknowledgement before asking for the snapshot", async () => {
    socket.start();
    await settle();
    ws().open();
    ws().receive(connectedMessage);
    await settle();
    expect(JSON.parse(ws().sent[0])).toEqual({ type: "joinGroup", group: `match-${MATCH}`, ackId: 1 });
    expect(getSnapshot).not.toHaveBeenCalled();
    ws().receive(ack(1));
    await settle();
    expect(getSnapshot).toHaveBeenCalledTimes(1);
    expect(getSnapshot.mock.calls[0][0]).toBe(MATCH);
    expect(getSnapshot.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });

  it("retries rather than claiming live delivery if the join is never acknowledged", async () => {
    socket.start();
    await settle();
    ws().open();
    ws().receive(connectedMessage);
    await settle();
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS - 1);
    expect(getSnapshot).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(getSnapshot).not.toHaveBeenCalled();
    store.flush();
    expect(state().connection.status).toBe("reconnecting");
  });

  it("reconnects when the join is refused", async () => {
    socket.start();
    await settle();
    ws().open();
    ws().receive(connectedMessage);
    await settle();
    ws().receive(ack(1, false));
    await settle();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`match-${MATCH}`));
    expect(getSnapshot).not.toHaveBeenCalled();
    store.flush();
    expect(state().connection.status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs);
    expect(negotiate).toHaveBeenCalledTimes(2);
  });

  it("is safe to start twice", async () => {
    socket.start();
    socket.start();
    await settle();
    expect(negotiate).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe("catching up", () => {
  it("merges the snapshot with messages that arrived meanwhile, by seq, oldest first", async () => {
    socket.start();
    await settle();
    await connectAndJoin();
    // live messages arrive while the snapshot is still loading, out of order and overlapping it
    ws().receive(group(eventEnv(5)));
    ws().receive(group(eventEnv(3)));
    ws().receive(group(eventEnv(4)));
    store.flush();
    expect(rowKeys()).toEqual([]); // held back until the snapshot is in

    snapshot.resolve(snapshotOf([statusEnv(1, "live"), eventEnv(2), eventEnv(4)]));
    await settle();
    store.flush();

    // newest arrival first = the highest seq, because the merged list is applied in seq order
    expect(rowKeys()).toEqual(["5", "4", "3", "2", "1"]);
    const byKey = Object.fromEntries(state().timeline.rows.map((r) => [r.key, r.received]));
    expect(byKey["1"]).toBeNull(); // history
    expect(byKey["2"]).toBeNull();
    expect(byKey["3"]).toBe(1_000_000); // live
    expect(byKey["4"]).toBe(1_000_000); // in both: the live copy wins
    expect(byKey["5"]).toBe(1_000_000);
    expect(state().counters.messages).toBe(3); // only live ones count
    expect(state().notice).toEqual({ text: notices.connected, tone: "info" });
  });

  it("applies the snapshot's setup first, so rows have player names", async () => {
    await fullyConnected([eventEnv(2)]);
    expect(state().scoreboard.setup?.teams.home.name).toBe("Northbridge FC");
    expect(state().timeline.rows[0].detail).toBe("Nora 9 → Nora 11 · success");
  });

  it("retries a failed snapshot instead of leaving team setup and history absent", async () => {
    socket.start();
    await settle();
    await connectAndJoin();
    ws().receive(group(eventEnv(8)));
    snapshot.reject(new ApiError("network", "snapshot: cannot reach the stream server"));
    await settle();
    store.flush();
    expect(rowKeys()).toEqual([]);
    expect(state().connection.status).toBe("reconnecting");
    expect(state().notice).toEqual({ text: notices.historyUnavailable, tone: "warning" });
    snapshot = deferred<Snapshot>();
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs);
    await connectAndJoin();
    snapshot.resolve(snapshotOf([eventEnv(8)]));
    await settle(); store.flush();
    expect(state().scoreboard.setup).toEqual(makeSetup());
    expect(rowKeys()).toEqual(["8"]);
    expect(state().connection.status).toBe("live");
    expect(warn).toHaveBeenCalled();
  });

  it("counts the snapshot's rejected envelopes and logs the reasons", async () => {
    socket.start();
    await settle();
    await connectAndJoin();
    snapshot.resolve(snapshotOf([eventEnv(1)], { count: 2, samples: ["Rejected event seq 4: data.x: nope"] }));
    await settle();
    store.flush();
    expect(state().connection.rejected).toBe(2);
    expect(warn).toHaveBeenCalledWith("Rejected event seq 4: data.x: nope");
  });

  it("streams live messages straight into the store once caught up", async () => {
    await fullyConnected();
    ws().receive(group(eventEnv(10)));
    vi.setSystemTime(1_002_000);
    ws().receive(group(eventEnv(11)));
    store.flush();
    expect(rowKeys()).toEqual(["11", "10"]);
    expect(state().timeline.rows[0].received).toBe(1_002_000);
    expect(state().counters.messages).toBe(2);
  });

  it("starts each connection from a clean store", async () => {
    await fullyConnected([eventEnv(1), eventEnv(2)]);
    ws().receive(group(eventEnv(3)));
    store.flush();
    expect(state().counters.messages).toBe(1);

    snapshot = deferred<Snapshot>(); // the next snapshot request gets a fresh answer
    ws().serverClose();
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await connectAndJoin();
    store.flush();
    expect(state().timeline.rows).toEqual([]);
    expect(state().counters.messages).toBe(0);

    // the same seqs are welcome again: a restarted server counts from 1
    ws().receive(group(eventEnv(1)));
    snapshot.resolve(snapshotOf([eventEnv(1)]));
    await settle();
    store.flush();
    expect(rowKeys()).toEqual(["1"]);
    expect(state().counters.messages).toBe(1);
  });
});

describe("reading messages", () => {
  it("ignores messages that are not group JSON envelopes", async () => {
    await fullyConnected();
    ws().receive({ type: "system", event: "disconnected", message: "bye" });
    ws().receive({ type: "message", from: "server", dataType: "json", data: eventEnv(20) });
    ws().receive({ type: "message", from: "group", dataType: "text", data: "hello" });
    ws().receive({ type: "ack", ackId: 999, success: true });
    ws().receive({ type: "somethingNew" });
    store.flush();
    expect(rowKeys()).toEqual([]);
    expect(state().connection.rejected).toBe(0);
  });

  it("counts text that is not JSON, and JSON that is not an object, as rejected", async () => {
    await fullyConnected();
    ws().receive("this is not json");
    ws().receive("42");
    ws().receive("null");
    store.flush();
    expect(state().connection.rejected).toBe(3);
  });

  it("counts an envelope that breaks the contract, and carries on", async () => {
    await fullyConnected();
    ws().receive(group(envelope("event", { nope: 1 })));
    ws().receive(group(eventEnv(30)));
    store.flush();
    expect(state().connection.rejected).toBe(1);
    expect(rowKeys()).toEqual(["30"]);
  });
});

describe("reconnecting", () => {
  it("retryDelay doubles from 3 s, caps at 15 s, and adds up to 20% jitter", () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => retryDelay(n, () => 0))).toEqual([3000, 6000, 12_000, 15_000, 15_000, 15_000]);
    expect(retryDelay(0, () => 0.999)).toBe(Math.round(3000 * (1 + BACKOFF.jitter * 0.999)));
    expect(retryDelay(5, () => 0.5)).toBe(16_500);
  });

  it("says so and retries after 3 s when an established connection drops", async () => {
    await fullyConnected();
    ws().serverClose();
    store.flush();
    expect(state().connection.status).toBe("reconnecting");
    expect(state().notice).toEqual({ text: notices.connectionLost, tone: "warning" });

    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs - 1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(negotiate).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("keeps the notice a warning while it retries, with no calm flicker in between", async () => {
    await fullyConnected();
    ws().serverClose();
    store.flush();
    const tones: string[] = [state().notice.tone];
    store.subscribe(() => tones.push(state().notice.tone));
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs); // the retry starts
    store.flush();
    expect(tones.every((t) => t === "warning")).toBe(true);
    expect(state().notice).toEqual({ text: notices.connectionLost, tone: "warning" });
  });

  it("keeps the reconnecting status until subscription and catch-up complete", async () => {
    await fullyConnected([eventEnv(1)]);
    snapshot = deferred<Snapshot>();
    ws().serverClose();
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs);
    ws().open();
    const seen: string[] = [];
    store.subscribe(() => seen.push(`${state().connection.status}:${state().timeline.rows.length}`));
    ws().receive(connectedMessage); // the store is reset here
    await settle();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((entry) => entry.startsWith("reconnecting:"))).toBe(true);
  });

  it("backs off 3, 6, 12, then 15 s while the server stays unreachable", async () => {
    socket.start();
    await settle();
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = FakeWebSocket.instances.length;
      const t0 = Date.now();
      ws().serverClose(); // closes without ever connecting
      store.flush();
      expect(state().notice.text).toBe(notices.unreachable);
      // find when the next attempt appears
      while (FakeWebSocket.instances.length === before) await vi.advanceTimersByTimeAsync(100);
      delays.push(Math.round((Date.now() - t0) / 100) * 100);
    }
    expect(delays).toEqual([3000, 6000, 12_000, 15_000, 15_000]);
  });

  it("goes back to 3 s once a connection has succeeded", async () => {
    socket.start();
    await settle();
    ws().serverClose();
    await vi.advanceTimersByTimeAsync(3000); // attempt 2 appears
    ws().serverClose();
    await vi.advanceTimersByTimeAsync(6000); // attempt 3 appears
    await connectAndJoin();
    snapshot.resolve(snapshotOf([]));
    await settle();
    ws().serverClose();
    const before = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(FakeWebSocket.instances.length).toBe(before + 1);
  });

  it("treats a failed negotiate like a dropped connection", async () => {
    negotiate.mockRejectedValueOnce(new ApiError("network", "negotiate: cannot reach the stream server"));
    socket.start();
    await settle();
    store.flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(state().connection.status).toBe("reconnecting");
    expect(state().notice).toEqual({ text: notices.unreachable, tone: "warning" });
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs);
    expect(negotiate).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("uses the injected randomness for jitter", async () => {
    socket = createMatchSocket(store, {
      negotiate: negotiate as never,
      getSnapshot: getSnapshot as never,
      WebSocketImpl: FakeWebSocket as never,
      random: () => 0.5,
    });
    socket.start();
    await settle();
    ws().serverClose();
    await vi.advanceTimersByTimeAsync(3299);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2); // 3000 + 10% of 3000
  });

  it("stops trying when the connection closes while the snapshot is loading, and ignores the late snapshot", async () => {
    socket.start();
    await settle();
    await connectAndJoin();
    const signal = getSnapshot.mock.calls[0][1] as AbortSignal;
    ws().serverClose();
    expect(signal.aborted).toBe(true);
    snapshot.resolve(snapshotOf([eventEnv(1)]));
    await settle();
    store.flush();
    expect(rowKeys()).toEqual([]);
    expect(state().connection.status).toBe("reconnecting");
    expect(state().notice.text).not.toBe(notices.historyUnavailable);
  });
});

describe("full time", () => {
  it("shows 'finished' as soon as the status says full time, even while the connection is open", async () => {
    await fullyConnected();
    ws().receive(group(statusEnv(50, "full_time", { home: 1, away: 0 })));
    store.flush(); // publishes the scoreboard, which the socket is watching
    store.flush();
    expect(state().connection.status).toBe("finished");
    expect(state().notice).toEqual({ text: notices.finished, tone: "info" });
  });

  it("does not reconnect after a close at full time", async () => {
    await fullyConnected();
    ws().receive(group(statusEnv(50, "full_time", { home: 1, away: 0 })));
    ws().serverClose(); // before the next publish: the socket reads the latest phase itself
    store.flush();
    expect(state().connection.status).toBe("finished");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(negotiate).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("does not report the stream as quiet after full time", async () => {
    await fullyConnected();
    ws().receive(group(statusEnv(50, "full_time", { home: 1, away: 0 })));
    store.flush();
    await vi.advanceTimersByTimeAsync(STALE_AFTER_MS * 3);
    store.flush();
    expect(state().connection.status).toBe("finished");
  });

  it("does reconnect after a drop mid-match", async () => {
    await fullyConnected();
    ws().receive(group(statusEnv(50, "live", { home: 0, away: 0 })));
    ws().serverClose();
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe("a quiet stream", () => {
  it("asks the store to check once a second, so it goes stale and recovers", async () => {
    await fullyConnected();
    ws().receive(group(eventEnv(1)));
    store.flush();
    await vi.advanceTimersByTimeAsync(STALE_AFTER_MS + TICK_MS * 2);
    store.flush();
    expect(state().connection.status).toBe("stale");
    expect(state().notice.tone).toBe("warning");

    ws().receive(group(eventEnv(2)));
    store.flush();
    expect(state().connection.status).toBe("live");
  });
});

describe("stopping", () => {
  it("closes the socket and never reconnects", async () => {
    await fullyConnected();
    socket.stop();
    expect(ws().closed).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(negotiate).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("stops a pending retry", async () => {
    socket.start();
    await settle();
    ws().serverClose();
    socket.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(negotiate).toHaveBeenCalledTimes(1);
  });

  it("stops the one-second check", async () => {
    await fullyConnected();
    ws().receive(group(eventEnv(1)));
    store.flush();
    socket.stop();
    await vi.advanceTimersByTimeAsync(STALE_AFTER_MS * 2);
    store.flush();
    expect(state().connection.status).toBe("live"); // nothing is asking the store to go stale any more
  });

  it("leaves the store alone once stopped, whatever the old connection does", async () => {
    socket.start();
    await settle();
    await connectAndJoin();
    const old = ws();
    socket.stop();
    old.receive(group(eventEnv(1))); // handlers were removed
    snapshot.resolve(snapshotOf([eventEnv(2)]));
    await settle();
    store.flush();
    expect(rowKeys()).toEqual([]);
  });

  it("is safe before start, and when called twice", () => {
    expect(() => {
      socket.stop();
      socket.stop();
    }).not.toThrow();
  });

  it("survives React StrictMode's start, stop, start", async () => {
    socket.start();
    socket.stop();
    socket.start();
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(1); // the first negotiate's answer was ignored
    await connectAndJoin();
    snapshot.resolve(snapshotOf([eventEnv(1)]));
    await settle();
    store.flush();
    expect(rowKeys()).toEqual(["1"]);
    expect(state().connection.status).toBe("live");
  });

  it("can be started again after a stop", async () => {
    await fullyConnected();
    socket.stop();
    socket.start();
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe("bounded connection recovery", () => {
  it("retries a socket that never sends its connected message and ignores its late callback", async () => {
    socket.start(); await settle();
    const oldMessage = ws().onmessage;
    await vi.advanceTimersByTimeAsync(HANDSHAKE_TIMEOUT_MS);
    expect(ws().closed).toBe(true);
    oldMessage?.({ data: JSON.stringify(connectedMessage) });
    expect(getSnapshot).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(BACKOFF.firstMs);
    expect(negotiate).toHaveBeenCalledTimes(2);
  });
  it("clears handshake and join timers when stopped", async () => {
    socket.start(); await settle();
    ws().open(); ws().receive(connectedMessage); await settle();
    socket.stop();
    await vi.advanceTimersByTimeAsync(HANDSHAKE_TIMEOUT_MS + BACKOFF.maxMs);
    expect(negotiate).toHaveBeenCalledTimes(1);
    expect(getSnapshot).not.toHaveBeenCalled();
  });
});
