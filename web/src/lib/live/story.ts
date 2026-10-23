// story.ts — The story director
//
// Purpose: decide, every moment, which tactical story the pitch should tell, and the numbers behind it:
//            protect  a team that just scored drops into shape: its lines, and how far deeper its block now sits
//            attack   a team pinning the other back: its pass network on the live players and the lane it uses
//            territory the default: who owns the pitch, as a tide line between the two halves
// Inputs:  the match memory and the current interpolated sample
// Outputs: directStory(), formationLines(), attackChannel(), territoryFront(); Story
// Spec:    web/specs/pitch.md §4
//
// Pure functions. Thresholds are named below so they can be tuned in one place. Every number shown to the viewer is
// computed here from tracking or events; nothing is invented.

import type { MatchEvent, MatchSetup } from "@/lib/contracts";
import { attacksEast, type Side } from "@/lib/coordinates";
import type { BallSample, Goal, MatchMemory, ShapeSample } from "@/lib/live/match-memory";
import type { MotionSample } from "@/lib/live/motion";

export const STORY_KINDS = ["territory", "protect", "attack"] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

/** After a goal, the scoring team's shape is the story for this long (match ms), within the same period. */
export const PROTECT_FOR_MS = 5 * 60_000;
/** Look-back for "how deep was the block before the goal". */
export const BEFORE_GOAL_MS = 3 * 60_000;
/** The block is compared over this recent window. */
export const RECENT_MS = 45_000;
/** Attack: share of the last ATTACK_WINDOW_MS the ball spent in the team's final third. */
export const ATTACK_WINDOW_MS = 25_000;
export const ATTACK_THIRD_SHARE = 0.45;
/** Attack lanes are counted over this many match ms of the team's events. */
export const LANE_WINDOW_MS = 6 * 60_000;
/** Territory is measured over this window. */
export const TERRITORY_MS = 3 * 60_000;

export type Channel = "left" | "centre" | "right";

export type Story = {
  kind: StoryKind;
  /** The team the story is about (null for territory). */
  side: Side | null;
  title: string;
  detail: string;
  /** A headline number and its label, for the caption. */
  metric: { value: string; label: string } | null;
  /** Protect: the defensive line now and before the goal, metres from the team's own goal. */
  lineNow?: number;
  lineBefore?: number;
  /** Attack: the lane, in the attacking team's own frame. */
  channel?: Channel;
  channelShare?: number;
  /**
   * Attack by flank, live: each lane's share of the team's recent final-third actions, with the shots and xG it has
   * produced so far this match (heavy.shots; null without it). Left, centre, right in the team's own frame.
   */
  flanks?: { channel: Channel; share: number; shots: number | null; xg: number | null }[];
};

const teamName = (setup: MatchSetup | null, side: Side) => setup?.teams[side].name ?? (side === "home" ? "Home" : "Away");
const other = (side: Side): Side => (side === "home" ? "away" : "home");
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

function windowMean(samples: readonly ShapeSample[], from: number, to: number, period: number, pick: (s: ShapeSample) => number) {
  return mean(samples.filter((s) => s.ms >= from && s.ms <= to && s.period === period).map(pick));
}

/** Where the territory front sits (pitch-frame x, 0–100) and each team's share of the ball in the other's half. */
export function territoryFront(balls: readonly BallSample[], nowMs: number, period: number) {
  const recent = balls.filter((b) => b.ms > nowMs - TERRITORY_MS && b.period === period);
  if (!recent.length) return { frontX: 50, homeShare: 50 };
  // Exponential weighting: the last minute counts most
  let wSum = 0;
  let xSum = 0;
  let homeIn = 0;
  const homeEast = attacksEast("home", period) ?? true;
  for (const b of recent) {
    const w = Math.exp((b.ms - nowMs) / 60_000);
    wSum += w;
    xSum += w * b.x;
    const inAwayHalf = homeEast ? b.x > 50 : b.x < 50;
    if (inAwayHalf) homeIn += w;
  }
  return { frontX: xSum / wSum, homeShare: Math.round((homeIn / wSum) * 100) };
}

/** Which lane a team attacks through: its final-third actions, by channel of its own frame. */
export function attackChannel(
  events: readonly MatchEvent[],
  teamId: string,
  nowMs: number,
): { channel: Channel; share: number; shares: Record<Channel, number> } | null {
  const counts: Record<Channel, number> = { left: 0, centre: 0, right: 0 };
  let total = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.match_ms < nowMs - LANE_WINDOW_MS) break;
    if (e.team_id !== teamId) continue;
    if (e.type !== "Pass" && e.type !== "Carry" && e.type !== "TakeOn" && e.type !== "Shot") continue;
    const x = e.end_x ?? e.x;
    const y = e.end_y ?? e.y;
    if (x === undefined || y === undefined || x < 66) continue;
    const lane: Channel = y < 33.3 ? "left" : y > 66.7 ? "right" : "centre";
    counts[lane]++;
    total++;
  }
  if (total < 4) return null;
  const channel = (Object.keys(counts) as Channel[]).reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const shares = { left: Math.round((counts.left / total) * 100), centre: Math.round((counts.centre / total) * 100), right: Math.round((counts.right / total) * 100) };
  return { channel, share: shares[channel], shares };
}

/** The team in possession: the team of the latest on-ball event in the last 10 match seconds. */
export function possessionSide(events: readonly MatchEvent[], setup: MatchSetup | null, nowMs: number): Side | null {
  if (!setup) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.match_ms < nowMs - 10_000) break;
    if (!e.team_id) continue;
    if (["Pass", "Carry", "TakeOn", "Shot", "BallRecovery", "Interception"].includes(e.type)) {
      return e.team_id === setup.teams.home.team_id ? "home" : "away";
    }
  }
  return null;
}

/** The player ids of a team's outfield lines (deepest first), from the formation and where the players are now. */
export function formationLines(
  setup: MatchSetup | null,
  side: Side,
  sample: MotionSample,
  memory: Pick<MatchMemory, "players">,
): string[][] {
  if (!setup) return [];
  const shape = setup.teams[side].formation.split("-").map(Number);
  const meta = memory.players();
  const east = attacksEast(side, sample.period) ?? side === "home";
  const outfield = [...sample.players.entries()]
    .filter(([id]) => {
      const m = meta.get(id);
      return m && m.side === side && m.pos !== "GK";
    })
    .map(([id, p]) => ({ id, depth: east ? p.x : 100 - p.x, across: p.y }))
    .sort((a, b) => a.depth - b.depth);
  // A sent-off player leaves fewer than the formation: fill lines from the back
  const lines: string[][] = [];
  let i = 0;
  for (const size of shape) {
    if (i >= outfield.length) break;
    lines.push(
      outfield
        .slice(i, i + size)
        .sort((a, b) => a.across - b.across)
        .map((p) => p.id),
    );
    i += size;
  }
  if (i < outfield.length && lines.length) lines[lines.length - 1].push(...outfield.slice(i).map((p) => p.id));
  return lines;
}

function protectStory(memory: MatchMemory, goal: Goal, sample: MotionSample): Story {
  const setup = memory.setup();
  const shapes = memory.shapes(goal.side);
  const now = sample.matchMs;
  const lineBefore = windowMean(shapes, goal.ms - BEFORE_GOAL_MS, goal.ms - 5_000, goal.period, (s) => s.line);
  const lineNow = windowMean(shapes, now - RECENT_MS, now, sample.period, (s) => s.line);
  const name = teamName(setup, goal.side);
  const minutes = Math.max(0, Math.floor((now - goal.ms) / 60_000));
  const since = minutes === 0 ? "since the goal" : `${minutes}′ after the goal`;
  if (Number.isFinite(lineBefore) && Number.isFinite(lineNow)) {
    const drop = lineBefore - lineNow;
    const metres = Math.round(Math.abs(drop));
    const deeper = drop >= 1.5;
    const higher = drop <= -1.5;
    return {
      kind: "protect",
      side: goal.side,
      title: deeper ? `${name} drop deeper` : higher ? `${name} push up` : `${name} hold their shape`,
      detail: deeper
        ? `Defensive line ${metres} m closer to their own goal ${since}, protecting the lead.`
        : higher
          ? `Defensive line ${metres} m higher ${since}, chasing a second.`
          : `Same defensive line as before the goal, ${since}.`,
      metric: { value: `${deeper ? "↓" : higher ? "↑" : "="} ${metres} m`, label: "defensive line" },
      lineNow,
      lineBefore,
    };
  }
  return {
    kind: "protect",
    side: goal.side,
    title: `${name} reorganise`,
    detail: `Their shape ${since}: every line linked, back to front.`,
    metric: null,
    lineNow: Number.isFinite(lineNow) ? lineNow : undefined,
  };
}

/**
 * The story for now. `pinned` forces a kind (the viewer chose it); otherwise: a recent goal wins, then a sustained
 * attack, then territory.
 */
export function directStory(memory: MatchMemory, sample: MotionSample, pinned: StoryKind | null = null): Story {
  const setup = memory.setup();
  const now = sample.matchMs;
  const events = memory.events();
  const goals = memory.goals();
  const lastGoal = [...goals].reverse().find((g) => g.ms <= now);
  const recentGoal = lastGoal && lastGoal.period === sample.period && now - lastGoal.ms <= PROTECT_FOR_MS ? lastGoal : null;

  // Attack candidate: possession plus time in the final third, or the stats engine's momentum share
  const poss = possessionSide(events, setup, now);
  let attacker: Side | null = null;
  const recentBalls = memory.balls().filter((b) => b.ms > now - ATTACK_WINDOW_MS && b.period === sample.period);
  for (const side of ["home", "away"] as const) {
    const east = attacksEast(side, sample.period) ?? side === "home";
    const inThird = recentBalls.filter((b) => (east ? b.x > 66.7 : b.x < 33.3)).length;
    const share = recentBalls.length >= 6 ? inThird / recentBalls.length : 0;
    const momentum = memory.latestPanel()?.teams[side].momentum_share_last_10min_pct ?? null;
    if ((share >= ATTACK_THIRD_SHARE && (poss === side || poss === null)) || (momentum !== null && momentum >= 66 && poss === side)) {
      attacker = side;
    }
  }

  const want: StoryKind = pinned ?? (recentGoal ? "protect" : attacker ? "attack" : "territory");

  if (want === "protect") {
    const goal = recentGoal ?? lastGoal;
    if (goal) return protectStory(memory, goal, sample);
    if (pinned) {
      const side = poss ?? "home";
      return {
        kind: "protect",
        side,
        title: `${teamName(setup, side)}'s shape`,
        detail: "Every line linked, back to front. Watch it compress when they lose the ball.",
        metric: null,
      };
    }
  }

  if (want === "attack") {
    const side = attacker ?? poss ?? "home";
    const teamId = setup?.teams[side].team_id ?? "";
    const lane = attackChannel(events, teamId, now);
    const name = teamName(setup, side);
    const defender = teamName(setup, other(side));
    return {
      kind: "attack",
      side,
      title: lane ? `${name} attack down the ${lane.channel}` : `${name} on the attack`,
      detail: lane
        ? `${lane.share}% of their final-third actions in the last ${LANE_WINDOW_MS / 60_000} minutes go ${
            lane.channel === "centre" ? "through the middle" : `down the ${lane.channel}`
          }. Lines show who passes to whom.`
        : `Pinning ${defender} back. Lines show who passes to whom.`,
      metric: lane ? { value: `${lane.share}%`, label: `${lane.channel} lane` } : null,
      channel: lane?.channel,
      channelShare: lane?.share,
      flanks: lane
        ? (["left", "centre", "right"] as const).map((channel) => {
            const shots = memory.heavyPanel()?.heavy.shots?.[side];
            const mine = shots?.filter((s) => (s.y < 33.3 ? "left" : s.y > 66.7 ? "right" : "centre") === channel) ?? null;
            return {
              channel,
              share: lane.shares[channel],
              shots: mine ? mine.length : null,
              xg: mine ? Math.round(mine.reduce((t, s) => t + s.xg, 0) * 100) / 100 : null,
            };
          })
        : undefined,
    };
  }

  const { homeShare } = territoryFront(memory.balls(), now, sample.period);
  const leader: Side = homeShare >= 50 ? "home" : "away";
  const share = leader === "home" ? homeShare : 100 - homeShare;
  return {
    kind: "territory",
    side: null,
    title: "Territory tide",
    detail:
      share >= 58
        ? `${teamName(setup, leader)} have the ball in ${teamName(setup, other(leader))}'s half ${share}% of the last ${TERRITORY_MS / 60_000} minutes.`
        : `An even fight for space: ${teamName(setup, "home")} ${homeShare}% · ${teamName(setup, "away")} ${100 - homeShare}%.`,
    metric: { value: `${share}%`, label: `${teamName(setup, leader)} territory` },
  };
}
