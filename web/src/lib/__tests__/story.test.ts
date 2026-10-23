// story.test.ts — The story director
//
// Purpose: each pitch story (territory, protect, shape, attack with its live flank strip) is chosen and filled from
//          the match memory as specified
// Inputs:  hand-made setups, events and tracking frames (fixtures.ts)
// Outputs: pass / fail
// Spec:    web/specs/pitch.md

import { describe, expect, it } from "vitest";
import type { ParsedEnvelope, TrackingFrame } from "@/lib/contracts";
import { createMatchMemory, metresFromOwnGoal } from "@/lib/live/match-memory";
import type { MotionSample } from "@/lib/live/motion";
import { attackChannel, directStory, formationLines, territoryFront } from "@/lib/live/story";
import { MATCH, eventEnv, makeFrame, makeSetup, statusEnv } from "./fixtures";

const setup = makeSetup();
const homeIds = setup.teams.home.lineup.map((p) => p.player_id);
const awayIds = setup.teams.away.lineup.map((p) => p.player_id);

/** A frame with both teams' outfield players spread across the pitch; `homeDepth` shifts the home team (pitch x). */
function shapeFrame(ms: number, homeDepth: number, ballX = 50, period = 1): TrackingFrame {
  const spread = (ids: string[], base: number) =>
    ids.map((id, i) => ({
      player_id: id,
      x: i === 0 ? (base < 50 ? 2 : 98) : base + Math.floor((i - 1) / 4) * 8,
      y: 10 + ((i - 1) % 4) * 25,
      speed_kmh: 10,
      dist_m: 0,
    }));
  return makeFrame({
    match_ms: ms,
    period,
    ball: { x: ballX, y: 50, z: 0, speed_kmh: 10 },
    players: [...spread(homeIds, homeDepth), ...spread(awayIds, 70)],
  });
}

const posEnvelope = (seq: number, frame: TrackingFrame): ParsedEnvelope => ({
  seq,
  kind: "positions",
  match_id: MATCH,
  match_ms: frame.match_ms,
  clock: "0:00",
  data: { frames: [frame] },
});

function sampleOf(frame: TrackingFrame): MotionSample {
  return {
    matchMs: frame.match_ms,
    period: frame.period,
    ball: { ...frame.ball, speedKmh: frame.ball.speed_kmh },
    players: new Map(frame.players.map((p) => [p.player_id, { x: p.x, y: p.y, speedKmh: p.speed_kmh }])),
    rate: 1,
  };
}

describe("metresFromOwnGoal", () => {
  it("reads from each team's own goal line, whichever way it attacks", () => {
    expect(metresFromOwnGoal(20, "home", 1)).toBeCloseTo(21);
    expect(metresFromOwnGoal(20, "away", 1)).toBeCloseTo(84);
    expect(metresFromOwnGoal(20, "home", 2)).toBeCloseTo(84);
  });
});

describe("protect story", () => {
  it("measures how far the scoring team's defensive line dropped since the goal", () => {
    const memory = createMatchMemory();
    memory.ingest(statusEnv(1, "live", { home: 0, away: 0 }, { setup }, 0));
    let seq = 2;
    // Three minutes with the home block high (x from 40), then a home goal, then a deep block (x from 20)
    for (let s = 0; s < 180; s++) memory.ingest(posEnvelope(seq++, shapeFrame(s * 1000, 40)));
    memory.ingest(eventEnv(seq++, { type: "Shot", shot_outcome: "goal", situation: "open_play", team_id: "NBR", player_id: "NBR-09", period: 1 }, 180_000));
    for (let s = 181; s < 240; s++) memory.ingest(posEnvelope(seq++, shapeFrame(s * 1000, 20)));
    const story = directStory(memory, sampleOf(shapeFrame(239_000, 20)));
    expect(story.kind).toBe("protect");
    expect(story.side).toBe("home");
    expect(story.title).toMatch(/drop deeper/);
    expect(story.lineBefore! - story.lineNow!).toBeCloseTo(21, 0);
    expect(story.metric?.value).toBe("↓ 21 m");
  });
});

describe("attack story", () => {
  it("names the attacking team and its lane from its final-third actions", () => {
    const memory = createMatchMemory();
    memory.ingest(statusEnv(1, "live", { home: 0, away: 0 }, { setup }, 0));
    let seq = 2;
    for (let s = 0; s < 30; s++) {
      // The ball lives in the away third; home passes end down the right (team-frame y > 66.7)
      memory.ingest(posEnvelope(seq++, shapeFrame(s * 1000, 40, 85)));
      memory.ingest(eventEnv(seq++, { type: "Pass", team_id: "NBR", x: 70, y: 80, end_x: 85, end_y: 85, period: 1 }, s * 1000 + 500));
    }
    const story = directStory(memory, sampleOf(shapeFrame(29_500, 40, 85)));
    expect(story.kind).toBe("attack");
    expect(story.side).toBe("home");
    expect(story.channel).toBe("right");
    expect(story.metric?.value).toBe("100%");
    // Attack by flank, live: all three lanes, shares adding up; no shots or xG without heavy.shots
    expect(story.flanks?.map((f) => f.channel)).toEqual(["left", "centre", "right"]);
    expect(story.flanks?.reduce((t, f) => t + f.share, 0)).toBe(100);
    expect(story.flanks?.every((f) => f.shots === null && f.xg === null)).toBe(true);
  });

  it("returns no lane with too few actions", () => {
    expect(attackChannel([], "NBR", 0)).toBeNull();
  });
});

describe("territory", () => {
  it("is the default and splits the ball's time between the halves", () => {
    const memory = createMatchMemory();
    memory.ingest(statusEnv(1, "live", { home: 0, away: 0 }, { setup }, 0));
    for (let s = 0; s < 60; s++) memory.ingest(posEnvelope(s + 2, shapeFrame(s * 1000, 40, 50 + (s % 2 ? 10 : -10))));
    const story = directStory(memory, sampleOf(shapeFrame(59_000, 40, 50)));
    expect(story.kind).toBe("territory");
    const front = territoryFront(memory.balls(), 59_000, 1);
    expect(front.frontX).toBeGreaterThan(40);
    expect(front.frontX).toBeLessThan(60);
  });

  it("can be pinned by the viewer", () => {
    const memory = createMatchMemory();
    memory.ingest(statusEnv(1, "live", { home: 0, away: 0 }, { setup }, 0));
    memory.ingest(posEnvelope(2, shapeFrame(1000, 40)));
    expect(directStory(memory, sampleOf(shapeFrame(1000, 40)), "attack").kind).toBe("attack");
  });
});

describe("formationLines", () => {
  it("groups outfield players into the formation's lines, deepest first", () => {
    const memory = createMatchMemory();
    memory.setSetup(setup);
    const lines = formationLines(setup, "home", sampleOf(shapeFrame(0, 30)), memory);
    expect(lines.map((l) => l.length)).toEqual([4, 3, 3]);
    expect(lines.flat()).not.toContain("NBR-01");
  });
});

describe("match memory", () => {
  it("keeps the setup when a catch-up snapshot delivers old envelopes after newer ones", () => {
    const memory = createMatchMemory();
    memory.setSetup(setup);
    memory.ingest(eventEnv(50, {}, 3_000_000));
    memory.ingest(eventEnv(3, {}, 10_000));
    expect(memory.setup()).not.toBeNull();
    expect(memory.events()).toHaveLength(2);
  });

  it("starts the play again on a new pre-match status (a replay restart)", () => {
    const memory = createMatchMemory();
    memory.ingest(statusEnv(1, "pre_match", { home: 0, away: 0 }, { setup }, 0));
    memory.ingest(eventEnv(2, {}, 60_000));
    memory.ingest(statusEnv(1, "pre_match", { home: 0, away: 0 }, { setup }, 0));
    expect(memory.events()).toHaveLength(0);
    expect(memory.setup()).not.toBeNull();
  });
});
