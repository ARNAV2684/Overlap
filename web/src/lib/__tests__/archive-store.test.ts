import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createArchiveStore, parseTrackingFile, trackingBlobName } from "@/lib/server/archive-store";

const frame = (match_ms: number) => ({ match_id: "SYN-0505", period: 1, period_ms: match_ms, match_ms });
const ndjson = (...frames: object[]) => frames.map((f) => `${JSON.stringify(f)}\n`).join("");

describe("trackingBlobName", () => {
  it("matches the archiver's file names: p<period>/m<3-digit minute>", () => {
    expect(trackingBlobName("SYN-0505", 1, 0)).toBe("SYN-0505/p1/m000.ndjson.gz");
    expect(trackingBlobName("SYN-0505", 2, 47)).toBe("SYN-0505/p2/m047.ndjson.gz");
  });
});

describe("parseTrackingFile", () => {
  it("reads every gzip member of a file written batch by batch, keeping repeats for the caller", () => {
    const file = Buffer.concat([
      gzipSync(ndjson(frame(1000), frame(1200))),
      gzipSync(ndjson(frame(1200), frame(1400))),
    ]);
    const { frames, unreadable } = parseTrackingFile(file);
    expect(frames.map((f) => (f as { match_ms: number }).match_ms)).toEqual([1000, 1200, 1200, 1400]);
    expect(unreadable).toBe(0);
  });

  it("counts lines that are not JSON instead of losing the minute", () => {
    const { frames, unreadable } = parseTrackingFile(gzipSync(`${ndjson(frame(1000))}{broken\n\n${ndjson(frame(1200))}`));
    expect(frames).toHaveLength(2);
    expect(unreadable).toBe(1);
  });

  it("throws on a file that is not gzip, which the store reports as a storage failure", () => {
    expect(() => parseTrackingFile(Buffer.from("not gzip"))).toThrow();
  });
});

describe("createArchiveStore", () => {
  it("makes no network call when created", () => {
    const store = createArchiveStore({
      cosmos: { endpoint: "http://localhost:1", database: "live", key: "emulator-key-for-tests" },
      blob: { kind: "connection-string", connectionString: "UseDevelopmentStorage=true" },
    });
    expect(Object.keys(store).sort()).toEqual(
      ["eventSeqs", "events", "goals", "match", "panels", "periodMarkers", "trackingFile"].sort(),
    );
  });

  it("turns an unreachable archive into an ArchiveStoreError that names the operation only", async () => {
    const store = createArchiveStore({
      // Port 1 refuses connections at once, so this fails fast without a running emulator
      cosmos: { endpoint: "http://127.0.0.1:1", database: "live", key: "emulator-key-for-tests" },
      blob: { kind: "connection-string", connectionString: "UseDevelopmentStorage=true" },
    });
    // The exact message proves no setting or key is in it
    await expect(store.match("SYN-0505")).rejects.toMatchObject({
      name: "ArchiveStoreError",
      message: "Match archive read failed: match document",
    });
  }, 20_000);
});
