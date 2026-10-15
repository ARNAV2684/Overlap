// socket.ts — Socket client
//
// Purpose: keep a live connection to the stream and feed the match store: negotiate, open the Web PubSub socket, join
//          the match group, catch up from the snapshot, then stream; reconnect when the connection drops
// Inputs:  a MatchStore. Optional dependencies, for tests
// Outputs: createMatchSocket(store): { start(), stop() }
// Spec:    web/specs/realtime.md §1 and §3. web/IMPLEMENTATION_PLAN.md Phase 5.2
//
// The protocol is Azure Web PubSub's client protocol "json.webpubsub.azure.v1", which the local mock speaks too, so
// going to Azure later only changes what negotiate() returns. Messages we handle:
//   {type:"system", event:"connected"}                        the connection is ready: start the catch-up
//   {type:"ack", ackId, success}                              the reply to our joinGroup
//   {type:"message", from:"group", dataType:"json", data}     an envelope (CONTRACTS.md §7)
//
// One connection attempt is one "generation". Every callback checks that its generation is still current, so a
// connection that was replaced or stopped can never write to the store. That also makes React StrictMode's double
// start in development harmless.

import { negotiate as defaultNegotiate, getSnapshot as defaultGetSnapshot } from "@/lib/api";
import { parseEnvelope, type ParsedEnvelope } from "@/lib/contracts";
import { notices, type MatchStore } from "@/lib/store";

export const SUBPROTOCOL = "json.webpubsub.azure.v1";
/** How often the store is asked to check for a quiet stream. */
export const TICK_MS = 1000;
/** First retry after 3 s, then 6 s, 12 s, and never more than 15 s, plus up to 20% random jitter. */
export const BACKOFF = { firstMs: 3000, maxMs: 15_000, jitter: 0.2 } as const;
/** How long to wait for the reply to joinGroup before asking for the snapshot anyway. */
export const ACK_TIMEOUT_MS = 3000;

const OPEN = 1; // WebSocket.OPEN, written out so a test double does not need the constant

export type SocketDeps = {
  negotiate: (groups: string[], signal?: AbortSignal) => Promise<{ url: string }>;
  getSnapshot: typeof defaultGetSnapshot;
  WebSocketImpl: new (url: string, protocols?: string | string[]) => WebSocket;
  now: () => number;
  /** 0 up to (not including) 1. Replace it in tests to make the retry delay exact. */
  random: () => number;
};

export type MatchSocket = {
  /** Connects. Safe to call twice. */
  start(): void;
  /** Disconnects for good and stops every timer. Safe to call before start(), twice, or in a cleanup. */
  stop(): void;
};

type Entry = { envelope: ParsedEnvelope; received: number | null };

/** The delay before retry number `attempt` (0 for the first retry). */
export function retryDelay(attempt: number, random: () => number): number {
  const base = Math.min(BACKOFF.maxMs, BACKOFF.firstMs * 2 ** attempt);
  return Math.round(base * (1 + BACKOFF.jitter * random()));
}

export function createMatchSocket(store: MatchStore, overrides: Partial<SocketDeps> = {}): MatchSocket {
  const deps: SocketDeps = {
    negotiate: defaultNegotiate,
    getSnapshot: defaultGetSnapshot,
    WebSocketImpl: globalThis.WebSocket,
    now: Date.now,
    random: Math.random,
    ...overrides,
  };
  const groups = [`match-${store.matchId}`];

  let running = false;
  let generation = 0;
  let attempt = 0;
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let snapshotAbort: AbortController | null = null;

  // per connection
  let loading = false;
  let buffer: { raw: unknown; at: number }[] = [];
  let nextAckId = 1;
  let acks = new Map<number, (ok: boolean) => void>();

  const current = (gen: number) => running && gen === generation;

  function clearConnection() {
    snapshotAbort?.abort();
    snapshotAbort = null;
    loading = false;
    buffer = [];
    acks = new Map();
  }

  function closeSocket() {
    const ws = socket;
    socket = null;
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  // ---- connecting
  async function connect() {
    const gen = ++generation;
    retryTimer = null;
    clearConnection();
    closeSocket();
    store.setConnection(attempt === 0 ? "connecting" : "reconnecting");
    // A retry keeps the warning tone, so the notice does not flicker back to calm between attempts
    if (attempt === 0) store.setNotice(notices.connecting);
    else store.setNotice(notices.connectionLost, "warning");

    let url: string;
    try {
      url = (await deps.negotiate(groups)).url;
    } catch {
      if (!current(gen)) return;
      failed(gen, notices.unreachable);
      return;
    }
    if (!current(gen)) return;

    const ws = new deps.WebSocketImpl(url, SUBPROTOCOL);
    socket = ws;
    let connected = false;

    ws.onmessage = (event) => {
      if (!current(gen)) return;
      handle(gen, event.data, () => {
        connected = true;
      });
    };
    ws.onerror = () => {
      // The browser gives no detail; onclose follows and decides what to say
    };
    ws.onclose = () => {
      if (!current(gen)) return;
      socket = null;
      clearConnection();
      store.flush(); // so the phase below is the latest
      if (store.getState().scoreboard.phase === "full_time") {
        finish();
        return;
      }
      failed(gen, connected ? notices.connectionLost : notices.unreachable);
    };
  }

  /** The attempt failed or the connection dropped: say so and try again later. */
  function failed(gen: number, text: string) {
    if (!current(gen)) return;
    store.setConnection("reconnecting");
    store.setNotice(text, "warning");
    retryTimer = setTimeout(connect, retryDelay(attempt, deps.random));
    attempt++;
  }

  function finish() {
    store.setConnection("finished");
    store.setNotice(notices.finished);
  }

  // ---- messages
  function handle(gen: number, data: unknown, onConnected: () => void) {
    let message: unknown;
    try {
      message = typeof data === "string" ? JSON.parse(data) : null;
    } catch {
      // Not JSON: let the store count it as a rejected message
      store.ingestRaw(data, deps.now());
      return;
    }
    if (!message || typeof message !== "object") {
      store.ingestRaw(message, deps.now());
      return;
    }
    const m = message as Record<string, unknown>;

    if (m.type === "system" && m.event === "connected") {
      onConnected();
      void catchUp(gen);
    } else if (m.type === "ack" && typeof m.ackId === "number") {
      acks.get(m.ackId)?.(m.success === true);
    } else if (m.type === "message" && m.from === "group" && m.dataType === "json") {
      const at = deps.now();
      if (loading) buffer.push({ raw: m.data, at });
      else store.ingestRaw(m.data, at);
    }
    // Anything else (other system events, server messages) is not for the screen
  }

  /** Asks the server to put us in the match group and resolves when it says yes (or after ACK_TIMEOUT_MS). */
  function join(gen: number): Promise<void> {
    const ws = socket;
    if (!ws || ws.readyState !== OPEN) return Promise.resolve();
    return Promise.all(
      groups.map(
        (group) =>
          new Promise<void>((resolve) => {
            const ackId = nextAckId++;
            const timer = setTimeout(() => {
              acks.delete(ackId);
              resolve();
            }, ACK_TIMEOUT_MS);
            acks.set(ackId, (ok) => {
              clearTimeout(timer);
              acks.delete(ackId);
              if (!ok && current(gen)) console.warn(`Could not join group ${group}`);
              resolve();
            });
            ws.send(JSON.stringify({ type: "joinGroup", group, ackId }));
          }),
      ),
    ).then(() => undefined);
  }

  /**
   * On a new connection: start from a clean store, join the group, then read the snapshot while holding back live
   * messages, and merge the two by seq. Snapshot rows are history (received = null); a message that is in both is
   * kept as live. If the snapshot cannot be read, carry on with live messages only.
   */
  async function catchUp(gen: number) {
    store.reset();
    store.setConnection("live");
    store.setNotice(notices.loadingHistory);
    attempt = 0;
    loading = true;
    buffer = [];
    const ws = socket;

    // Join first, then snapshot: anything published after the join is buffered, anything before it is in the snapshot
    await join(gen);
    if (!current(gen) || socket !== ws) return; // stopped, replaced, or the connection dropped while joining

    const controller = new AbortController();
    snapshotAbort = controller;
    const entries = new Map<number, Entry>();
    let historyLoaded = false;
    try {
      const snapshot = await deps.getSnapshot(store.matchId, controller.signal);
      if (!current(gen) || controller.signal.aborted) return;
      store.setSetup(snapshot.setup);
      store.addRejected(snapshot.rejected.count);
      for (const sample of snapshot.rejected.samples) console.warn(sample);
      for (const envelope of snapshot.envelopes) entries.set(envelope.seq, { envelope, received: null });
      historyLoaded = true;
    } catch (error) {
      // Aborted means the connection was closed or stopped while loading: nothing left to do
      if (!current(gen) || controller.signal.aborted) return;
      console.warn(error);
    }

    // Live messages that arrived while loading win over the snapshot's copy of the same seq
    for (const { raw, at } of buffer) {
      const result = parseEnvelope(raw);
      if (result.ok) entries.set(result.envelope.seq, { envelope: result.envelope, received: at });
      else store.ingestRaw(raw, at); // counted and logged as a rejection
    }
    buffer = [];
    loading = false;
    snapshotAbort = null;

    for (const { envelope, received } of [...entries.values()].sort((a, b) => a.envelope.seq - b.envelope.seq)) {
      store.ingest(envelope, received);
    }
    if (historyLoaded) store.setNotice(notices.connected);
    else store.setNotice(notices.historyUnavailable, "warning");
    store.flush();
  }

  // ---- lifecycle
  function onStoreChange() {
    // At full time there is nothing more to stream: say so even while the connection is still open
    const { scoreboard, connection } = store.getState();
    if (scoreboard.phase === "full_time" && connection.status !== "finished") finish();
  }

  return {
    start() {
      if (running) return;
      running = true;
      attempt = 0;
      unsubscribe = store.subscribe(onStoreChange);
      tickTimer = setInterval(() => store.tick(deps.now()), TICK_MS);
      void connect();
    },

    stop() {
      running = false;
      generation++; // every callback of the old connection is now ignored
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      if (tickTimer !== null) clearInterval(tickTimer);
      tickTimer = null;
      unsubscribe?.();
      unsubscribe = null;
      clearConnection();
      closeSocket();
    },
  };
}
