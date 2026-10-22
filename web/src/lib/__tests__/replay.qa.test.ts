// replay.qa.test.ts — Replay route against the real match archive (opt-in)
//
// Purpose: fetch a finished match's manifest and every chunk through the real route and storage, and check what a
//          replay would show: nothing rejected, `seq` rising, every stored event and frame present once, and the last
//          status ending on the archived result
// Inputs:  QA_REPLAY=1 (otherwise skipped, so `npm test` and CI never need storage), QA_REPLAY_MATCH (a finished,
//          archived match id), the OVERLAP_* storage settings from the shell or web/.env.local (web/.env.example).
//          Before running: the local stack up, archiver/main.py running, and a generator match played to full time
// Outputs: a pass or fail, plus one summary line
// Spec:    web/specs/realtime.md §5.1. Plan: vedant-frontend/plans/active/PLAN_web_replay.md AC-02
//
// Run:     QA_REPLAY=1 QA_REPLAY_MATCH=SYN-0505 npx vitest run src/lib/__tests__/replay.qa.test.ts

import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/replay/[id]/route";
import type { ParsedEnvelope } from "@/lib/contracts";
import type { ReplayChunkResponse, ReplayManifest } from "@/lib/replay-envelopes";
import { readArchiveEnv } from "@/lib/server/archive-env";
import { createArchiveStore } from "@/lib/server/archive-store";

const ENABLED = process.env.QA_REPLAY === "1";
const MATCH = process.env.QA_REPLAY_MATCH ?? "";
/** A whole match is about 95 chunks; allow a slow emulator plenty of time. */
const RUN_LIMIT_MS = 5 * 60_000;

/** The route's settings come from the shell, else from web/.env.local (Vitest only loads NEXT_PUBLIC_ ones). */
function loadStorageSettings() {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  for (const [name, value] of Object.entries(loadEnv("test", root, "OVERLAP_"))) process.env[name] ??= value;
}

async function get<T>(query = ""): Promise<T> {
  const response = await GET(new Request(`http://localhost/api/replay/${MATCH}${query}`), {
    params: Promise.resolve({ id: MATCH }),
  });
  const body = await response.json();
  if (response.status !== 200) throw new Error(`GET ${query || "manifest"}: ${response.status} ${JSON.stringify(body)}`);
  return body as T;
}

describe.skipIf(!ENABLED)("replay against the local match archive", () => {
  it(`replays ${MATCH || "(set QA_REPLAY_MATCH)"} to the archived result`, async () => {
    expect(MATCH, "set QA_REPLAY_MATCH to a finished, archived match id").toMatch(/^SYN-\d{4}$/);
    loadStorageSettings();
    const env = readArchiveEnv();
    expect(env.ok, "set the OVERLAP_* storage settings (web/.env.example)").toBe(true);
    if (!env.ok) return;

    const manifest = await get<ReplayManifest>();
    const envelopes: ParsedEnvelope[] = [];
    let rejected = 0;
    for (const chunk of manifest.chunks) {
      const body = await get<ReplayChunkResponse>(`?chunk=${chunk.index}`);
      expect(body.chunk).toBe(chunk.index);
      envelopes.push(...body.envelopes);
      rejected += body.rejected.count;
      if (body.rejected.count > 0) console.warn(`chunk ${chunk.index}:`, body.rejected.samples);
    }

    // Frames as stored, read straight from the archive: one per (period, match_ms)
    const store = createArchiveStore(env.settings);
    const storedFrames = new Set<string>();
    for (const chunk of manifest.chunks) {
      const file = await store.trackingFile(MATCH, chunk.period, chunk.minute);
      for (const frame of file?.frames ?? []) {
        const f = frame as { period: number; match_ms: number };
        storedFrames.add(`${f.period}:${f.match_ms}`);
      }
    }

    // Stat panels as stored, whatever their time: each half's last one is stamped after its whistle
    let storedPanels = 0;
    for (const period of manifest.periods) {
      storedPanels += (await store.panels(MATCH, period.period, 0, Number.MAX_SAFE_INTEGER)).length;
    }

    const events = envelopes.filter((e) => e.kind === "event");
    const frames = envelopes.flatMap((e) => (e.kind === "positions" ? e.data.frames : []));
    const statuses = envelopes.filter((e) => e.kind === "status");
    const last = statuses[statuses.length - 1];
    const seqs = envelopes.map((e) => e.seq);

    console.info(
      `${MATCH}: ${manifest.chunks.length} chunks, ${events.length} events, ${frames.length} frames, ` +
        `${envelopes.filter((e) => e.kind === "stats").length} panels, ${rejected} rejected, gaps ${manifest.gaps.length}, ` +
        `final ${last?.kind === "status" ? `${last.data.score.home}–${last.data.score.away}` : "none"}`,
    );

    expect(rejected).toBe(0);
    expect(seqs.every((seq, i) => i === 0 || seq > seqs[i - 1])).toBe(true);
    expect(events.length).toBe(manifest.result.events);
    expect(new Set(events.map((e) => (e.kind === "event" ? e.data.seq : -1))).size).toBe(events.length);
    expect(frames.length).toBe(storedFrames.size);
    expect(envelopes.filter((e) => e.kind === "stats").length).toBe(storedPanels);
    expect(statuses[0]).toMatchObject({ data: { phase: "pre_match" } });
    expect(last).toMatchObject({ data: { phase: "full_time", score: manifest.result.score } });
  }, RUN_LIMIT_MS);
});
