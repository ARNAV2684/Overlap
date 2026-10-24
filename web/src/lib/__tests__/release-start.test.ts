import { describe, expect, it } from "vitest";
import { admitStart, ControlBusy, initialControl, type ControlState, type ControlStore } from "../server/start-control";
import { readStartEnv, type JobStarter } from "../server/start-match";

class SharedBlob {
  state = initialControl();
  busy = false;
  writes = 0;
  failWrite = 0;
  client(): ControlStore {
    return {
      available: async () => true,
      exclusive: async (work) => {
        if (this.busy) throw new ControlBusy();
        this.busy = true;
        try {
          return await work({ state: structuredClone(this.state), save: async (state: ControlState) => {
            if (++this.writes === this.failWrite) throw new Error("lost lease");
            this.state = structuredClone(state);
          } });
        } finally { this.busy = false; }
      },
    };
  }
}
function job() {
  const numbers: number[] = [];
  let outcome: "active" | "terminal" | "unknown" = "active";
  const starter: JobStarter = {
    available: async () => true, running: async () => false,
    execution: async () => outcome,
    start: async (number) => { numbers.push(number); await Promise.resolve(); return `run-${number}`; },
  };
  return { starter, numbers, end: () => { outcome = "terminal"; }, unknown: () => { outcome = "unknown"; } };
}
const archive = async () => ["SYN-3005"];

describe("durable start admission", () => {
  it("two replicas and simultaneous requests start exactly one execution", async () => {
    const shared = new SharedBlob(), j = job();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      admitStart(shared.client(), j.starter, archive, `v${i}`, () => 1000)));
    expect(j.numbers).toEqual([3006]);
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(shared.state.pending?.execution).toBe("run-3006");
  });
  it("does not start if reservation persistence fails", async () => {
    const shared = new SharedBlob(), j = job(); shared.failWrite = 1;
    expect((await admitStart(shared.client(), j.starter, archive, "v")).status).toBe(503);
    expect(j.numbers).toEqual([]);
  });
  it("a lost ARM response blocks retries even after the web process restarts", async () => {
    const shared = new SharedBlob(), j = job();
    j.starter.start = async (n) => { j.numbers.push(n); throw new Error("response lost after acceptance"); };
    expect((await admitStart(shared.client(), j.starter, archive, "v")).body.error).toBe("start_pending");
    expect((await admitStart(shared.client(), job().starter, archive, "other")).body.error).toBe("start_pending");
    expect(j.numbers).toHaveLength(1);
  });
  it("a lost save after ARM accepts keeps the earlier reservation", async () => {
    const shared = new SharedBlob(), j = job(); shared.failWrite = 2;
    expect((await admitStart(shared.client(), j.starter, archive, "v")).body.error).toBe("start_pending");
    expect(shared.state.pending?.execution).toBeUndefined();
    await admitStart(shared.client(), j.starter, archive, "other");
    expect(j.numbers).toHaveLength(1);
  });
  it("requires a terminal execution before clearing a known reservation", async () => {
    const shared = new SharedBlob(), j = job();
    await admitStart(shared.client(), j.starter, archive, "v");
    j.unknown();
    expect((await admitStart(shared.client(), j.starter, archive, "v")).status).toBe(409);
    j.end();
    expect((await admitStart(shared.client(), j.starter, archive, "v")).status).toBe(202);
    expect(j.numbers).toEqual([3006, 3007]); // archive still hasn't caught up
  });
  it("persists visitor limits and a global cap across fresh clients", async () => {
    const shared = new SharedBlob(), j = job(); j.end();
    for (let n = 0; n < 3; n++) expect((await admitStart(shared.client(), j.starter, archive, "v", () => 1000)).status).toBe(202);
    expect((await admitStart(shared.client(), j.starter, archive, "v", () => 1000)).status).toBe(429);
    for (let n = 0; n < 3; n++) expect((await admitStart(shared.client(), j.starter, archive, `other${n}`, () => 1000)).status).toBe(202);
    expect((await admitStart(shared.client(), j.starter, archive, "rotated", () => 1000)).status).toBe(429);
    expect((await admitStart(shared.client(), j.starter, archive, "v", () => 3_602_000)).status).toBe(202);
  });
  it("requires explicit live enablement, even if the job id is still configured", () => {
    const env = { OVERLAP_GENERATOR_JOB_ID: "/subscriptions/s/resourceGroups/r/providers/Microsoft.App/jobs/j" };
    expect(readStartEnv(env)).toBeNull();
    expect(readStartEnv({ ...env, OVERLAP_LIVE_ENABLED: "false" })).toBeNull();
    expect(readStartEnv({ ...env, OVERLAP_LIVE_ENABLED: "true" })).not.toBeNull();
  });
});

// Opt-in, fixed loopback port: this test cannot use an Azure account by accident.
it.skipIf(process.env.OVERLAP_LEASE_TEST !== "1")("real Azurite leases serialize independent clients and retain state", async () => {
  const { BlobServiceClient } = await import("@azure/storage-blob");
  const { createControlStore } = await import("../server/start-control");
  // Public Azurite development credential, not an account secret.
  const connectionString = "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
    "BlobEndpoint=http://127.0.0.1:10040/devstoreaccount1;";
  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient("match-control");
  await container.create(); // fails if this is not a fresh isolated test instance
  const settings = { kind: "connection-string" as const, connectionString };
  const j = job();
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    admitStart(createControlStore(settings), j.starter, archive, `v${i}`)));
  expect(results.filter((r) => r.status === 202)).toHaveLength(1);
  expect(j.numbers).toEqual([3006]);
  expect(results.filter((r) => r.status !== 202).every((r) => r.status === 409)).toBe(true);
  expect((await admitStart(createControlStore(settings), j.starter, archive, "restart")).status).toBe(409);
  j.end();
  expect((await admitStart(createControlStore(settings), j.starter, archive, "restart")).status).toBe(202);
  expect(j.numbers).toEqual([3006, 3007]);
  const raw = JSON.parse((await container.getBlockBlobClient("starts.json").downloadToBuffer()).toString());
  expect(raw.lastNumber).toBe(3007);
  expect(raw.attempts).toHaveLength(2);
}, 30_000);
