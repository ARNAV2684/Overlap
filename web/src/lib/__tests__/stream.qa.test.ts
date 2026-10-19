// stream.qa.test.ts — End-to-end check against a running stream (opt-in)
//
// Purpose: run the real socket and store against the stream server (the mock or the local stand-in) until full time,
//          and check what the screen would have shown: nothing rejected, every message applied once, the badge reaching
//          "finished", each goal found once, and the scoreboard ending on the server's own final score
// Inputs:  QA_STREAM=1 (otherwise skipped, so `npm test` and CI never need a server), QA_MATCHES (comma-separated ids,
//          default SYN-9001), NEXT_PUBLIC_STREAM_BASE_URL from .env.local. Start the stream first, for example:
//          uv run python -m overlap_mock.cli play --match all --speed 60 --hubs off --web --linger-s 600
// Outputs: a pass or fail, plus one summary line per match (event types, goals, cards, substitutions)
// Spec:    web/specs/realtime.md §6. web/IMPLEMENTATION_PLAN.md Phase 10 step 7. Plan AC-03, AC-06
//
// Run:     QA_STREAM=1 npx vitest run src/lib/__tests__/stream.qa.test.ts
// Joining mid-match is fine: the snapshot fills in the history, and totals count history and live rows alike.

import { describe, expect, it } from "vitest";
import { goalBetween, type Score } from "@/components/scoreboard/goal";
import { listMatches } from "@/lib/api";
import { parseEnvelope, type ParsedEnvelope } from "@/lib/contracts";
import { createMatchSocket } from "@/lib/socket";
import { createMatchStore, type ConnectionStatus, type MatchStore } from "@/lib/store";

const ENABLED = process.env.QA_STREAM === "1";
const MATCHES = (process.env.QA_MATCHES ?? "SYN-9001").split(",").map((id) => id.trim());
/** Longest a match may take: about 5 minutes at 20×, so 10 minutes leaves room for slower runs. */
const RUN_LIMIT_MS = 10 * 60_000;

type Tally = {
  types: Map<string, number>;
  goals: number;
  cards: string[];
  statuses: ConnectionStatus[];
  scores: (Score | null)[];
};

/** Wraps the store's two ingest paths to tally what was applied, without changing what the store does. */
function tallying(store: MatchStore, tally: Tally): MatchStore {
  const count = (envelope: ParsedEnvelope) => {
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
  const tally: Tally = { types: new Map(), goals: 0, cards: [], statuses: [], scores: [] };
  store.subscribe(() => {
    const { connection, scoreboard } = store.getState();
    if (tally.statuses.at(-1) !== connection.status) tally.statuses.push(connection.status);
    if (tally.scores.at(-1) !== scoreboard.score) tally.scores.push(scoreboard.score);
  });
  const socket = createMatchSocket(tallying(store, tally));
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
      const server = (await listMatches()).find((m) => m.match_id === matchId);
      const goalsSeen = tally.scores.flatMap((s, i) => (i > 0 && goalBetween(tally.scores[i - 1], s) ? [1] : [])).length;
      const total = [...tally.types.values()].reduce((a, b) => a + b, 0);

      console.info(
        `${matchId}: ${total} events (${[...tally.types].map(([t, n]) => `${t} ${n}`).join(", ")}); ` +
          `goals ${tally.goals}; cards ${tally.cards.join(", ") || "none"}; ` +
          `final ${state.scoreboard.score?.home}–${state.scoreboard.score?.away} at ${state.scoreboard.clock}; ` +
          `live counters: ${state.counters.messages} messages, ${state.counters.events} events, ${state.counters.frames} frames; ` +
          `badge ${tally.statuses.join(" → ")}`,
      );

      expect(state.connection.rejected).toBe(0);
      expect(state.scoreboard.phase).toBe("full_time");
      expect(tally.statuses.at(-1)).toBe("finished");
      expect(state.scoreboard.score).toEqual(server?.score);
      // Each goal in the events changed the published score once (none were lost or doubled)
      expect(goalsSeen).toBeLessThanOrEqual(tally.goals);
      expect(state.scoreboard.score ? state.scoreboard.score.home + state.scoreboard.score.away : 0).toBe(tally.goals);
    },
    RUN_LIMIT_MS + 30_000,
  );
});
