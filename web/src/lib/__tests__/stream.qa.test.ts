// stream.qa.test.ts — End-to-end check against a running stream (opt-in)
//
// Purpose: run the real socket and store against this app's routes on the local stack until full time,
//          and check what the screen would have shown: nothing rejected, every message applied once, the badge reaching
//          "finished", each goal found once, and the scoreboard ending on the server's own final score
// Inputs:  QA_STREAM=1 (otherwise skipped, so `npm test` and CI never need a server), QA_MATCHES (comma-separated ids,
//          default SYN-9001), QA_APP_URL (default http://localhost:3000). Start the local stack (generator, relay,
//          Web PubSub stand-in; infra/specs/local-development.md) and `npm run dev` first
// Outputs: a pass or fail, plus one summary line per match (event types, goals, cards, substitutions)
// Spec:    web/specs/realtime.md §6. web/IMPLEMENTATION_PLAN.md Phase 10 step 7. Plan AC-03, AC-06
//
// Run:     QA_STREAM=1 npx vitest run src/lib/__tests__/stream.qa.test.ts
// Joining mid-match is fine: the snapshot fills in the history, and totals count history and live rows alike.

import { describe, expect, it } from "vitest";
import { goalBetween, type Score } from "@/components/scoreboard/goal";
import { createApiClient } from "@/lib/api";
import { parseEnvelope, type ParsedEnvelope, type StatPanel } from "@/lib/contracts";
import { createMatchSocket } from "@/lib/socket";
import { createMatchStore, type ConnectionStatus, type MatchStore } from "@/lib/store";

const ENABLED = process.env.QA_STREAM === "1";
const MATCHES = (process.env.QA_MATCHES ?? "SYN-9001").split(",").map((id) => id.trim());
/** The running app: negotiate and snapshot are its own routes (realtime.md §1.1, §3.1). */
const APP_URL = process.env.QA_APP_URL ?? "http://localhost:3000";
const { negotiate, getSnapshot } = createApiClient(APP_URL);
/** Longest a match may take: about 5 minutes at 20×, so 10 minutes leaves room for slower runs. */
const RUN_LIMIT_MS = 10 * 60_000;

type Tally = {
  types: Map<string, number>;
  goals: number;
  cards: string[];
  /** Stat panels applied, and how many of them carried the heavy block. */
  panels: number;
  heavyPanels: number;
  /** Each applied panel by envelope seq, so a late joiner's panels can be compared with what was live. */
  panelsBySeq: Map<number, StatPanel>;
  statuses: ConnectionStatus[];
  scores: (Score | null)[];
};

/** Wraps the store's two ingest paths to tally what was applied, without changing what the store does. */
function tallying(store: MatchStore, tally: Tally): MatchStore {
  const count = (envelope: ParsedEnvelope) => {
    if (envelope.kind === "stats") {
      tally.panels++;
      if (envelope.data.heavy) tally.heavyPanels++;
      tally.panelsBySeq.set(envelope.seq, envelope.data);
      return;
    }
    if (envelope.kind !== "event") return;
    tally.types.set(envelope.data.type, (tally.types.get(envelope.data.type) ?? 0) + 1);
    if (envelope.data.type === "Shot" && envelope.data.shot_outcome === "goal") tally.goals++;
    if (envelope.data.type === "Card" && envelope.data.card) tally.cards.push(envelope.data.card);
  };
  return {
    ...store,
    ingest(envelope, receivedAt) {
      const result = store.ingest(envelope, receivedAt);
      if (result === "applied") count(envelope);
      return result;
    },
    ingestRaw(raw, receivedAt) {
      const parsed = parseEnvelope(raw);
      const result = store.ingestRaw(raw, receivedAt);
      if (result === "applied" && parsed.ok) count(parsed.envelope);
      return result;
    },
  };
}

async function watchToFullTime(matchId: string) {
  const store = createMatchStore(matchId, { onReject: (m) => console.warn(m) });
  const tally: Tally = { types: new Map(), goals: 0, cards: [], panels: 0, heavyPanels: 0, panelsBySeq: new Map(), statuses: [], scores: [] };
  store.subscribe(() => {
    const { connection, scoreboard } = store.getState();
    if (tally.statuses.at(-1) !== connection.status) tally.statuses.push(connection.status);
    if (tally.scores.at(-1) !== scoreboard.score) tally.scores.push(scoreboard.score);
  });
  const socket = createMatchSocket(tallying(store, tally), { negotiate, getSnapshot });
  socket.start();
  try {
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`${matchId} did not reach full time in time`)), RUN_LIMIT_MS);
      const check = setInterval(() => {
        if (store.getState().connection.status === "finished") {
          clearTimeout(deadline);
          clearInterval(check);
          resolve();
        }
      }, 500);
    });
  } finally {
    socket.stop();
  }
  store.flush();
  return { state: store.getState(), tally };
}

describe.skipIf(!ENABLED)("against a running stream", () => {
  it.each(MATCHES)(
    "%s: everything accepted, applied once, finished, and the final score matches the server",
    async (matchId) => {
      const { state, tally } = await watchToFullTime(matchId);
      // The server's own final score is its newest status (the match list is this app's route, not the stream's)
      const { status } = await getSnapshot(matchId);
      const serverScore = status?.kind === "status" ? status.data.score : undefined;
      const goalsSeen = tally.scores.flatMap((s, i) => (i > 0 && goalBetween(tally.scores[i - 1], s) ? [1] : [])).length;
      const total = [...tally.types.values()].reduce((a, b) => a + b, 0);

      console.info(
        `${matchId}: ${total} events (${[...tally.types].map(([t, n]) => `${t} ${n}`).join(", ")}); ` +
          `goals ${tally.goals}; cards ${tally.cards.join(", ") || "none"}; ` +
          `stat panels ${tally.panels} (${tally.heavyPanels} heavy); ` +
          `final ${state.scoreboard.score?.home}–${state.scoreboard.score?.away} at ${state.scoreboard.clock}; ` +
          `live counters: ${state.counters.messages} messages, ${state.counters.events} events, ${state.counters.frames} frames; ` +
          `badge ${tally.statuses.join(" → ")}`,
      );

      expect(state.connection.rejected).toBe(0);
      expect(state.scoreboard.phase).toBe("full_time");
      expect(tally.statuses.at(-1)).toBe("finished");
      expect(state.scoreboard.score).toEqual(serverScore);
      // Each goal in the events changed the published score once (none were lost or doubled)
      expect(goalsSeen).toBeLessThanOrEqual(tally.goals);
      expect(state.scoreboard.score ? state.scoreboard.score.home + state.scoreboard.score.away : 0).toBe(tally.goals);
      // The stats engine was running: panels arrived and the charts have something to draw
      expect(tally.panels).toBeGreaterThan(0);
      expect(tally.heavyPanels).toBeGreaterThan(0);
      expect(state.stats.latest).not.toBeNull();
      expect(state.stats.heavy).not.toBeNull();
    },
    RUN_LIMIT_MS + 30_000,
  );
});
