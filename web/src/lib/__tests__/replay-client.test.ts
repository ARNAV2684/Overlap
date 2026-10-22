import { describe, expect, it } from "vitest";
import { createReplayClient, ReplayError } from "@/lib/replay-client";
import { buildReplayChunk, buildReplayIndex } from "@/lib/replay-envelopes";
import { STORED_EVENTS, STORED_MATCH } from "./replay-fixtures";

const built = buildReplayIndex(
  STORED_MATCH,
  STORED_EVENTS.filter((e) => e.type === "PeriodStart" || e.type === "PeriodEnd"),
  STORED_EVENTS.filter((e) => e.type === "Shot"),
  STORED_EVENTS.map((e) => e.seq as number),
);
if (!built.ok) throw new Error("fixture index failed");
const MANIFEST = built.index.manifest;
const CHUNK0 = buildReplayChunk(built.index, MANIFEST.chunks[0], {
  events: STORED_EVENTS.filter((e) => e.period === 1 && (e.period_ms as number) < 60_000),
  panels: [],
  tracking: null,
});

/** A fetch that answers with this status and body, recording the URLs asked for. */
function answering(status: number, body: unknown, urls: string[] = []): typeof fetch {
  return (input) => {
    urls.push(String(input));
    return Promise.resolve(Response.json(body, { status }));
  };
}

const failure = (promise: Promise<unknown>) => promise.then(() => null, (error: unknown) => error as ReplayError);

describe("replay client: manifest", () => {
  it("asks this app's own route and returns the checked manifest", async () => {
    const urls: string[] = [];
    const client = createReplayClient({ fetch: answering(200, MANIFEST, urls) });
    expect(await client.manifest("SYN-0042")).toEqual(MANIFEST);
    expect(urls).toEqual(["/api/replay/SYN-0042"]);
  });

  it("turns the route's error status and code into a ReplayError", async () => {
    const client = createReplayClient({ fetch: answering(409, { error: "not_finished" }) });
    expect(await failure(client.manifest("SYN-0042"))).toMatchObject({
      name: "ReplayError",
      kind: "http",
      status: 409,
      code: "not_finished",
    });
  });

  it("calls a body of the wrong shape, or another match's manifest, an invalid response", async () => {
    const wrong = createReplayClient({ fetch: answering(200, { ...MANIFEST, chunks: [] }) });
    expect(await failure(wrong.manifest("SYN-0042"))).toMatchObject({ kind: "invalid-response" });
    const other = createReplayClient({ fetch: answering(200, MANIFEST) });
    expect(await failure(other.manifest("SYN-0043"))).toMatchObject({ kind: "invalid-response" });
  });

  it("reports a network failure, a timeout and a cancel as different kinds", async () => {
    const down = createReplayClient({ fetch: () => Promise.reject(new TypeError("fetch failed")) });
    expect(await failure(down.manifest("SYN-0042"))).toMatchObject({ kind: "network" });

    // A fetch that only ends when its signal aborts
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const slow = createReplayClient({ fetch: hanging, timeoutMs: 20 });
    expect(await failure(slow.manifest("SYN-0042"))).toMatchObject({ kind: "timeout" });

    const controller = new AbortController();
    const cancelled = failure(createReplayClient({ fetch: hanging }).manifest("SYN-0042", controller.signal));
    controller.abort();
    expect(await cancelled).toMatchObject({ kind: "aborted" });
  });
});

describe("replay client: chunks", () => {
  it("asks for the chunk by index and checks every envelope again", async () => {
    const urls: string[] = [];
    const client = createReplayClient({ fetch: answering(200, CHUNK0, urls) });
    const data = await client.chunk("SYN-0042", 0);
    expect(urls).toEqual(["/api/replay/SYN-0042?chunk=0"]);
    expect(data.envelopes).toEqual(CHUNK0.envelopes);
    expect(data.rejected).toEqual({ count: 0, samples: [] });
  });

  it("counts an envelope the browser rejects together with the route's own rejections", async () => {
    const broken = { ...CHUNK0.envelopes[1], data: { ...CHUNK0.envelopes[1].data, sneaky: true } };
    const body = { ...CHUNK0, envelopes: [CHUNK0.envelopes[0], broken], rejected: { count: 1, samples: ["route said so"] } };
    const data = await createReplayClient({ fetch: answering(200, body) }).chunk("SYN-0042", 0);
    expect(data.envelopes).toHaveLength(1);
    expect(data.rejected.count).toBe(2);
    expect(data.rejected.samples[0]).toBe("route said so");
    expect(data.rejected.samples[1]).toMatch(/sneaky|Unrecognized/i);
  });

  it("refuses a chunk other than the one asked for", async () => {
    const client = createReplayClient({ fetch: answering(200, { ...CHUNK0, chunk: 3 }) });
    expect(await failure(client.chunk("SYN-0042", 0))).toMatchObject({ kind: "invalid-response" });
  });
});
