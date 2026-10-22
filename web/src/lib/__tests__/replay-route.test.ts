import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchiveEnvResult } from "@/lib/server/archive-env";
import type { ArchiveStore } from "@/lib/server/archive-store";
import { fakeArchiveStore, frameAt, P1_END, P2_END, STORED_MATCH, storedPanel } from "./replay-fixtures";

// The route reads its settings and storage through these two modules; the tests swap in fakes
const fakes = vi.hoisted(() => ({
  env: null as ArchiveEnvResult | null,
  store: null as ArchiveStore | null,
}));
vi.mock("@/lib/server/archive-env", async (original) => ({
  ...(await original<typeof import("@/lib/server/archive-env")>()),
  readArchiveEnv: () => fakes.env,
}));
vi.mock("@/lib/server/archive-store", async (original) => ({
  ...(await original<typeof import("@/lib/server/archive-store")>()),
  createArchiveStore: () => fakes.store,
}));
// The real store module is still loaded (for ArchiveStoreError); stubbing the SDKs keeps each fresh load fast
vi.mock("@azure/cosmos", () => ({ CosmosClient: class {} }));
vi.mock("@azure/identity", () => ({ DefaultAzureCredential: class {} }));
vi.mock("@azure/storage-blob", () => ({ BlobServiceClient: class {}, RestError: class extends Error {} }));

const SECRET = "emulator-key-for-tests";
const SETTINGS: ArchiveEnvResult = {
  ok: true,
  settings: {
    cosmos: { endpoint: "http://localhost:8081", database: "live", key: SECRET },
    blob: { kind: "connection-string", connectionString: "UseDevelopmentStorage=true" },
  },
};

/** A fresh route module per test, so its in-memory caches start empty. */
async function load() {
  vi.resetModules();
  const route = await import("@/app/api/replay/[id]/route");
  const { ArchiveStoreError } = await import("@/lib/server/archive-store");
  const get = async (id: string, query = "") => {
    const response = await route.GET(new Request(`http://localhost/api/replay/${id}${query}`), {
      params: Promise.resolve({ id }),
    });
    return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
  };
  return { get, ArchiveStoreError };
}

const logs: string[] = [];
beforeEach(() => {
  fakes.env = SETTINGS;
  fakes.store = fakeArchiveStore();
  logs.length = 0;
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/replay/<id>: manifest and chunks", () => {
  it("answers the manifest, cacheable, and logs one line", async () => {
    const { get } = await load();
    const { status, cache, body } = await get("SYN-0042");
    expect(status).toBe(200);
    expect(cache).toBe("private, max-age=3600");
    expect(body).toMatchObject({ match_id: "SYN-0042", status: "finished", result: STORED_MATCH.result, gaps: [] });
    expect(body.chunks).toHaveLength(5);
    expect(logs).toEqual([expect.stringMatching(/^replay SYN-0042 manifest: 5 chunks, \d+ ms$/)]);
  });

  it("answers a chunk with its envelopes and counts in the log", async () => {
    fakes.store = fakeArchiveStore({ tracking: { "p1/m1": { frames: [frameAt(1, 60_000), frameAt(1, 60_200)], unreadable: 0 } } });
    const { get } = await load();
    const { status, body } = await get("SYN-0042", "?chunk=1");
    expect(status).toBe(200);
    expect(body.chunk).toBe(1);
    expect(body.rejected).toEqual({ count: 0, samples: [] });
    expect(body.envelopes.map((e: { kind: string }) => e.kind)).toEqual(["positions", "event", "status"]);
    expect(logs.at(-1)).toMatch(/^replay SYN-0042 chunk 1: 1 events, 2 frames, 0 panels, 0 rejected, \d+ ms$/);
  });

  it("serves each half's last panel, stamped just after the whistle, in that half's last chunk", async () => {
    // As the stats engine sends them: the next whole second after each PeriodEnd
    fakes.store = fakeArchiveStore({ panels: [storedPanel(1, 120_000), storedPanel(1, P1_END + 600), storedPanel(2, P2_END + 400)] });
    const { get } = await load();
    const kinds = async (chunk: number) =>
      (await get("SYN-0042", `?chunk=${chunk}`)).body.envelopes.map((e: { kind: string; match_ms: number }) => `${e.kind}@${e.match_ms}`);
    expect(await kinds(2)).toEqual(["stats@120000", "event@125000", "status@125000", `stats@${P1_END + 600}`]);
    expect((await kinds(4)).at(-1)).toBe(`stats@${P1_END + P2_END + 400}`);
  });

  it("reads a match's index once, then serves its chunks from memory", async () => {
    const store = fakeArchiveStore();
    fakes.store = store;
    const { get } = await load();
    await get("SYN-0042");
    await get("SYN-0042", "?chunk=0");
    await get("SYN-0042", "?chunk=4");
    expect(store.calls.filter((c) => c === "match")).toHaveLength(1);
    expect(store.calls.filter((c) => c === "periodMarkers")).toHaveLength(1);
  });
});

describe("GET /api/replay/<id>: errors (AC-04)", () => {
  it("rejects a malformed id before touching storage", async () => {
    const store = fakeArchiveStore();
    fakes.store = store;
    const { get } = await load();
    for (const id of ["SYN-42", "syn-0042", "SYN-0042x"]) {
      expect(await get(id)).toMatchObject({ status: 400, cache: "no-store", body: { error: "bad_match_id" } });
    }
    expect(store.calls).toEqual([]);
  });

  it("rejects a chunk that isn't a whole number within the match", async () => {
    const { get } = await load();
    for (const query of ["?chunk=abc", "?chunk=-1", "?chunk=1.5", "?chunk=", "?chunk=5", "?chunk=99"]) {
      expect(await get("SYN-0042", query)).toMatchObject({ status: 400, body: { error: "bad_chunk" } });
    }
  });

  it("answers 404 not_found, 503 not_ready and 409 not_finished from the match document", async () => {
    fakes.store = fakeArchiveStore({ match: null });
    expect(await (await load()).get("SYN-0042")).toMatchObject({ status: 404, body: { error: "not_found" } });

    const notReady = fakeArchiveStore({ match: { ...STORED_MATCH, setup: undefined } });
    fakes.store = notReady;
    expect(await (await load()).get("SYN-0042")).toMatchObject({ status: 503, body: { error: "not_ready" } });

    const live = fakeArchiveStore({ match: { ...STORED_MATCH, status: "live" } });
    fakes.store = live;
    expect(await (await load()).get("SYN-0042")).toMatchObject({ status: 409, body: { error: "not_finished" } });
    // Neither reads any events
    expect([...notReady.calls, ...live.calls]).toEqual(["match", "match"]);
  });

  it("answers 500 archive_invalid for a stored match it can't trust, logging the reason", async () => {
    fakes.store = fakeArchiveStore({ match: { ...STORED_MATCH, result: undefined } });
    const { get } = await load();
    expect(await get("SYN-0042")).toMatchObject({ status: 500, body: { error: "archive_invalid" } });
    expect(logs).toContainEqual(expect.stringContaining("archive_invalid: the stored result is missing or malformed"));
  });

  it("answers 503 replay_unavailable without settings, naming them in the log only", async () => {
    fakes.env = { ok: false, problems: [{ name: "OVERLAP_COSMOS_ENDPOINT", problem: "missing" }] };
    const { get } = await load();
    expect(await get("SYN-0042")).toEqual({ status: 503, cache: "no-store", body: { error: "replay_unavailable" } });
    expect(logs).toEqual([expect.stringContaining("OVERLAP_COSMOS_ENDPOINT (missing)")]);
  });

  it("answers 502 storage_error when the archive fails, without settings in the body or the log", async () => {
    // The error class must come from the same module load as the route; the store is created on its first request
    const { get, ArchiveStoreError } = await load();
    fakes.store = { ...fakeArchiveStore(), match: () => Promise.reject(new ArchiveStoreError("match document")) };
    expect(await get("SYN-0042")).toEqual({ status: 502, cache: "no-store", body: { error: "storage_error" } });
    expect(logs).toEqual(["replay SYN-0042: Match archive read failed: match document"]);
    expect(logs.join(" ")).not.toContain(SECRET);
  });

  it("answers 500 internal_error for anything else, logging only the error's type", async () => {
    fakes.store = { ...fakeArchiveStore(), match: () => Promise.reject(new TypeError(`boom ${SECRET}`)) };
    const { get } = await load();
    expect(await get("SYN-0042")).toMatchObject({ status: 500, body: { error: "internal_error" } });
    expect(logs).toEqual(["replay SYN-0042: unexpected TypeError"]);
  });
});
