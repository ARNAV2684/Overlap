// replay-fixtures.ts — A small stored match for the replay tests
//
// Purpose: the match archive's documents for one short, finished match (invented clubs only), as Cosmos returns
//          them, and an in-memory ArchiveStore over them that filters the way archive-store.ts queries
// Inputs:  -
// Outputs: STORED_EVENTS, STORED_MATCH, frameAt(), storedEvent(), fakeArchiveStore()
// Spec:    web/specs/realtime.md §5.1; CONTRACTS.md §4.1
//
// Period 1 runs 2:05 (minutes 0–2) and period 2 runs 1:01 (minutes 0–1), so the match has five chunks. Away scores in
// minute 1 of period 1, home in minute 0 of period 2: 1–1.

import type { TrackingFrame } from "@/lib/contracts";
import { replayClock } from "@/lib/replay-envelopes";
import type { ArchiveStore, StoredDoc, StoredMatch, TrackingFile } from "@/lib/server/archive-store";
import { makeFrame, makeSetup } from "./fixtures";

export const P1_END = 125_000;
export const P2_END = 61_000;
export const startOf = (period: number) => (period === 1 ? 0 : P1_END);

/** The fields Cosmos adds to every stored document. */
export const cosmosFields = (id: string) => ({ id, _rid: "rid", _self: "self", _etag: '"etag"', _attachments: "att/", _ts: 1 });

export function storedEvent(
  seq: number,
  period: number,
  periodMs: number,
  type: string,
  extra: Record<string, unknown> = {},
): StoredDoc {
  const eventId = `SYN-0042-${String(seq).padStart(5, "0")}`;
  return {
    ...cosmosFields(eventId),
    event_id: eventId,
    match_id: "SYN-0042",
    seq,
    possession_id: 1,
    period,
    period_ms: periodMs,
    match_ms: startOf(period) + periodMs,
    clock: replayClock(period, periodMs),
    type,
    ...extra,
  };
}

export const storedPass = (seq: number, period: number, periodMs: number) =>
  storedEvent(seq, period, periodMs, "Pass", { team_id: "NBR", player_id: "NBR-09", outcome: "success", receiver_id: "NBR-11" });

export const storedGoal = (seq: number, period: number, periodMs: number, team = "HBA") =>
  storedEvent(seq, period, periodMs, "Shot", { team_id: team, player_id: `${team}-09`, shot_outcome: "goal", situation: "open_play" });

export const STORED_EVENTS: StoredDoc[] = [
  storedEvent(1, 1, 0, "PeriodStart"),
  storedPass(2, 1, 30_000),
  storedGoal(3, 1, 70_000),
  storedEvent(4, 1, P1_END, "PeriodEnd"),
  storedEvent(5, 2, 0, "PeriodStart"),
  storedGoal(6, 2, 20_000, "NBR"),
  storedEvent(7, 2, P2_END, "PeriodEnd"),
];

export const STORED_MATCH: StoredMatch = {
  match_id: "SYN-0042",
  status: "finished",
  setup: makeSetup(),
  result: { score: { home: 1, away: 1 }, events: 7 },
};

/** A tracking frame of the stored match. `ballX` tells repeats of the same moment apart. */
export function frameAt(period: number, periodMs: number, ballX = 50): TrackingFrame {
  return {
    ...makeFrame({ period, period_ms: periodMs, match_ms: startOf(period) + periodMs }),
    ball: { x: ballX, y: 50, z: 0, speed_kmh: 10 },
  };
}

/** One stat panel as the archiver stores it (CONTRACTS.md §7.4, shortened). */
export const storedPanel = (period: number, periodMs: number): StoredDoc => {
  const matchMs = startOf(period) + periodMs;
  return {
    ...cosmosFields(`stats-${String(matchMs).padStart(9, "0")}`),
    match_id: "SYN-0042",
    match_ms: matchMs,
    clock: replayClock(period, periodMs),
    period,
    low_sample: [],
  };
};

type FakeArchive = {
  match?: StoredMatch | null;
  events?: StoredDoc[];
  panels?: StoredDoc[];
  /** Keyed `p<period>/m<minute>`. */
  tracking?: Record<string, TrackingFile>;
};

/** An in-memory ArchiveStore over the given documents, filtering and ordering as the Cosmos queries do. */
export function fakeArchiveStore(archive: FakeArchive = {}): ArchiveStore & { calls: string[] } {
  const match = archive.match === undefined ? STORED_MATCH : archive.match;
  const events = [...(archive.events ?? STORED_EVENTS)].sort((a, b) => (a.seq as number) - (b.seq as number));
  const panels = [...(archive.panels ?? [])].sort((a, b) => (a.match_ms as number) - (b.match_ms as number));
  const calls: string[] = [];
  const call = <T>(name: string, value: T) => {
    calls.push(name);
    return Promise.resolve(value);
  };
  return {
    calls,
    match: (id) => call("match", match && match.match_id === id ? match : null),
    periodMarkers: () => call("periodMarkers", events.filter((e) => e.type === "PeriodStart" || e.type === "PeriodEnd")),
    goals: () => call("goals", events.filter((e) => e.type === "Shot" && e.shot_outcome === "goal")),
    eventSeqs: () => call("eventSeqs", events.map((e) => e.seq as number)),
    events: (_id, period, from, to) =>
      call(
        "events",
        events.filter((e) => e.period === period && (e.period_ms as number) >= from && (e.period_ms as number) < to),
      ),
    panels: (_id, period, from, to) =>
      call(
        "panels",
        panels.filter((p) => p.period === period && (p.match_ms as number) >= from && (p.match_ms as number) < to),
      ),
    trackingFile: (_id, period, minute) => call("trackingFile", archive.tracking?.[`p${period}/m${minute}`] ?? null),
  };
}
