/** Opt-in acceptance using the actual local app, socket/store and archive replay API.
 * Start this BEFORE generator/cli.py live --hubs emulator --record. No producer is mocked here.
 * QA_VIEWER=1 QA_APP_URL=http://127.0.0.1:3018 QA_MATCH=SYN-8424
 * QA_RECORDING=/absolute/path/data/generated/matches/SYN-8424 npm test -- viewer-acceptance.qa
 * This is headless client acceptance, not pixel/browser or Azure evidence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api";
import { createMatchSocket } from "@/lib/socket";
import { createMatchStore } from "@/lib/store";
import { createReplayClient } from "@/lib/replay-client";
import type { ParsedEnvelope } from "@/lib/contracts";

const enabled = process.env.QA_VIEWER === "1";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>, timeout: number, message: string) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(message);
    await delay(250);
  }
}
function local(url: string) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Acceptance check permits loopback services only");
  }
}
const lines = (text: string) => text.split("\n").filter(Boolean).map((line) => JSON.parse(line));

describe.skipIf(!enabled)("local viewer-to-replay acceptance", () => {
  it("recovers two independent viewers and replays the generator's exact recording", async () => {
    const match = process.env.QA_MATCH ?? "";
    const recording = process.env.QA_RECORDING ?? "";
    expect(match).toMatch(/^SYN-\d{4}$/);
    expect(recording, "QA_RECORDING must point to this run's generator recording").not.toBe("");
    const base = process.env.QA_APP_URL ?? "http://127.0.0.1:3018";
    local(base);
    const api = createApiClient(base);
    let negotiations = 0;
    const firstSockets: WebSocket[] = [];
    class ControlledSocket extends WebSocket {
      constructor(url: string, protocols?: string | string[]) {
        local(url); super(url, protocols);
      }
    }
    class FirstSocket extends ControlledSocket {
      constructor(url: string, protocols?: string | string[]) {
        super(url, protocols); firstSockets.push(this);
      }
    }
    const deps = {
      negotiate: async (groups: string[]) => { negotiations++; return api.negotiate(groups); },
      getSnapshot: api.getSnapshot, WebSocketImpl: ControlledSocket, random: () => 0,
    };
    const first = createMatchStore(match);
    const late = createMatchStore(match);
    const firstSocket = createMatchSocket(first, { ...deps, WebSocketImpl: FirstSocket });
    const lateSocket = createMatchSocket(late, deps);
    const replayStore = createMatchStore(match);
    try {
      firstSocket.start();
      await until(() => first.getState().counters.events >= 20, 120_000, "No live events: start the generator after this check");
      lateSocket.start();
      await until(() => late.getState().scoreboard.setup !== null, 30_000, "Late joiner has no setup");
      const before = negotiations;
      const active = firstSockets.find((socket) => socket.readyState === WebSocket.OPEN);
      expect(active, "First viewer must have an open socket").toBeDefined();
      active!.close(); // close the CURRENT connection, not an obsolete pre-setup retry socket
      await until(() => negotiations > before && first.getState().connection.status === "live", 30_000, "Viewer did not reconnect");
      await until(() => first.getState().scoreboard.phase === "full_time" && late.getState().scoreboard.phase === "full_time",
        10 * 60_000, "Both viewers must finish");
      const summary = JSON.parse(readFileSync(join(recording, "summary.json"), "utf8"));
      const expectedEvents = lines(readFileSync(join(recording, "events.ndjson"), "utf8"));
      const expectedFrames = lines(gunzipSync(readFileSync(join(recording, "tracking.ndjson.gz"))).toString());
      const expectedSetup = JSON.parse(readFileSync(join(recording, "setup.json"), "utf8"));
      for (const store of [first, late]) {
        expect(store.getState().scoreboard.score).toEqual(summary.score);
        expect(store.getState().scoreboard.setup).toEqual(expectedSetup);
        expect(store.getState().connection.rejected).toBe(0);
      }
      const replay = createReplayClient({ baseUrl: base });
      // Archival is independent of the screen. Wait for the finished manifest, never substitute live data.
      let manifest: Awaited<ReturnType<typeof replay.manifest>> | undefined;
      await until(async () => {
        try { manifest = await replay.manifest(match); return true; } catch { return false; }
      }, 120_000, "Archive never became replayable");
      expect(manifest!.setup).toEqual(expectedSetup);
      expect(manifest!.result.score).toEqual(summary.score);
      let envelopes: ParsedEnvelope[] = [];
      let events: unknown[] = [];
      let frames: unknown[] = [];
      let archiveReads = 0;
      // Event completion and tracking completion are independent. Measure bounded catch-up,
      // then compare exact content; never turn missing/conflicting data into a pass.
      const archiveStarted = Date.now();
      await until(async () => {
        envelopes = [];
        for (const chunk of manifest!.chunks) {
          const response = await replay.chunk(match, chunk.index);
          expect(response.rejected.count).toBe(0);
          envelopes.push(...response.envelopes);
        }
        archiveReads++;
        events = envelopes.filter((e) => e.kind === "event").map((e) => e.data);
        frames = envelopes.flatMap((e) => e.kind === "positions" ? e.data.frames : []);
        console.info(JSON.stringify({ archiveReads, events: events.length, frames: frames.length,
          expectedEvents: expectedEvents.length, expectedFrames: expectedFrames.length }));
        if (events.length > expectedEvents.length || frames.length > expectedFrames.length) {
          throw new Error("Replay contains unexpected extra records");
        }
        if (events.length === expectedEvents.length && frames.length === expectedFrames.length) return true;
        await delay(5_000);
        return false;
      }, 240_000, "Archive did not converge to the recorded event/frame counts within four minutes");
      const archiveCatchupMs = Date.now() - archiveStarted;
      expect(events).toEqual(expectedEvents);
      expect(frames).toEqual(expectedFrames);
      expect(new Set(envelopes.map((e) => e.seq)).size).toBe(envelopes.length);
      expect(envelopes.every((e, i) => i === 0 || e.seq > envelopes[i - 1].seq)).toBe(true);
      replayStore.setSetup(manifest!.setup);
      for (const envelope of envelopes) replayStore.ingest(envelope, null);
      replayStore.flush();
      expect(replayStore.getState().scoreboard.phase).toBe("full_time");
      expect(replayStore.getState().scoreboard.score).toEqual(summary.score);
      // Wait for the final independent stats publisher/relay catch-up before comparing snapshots.
      await until(async () => {
        const snap = await api.getSnapshot(match);
        return snap.envelopes.some((e) => e.kind === "stats" && e.data.match_ms === replayStore.getState().stats.latest?.match_ms);
      }, 60_000, "Final stats never reached the snapshot");
      const reload = await api.getSnapshot(match);
      const fresh = createMatchStore(match);
      try {
        fresh.setSetup(reload.setup);
        for (const e of reload.envelopes) fresh.ingest(e, null);
        fresh.flush(); first.flush(); late.flush();
        expect(fresh.getState().scoreboard.score).toEqual(summary.score);
        expect(first.getState().stats.latest).not.toBeNull();
        expect(late.getState().stats).toEqual(first.getState().stats);
        expect(fresh.getState().stats).toEqual(first.getState().stats);
        expect(fresh.getState().stats.latest).toEqual(replayStore.getState().stats.latest);
      } finally { fresh.destroy(); }
      console.info(JSON.stringify({ match, negotiations, forced_disconnects: 1, viewers: 2,
        archiveReads, archiveCatchupMs, events: events.length, frames: frames.length, replay_chunks: manifest!.chunks.length,
        score: summary.score, source: "generator recording", cloud: false }));
    } finally {
      firstSocket.stop(); lateSocket.stop(); first.destroy(); late.destroy(); replayStore.destroy();
    }
  }, 15 * 60_000);
});
