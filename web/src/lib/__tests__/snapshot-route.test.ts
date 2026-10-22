import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScreenDoc } from "@/lib/snapshot";
import type { ScreenStore } from "@/lib/server/screen-store";
import type { ScreenSettings, StreamEnvResult } from "@/lib/server/stream-env";

// The route reads its settings and storage through these two modules; the tests swap in fakes
const fakes = vi.hoisted(() => ({
  env: null as StreamEnvResult<ScreenSettings> | null,
  store: null as ScreenStore | null,
}));
vi.mock("@/lib/server/stream-env", async (original) => ({
  ...(await original<typeof import("@/lib/server/stream-env")>()),
  readScreenEnv: () => fakes.env,
}));
vi.mock("@/lib/server/screen-store", async (original) => ({
  ...(await original<typeof import("@/lib/server/screen-store")>()),
  createScreenStore: () => fakes.store,
}));
// The real store module is still loaded (for ScreenStoreError); stubbing the SDKs keeps each fresh load fast
vi.mock("@azure/cosmos", () => ({ CosmosClient: class {} }));
vi.mock("@azure/identity", () => ({ DefaultAzureCredential: class {} }));

const SECRET = "emulator-key-for-tests";
const MATCH = "SYN-0042";
const STATUS = { seq: 1, kind: "status", match_id: MATCH, match_ms: 0, clock: "0:00", data: { phase: "pre_match" } };
const DOCS: ScreenDoc[] = [
  { id: "state", type: "state", setup: { match_id: MATCH } },
  { id: "env-00000001", type: "envelope", envelope: STATUS },
];

function fakeStore(docs: ScreenDoc[] | "fail" | "other") {
  const calls: string[] = [];
  return {
    calls,
    store: {
      matchDocs: async (matchId: string) => {
        calls.push(matchId);
        if (docs === "fail") throw new (await import("@/lib/server/screen-store")).ScreenStoreError("match documents");
        if (docs === "other") throw new TypeError(`bad ${SECRET}`);
        return docs;
      },
    } satisfies ScreenStore,
  };
}

async function get(id: string) {
  vi.resetModules();
  const route = await import("@/app/api/match/[id]/snapshot/route");
  const response = await route.GET(new Request(`http://localhost:3000/api/match/${id}/snapshot`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
}

const logs: string[] = [];
beforeEach(() => {
  fakes.env = {
    ok: true,
    settings: { endpoint: "http://localhost:8081", database: "live", key: SECRET, container: "screen" },
  };
  fakes.store = fakeStore(DOCS).store;
  logs.length = 0;
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/match/<id>/snapshot", () => {
  it("returns the §7.3 snapshot uncached, with one log line", async () => {
    const fake = fakeStore(DOCS);
    fakes.store = fake.store;
    expect(await get(MATCH)).toEqual({
      status: 200,
      cache: "no-store",
      body: { match_id: MATCH, setup: { match_id: MATCH }, status: STATUS, envelopes: [STATUS], rejected: { count: 0, samples: [] } },
    });
    expect(fake.calls).toEqual([MATCH]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^snapshot SYN-0042: 1 envelopes, 0 rejected, \d+ ms$/);
  });

  it("answers 400 bad_match_id before reading any setting", async () => {
    fakes.env = null;
    expect(await get("SYN-42")).toEqual({ status: 400, cache: "no-store", body: { error: "bad_match_id" } });
  });

  it("answers 404 unknown_match and 503 setup_pending as the stand-in does", async () => {
    fakes.store = fakeStore([]).store;
    expect(await get(MATCH)).toEqual({ status: 404, cache: "no-store", body: { error: "unknown_match" } });
    fakes.store = fakeStore([{ id: "state", type: "state" }]).store;
    expect(await get(MATCH)).toEqual({ status: 503, cache: "no-store", body: { error: "setup_pending" } });
  });

  it("answers 503 snapshot_unavailable without settings, naming them in one log line", async () => {
    fakes.env = { ok: false, problems: [{ name: "OVERLAP_COSMOS_ENDPOINT", problem: "missing" }] };
    expect(await get(MATCH)).toEqual({ status: 503, cache: "no-store", body: { error: "snapshot_unavailable" } });
    expect(logs).toEqual(["The snapshot is unavailable: set OVERLAP_COSMOS_ENDPOINT (missing). See web/.env.example."]);
  });

  it("answers 502 storage_error when Cosmos fails, logging the operation only", async () => {
    fakes.store = fakeStore("fail").store;
    expect(await get(MATCH)).toEqual({ status: 502, cache: "no-store", body: { error: "storage_error" } });
    expect(logs).toEqual(["snapshot SYN-0042: Screen store read failed: match documents"]);
  });

  it("answers 500 internal_error otherwise and never logs the error's text", async () => {
    fakes.store = fakeStore("other").store;
    expect(await get(MATCH)).toEqual({ status: 500, cache: "no-store", body: { error: "internal_error" } });
    expect(logs).toEqual(["snapshot SYN-0042: unexpected TypeError"]);
    expect(logs.join(" ")).not.toContain(SECRET);
  });
});
