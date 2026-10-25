import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchiveEnvResult } from "@/lib/server/archive-env";
import type { MatchListStore, StoredDoc } from "@/lib/server/archive-store";

// The route reads its settings and storage through these two modules; the tests swap in fakes
const fakes = vi.hoisted(() => ({
  env: null as ArchiveEnvResult | null,
  store: null as MatchListStore | null,
}));
vi.mock("@/lib/server/archive-env", async (original) => ({
  ...(await original<typeof import("@/lib/server/archive-env")>()),
  readArchiveEnv: () => fakes.env,
}));
vi.mock("@/lib/server/archive-store", async (original) => ({
  ...(await original<typeof import("@/lib/server/archive-store")>()),
  createMatchListStore: () => fakes.store,
}));
// Outside a Next.js request there is no request scope; the route only calls it to stay dynamic
vi.mock("next/server", () => ({ connection: async () => {} }));
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

const row = (matchId: string, status: string, ts: number): StoredDoc => ({
  match_id: matchId,
  status,
  _ts: ts,
  home_id: "NBR",
  home_name: "Northbridge FC",
  away_id: "HBA",
  away_name: "Harbour Athletic",
  ...(status === "finished" ? { result: { score: { home: 2, away: 1 }, events: 2171 } } : {}),
});
const state = (clock: string): StoredDoc => ({ id: "state", phase: "live", period: 2, clock, score: { home: 1, away: 0 } });

/** An in-memory MatchListStore. `states` maps a match id to its document, null (none), or "fail". */
function fakeStore(rows: StoredDoc[] | "fail", states: Record<string, StoredDoc | null | "fail"> = {}) {
  const calls: string[] = [];
  return {
    calls,
    store: {
      recentMatches: async (limit: number) => {
        calls.push(`recentMatches ${limit}`);
        if (rows === "fail") throw new (await import("@/lib/server/archive-store")).ArchiveStoreError("match list");
        return rows;
      },
      matchState: async (matchId: string) => {
        calls.push(`matchState ${matchId}`);
        const value = states[matchId] ?? null;
        if (value === "fail") throw new (await import("@/lib/server/archive-store")).ArchiveStoreError("match state");
        return value;
      },
    } satisfies MatchListStore,
  };
}

async function get() {
  vi.resetModules();
  const route = await import("@/app/api/matches/route");
  const response = await route.GET();
  return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
}

const logs: string[] = [];
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(40_000); // these fixture timestamps are seconds after epoch
  fakes.env = SETTINGS;
  fakes.store = fakeStore([]).store;
  logs.length = 0;
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/matches", () => {
  it("lists live matches with their match_state and finished ones with their result, uncached and without a log", async () => {
    const fake = fakeStore([row("SYN-0504", "finished", 30), row("SYN-0505", "live", 20)], { "SYN-0505": state("62:14") });
    fakes.store = fake.store;
    const { status, cache, body } = await get();
    expect(status).toBe(200);
    expect(cache).toBe("no-store");
    expect(body.matches).toEqual([
      expect.objectContaining({ match_id: "SYN-0505", status: "live", phase: "live", score: { home: 1, away: 0 }, clock: "62:14" }),
      expect.objectContaining({ match_id: "SYN-0504", status: "finished", phase: "full_time", score: { home: 2, away: 1 }, clock: null }),
    ]);
    // 50 most recent; match_state only for the live match
    expect(fake.calls).toEqual(["recentMatches 50", "matchState SYN-0505"]);
    expect(logs).toEqual([]);
  });

  it("marks the finished matches named in OVERLAP_SHOWCASE_MATCH_IDS, read on every request", async () => {
    fakes.store = fakeStore([row("SYN-3013", "finished", 30), row("SYN-3012", "finished", 20)]).store;
    vi.stubEnv("OVERLAP_SHOWCASE_MATCH_IDS", "SYN-3012");
    const { body } = await get();
    expect(body.matches.map((m: { match_id: string; showcase?: boolean }) => [m.match_id, m.showcase ?? false])).toEqual([
      ["SYN-3013", false],
      ["SYN-3012", true],
    ]);
    vi.unstubAllEnvs();
    expect((await get()).body.matches.some((m: { showcase?: boolean }) => m.showcase)).toBe(false);
  });

  it("answers an empty archive with an empty list", async () => {
    expect(await get()).toMatchObject({ status: 200, body: { matches: [] } });
  });

  it("still lists a live match whose match_state read fails, without numbers, and logs its id only", async () => {
    fakes.store = fakeStore([row("SYN-0505", "live", 2), row("SYN-0506", "live", 1)], { "SYN-0505": "fail", "SYN-0506": state("10:00") }).store;
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.matches[0]).toMatchObject({ match_id: "SYN-0505", phase: null, score: null, clock: null });
    expect(body.matches[1]).toMatchObject({ match_id: "SYN-0506", clock: "10:00" });
    expect(logs).toEqual(["match list SYN-0505: match state read failed"]);
  });

  it("leaves out broken documents and logs how many, by id", async () => {
    fakes.store = fakeStore([row("SYN-0505", "live", 2), { match_id: "SYN-0001", status: "live", _ts: 1 }]).store;
    const { body } = await get();
    expect(body.matches.map((m: { match_id: string }) => m.match_id)).toEqual(["SYN-0505"]);
    expect(logs).toEqual(["match list: left out 1 documents (SYN-0001)"]);
  });
});

describe("GET /api/matches: errors", () => {
  it("answers 503 matches_unavailable without settings, naming them but no value", async () => {
    fakes.env = { ok: false, problems: [{ name: "OVERLAP_COSMOS_ENDPOINT", problem: "missing" }] };
    expect(await get()).toMatchObject({ status: 503, cache: "no-store", body: { error: "matches_unavailable" } });
    expect(logs).toEqual([
      "The match list is unavailable: set OVERLAP_COSMOS_ENDPOINT (missing). See web/.env.example.",
    ]);
  });

  it("answers 502 storage_error when the query fails, logging the operation only", async () => {
    fakes.store = fakeStore("fail").store;
    const { status, cache, body } = await get();
    expect({ status, cache, body }).toEqual({ status: 502, cache: "no-store", body: { error: "storage_error" } });
    expect(logs).toEqual(["match list: Match archive read failed: match list"]);
    expect(JSON.stringify({ body, logs })).not.toContain(SECRET);
  });

  it("answers 500 internal_error on anything else, logging only the error's type", async () => {
    fakes.store = {
      recentMatches: async () => {
        throw new TypeError(`boom with ${SECRET}`);
      },
      matchState: async () => null,
    };
    expect(await get()).toMatchObject({ status: 500, body: { error: "internal_error" } });
    expect(logs).toEqual(["match list: unexpected TypeError"]);
  });
});
