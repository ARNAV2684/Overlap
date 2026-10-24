import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: true, jobAvailable: true, storageAvailable: true, starts: 0 }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/server/archive-env", () => ({ readArchiveEnv: () => ({ ok: true, settings: { blob: {} } }) }));
vi.mock("@/lib/server/archive-store", () => ({ highestArchivedMatchId: async () => null }));
vi.mock("@/lib/server/start-match", () => ({
  readStartEnv: () => mocks.enabled ? { jobId: "j" } : null,
  createJobStarter: () => ({ available: async () => mocks.jobAvailable }),
}));
vi.mock("@/lib/server/start-control", () => ({
  createControlStore: () => ({ available: async () => mocks.storageAvailable }), visitorKey: () => "visitor",
  admitStart: async () => { mocks.starts++; return { status: 202, body: { match_id: "SYN-3000" } }; },
}));
import { GET, POST } from "@/app/api/start-match/route";

beforeEach(() => Object.assign(mocks, { enabled: true, jobAvailable: true, storageAvailable: true, starts: 0 }));
describe("live availability", () => {
  it("paused GET never advertises start; POST also refuses", async () => {
    mocks.enabled = false;
    expect(await (await GET()).json()).toEqual({ available: false });
    expect((await POST(new Request("https://demo.test/api/start-match", { method: "POST" }))).status).toBe(503);
    expect(mocks.starts).toBe(0);
  });
  it("deleted job or missing coordination storage is unavailable before clicking", async () => {
    mocks.jobAvailable = false;
    expect(await (await GET()).json()).toEqual({ available: false });
    mocks.jobAvailable = true; mocks.storageAvailable = false;
    expect(await (await GET()).json()).toEqual({ available: false });
  });
  it("GET is read-only and uncached", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ available: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.starts).toBe(0);
  });
  it("rejects a cross-site start before accessing admission", async () => {
    const request = new Request("https://demo.test/api/start-match", { method: "POST", headers: { Origin: "https://other.test" } });
    expect((await POST(request)).status).toBe(403);
    expect(mocks.starts).toBe(0);
  });
});
