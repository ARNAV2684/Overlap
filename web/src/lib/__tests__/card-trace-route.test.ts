import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamEnvResult, ScreenSettings } from "@/lib/server/stream-env";
import type { JobsStore } from "@/lib/server/jobs-store";

// The route reads its settings and storage through these two modules; the tests swap in fakes
const fakes = vi.hoisted(() => ({
  env: null as StreamEnvResult<ScreenSettings> | null,
  store: null as JobsStore | null,
}));
vi.mock("@/lib/server/stream-env", async (original) => ({
  ...(await original<typeof import("@/lib/server/stream-env")>()),
  readScreenEnv: () => fakes.env,
}));
vi.mock("@/lib/server/jobs-store", async (original) => ({
  ...(await original<typeof import("@/lib/server/jobs-store")>()),
  createJobsStore: () => fakes.store,
}));
vi.mock("@azure/cosmos", () => ({ CosmosClient: class {} }));
vi.mock("@azure/identity", () => ({ DefaultAzureCredential: class {} }));

const OK: StreamEnvResult<ScreenSettings> = {
  ok: true,
  settings: { endpoint: "http://localhost:8081", database: "live", key: "emulator-key-for-tests", container: "screen" },
};
const JOB = {
  moment_id: "MO-3013-0006",
  match_id: "SYN-3013",
  state: "published",
  stage_outputs: { spotter: { decision: "admit", trigger: "goal", duration_ms: 500, calls: [] } },
};

async function get(id: string, moment: string) {
  vi.resetModules();
  const { GET } = await import("@/app/api/match/[id]/moments/[moment]/trace/route");
  const res = await GET(new Request(`http://x/api/match/${id}/moments/${moment}/trace`), { params: Promise.resolve({ id, moment }) });
  return { status: res.status, body: await res.json(), cache: res.headers.get("Cache-Control") };
}

describe("GET /api/match/<id>/moments/<moment>/trace", () => {
  beforeEach(() => {
    fakes.env = OK;
    fakes.store = { job: async () => JOB };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("answers with the card's trace, never cached", async () => {
    const r = await get("SYN-3013", "MO-3013-0006");
    expect(r.status).toBe(200);
    expect(r.cache).toBe("no-store");
    expect(r.body).toMatchObject({ moment_id: "MO-3013-0006", trigger: "goal", steps: [{ agent: "spotter" }] });
  });

  it("refuses ids that are not this match's", async () => {
    expect((await get("nope", "MO-3013-0006")).body).toEqual({ error: "bad_match_id" });
    expect((await get("SYN-3013", "MO-3012-0001")).status).toBe(400);
  });

  it("says when there is no record, when settings are missing, and when storage fails", async () => {
    fakes.store = { job: async () => null };
    expect((await get("SYN-3013", "RC-3013")).body).toEqual({ error: "trace_not_found" });
    fakes.env = { ok: false, problems: [{ name: "OVERLAP_COSMOS_ENDPOINT", problem: "missing" }] };
    expect((await get("SYN-3013", "RC-3013")).status).toBe(503);
    fakes.env = OK;
    fakes.store = {
      job: async () => {
        throw new Error("boom emulator-key-for-tests");
      },
    };
    const r = await get("SYN-3013", "RC-3013");
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain("emulator-key");
  });
});
