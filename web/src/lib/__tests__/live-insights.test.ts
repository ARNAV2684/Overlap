import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@/lib/contracts";
import {
  battle,
  cardSource,
  CARD_SOURCE_LABEL,
  cardMinute,
  goalDistance,
  isProgressive,
  metres,
  momentKind,
  oppositeNumber,
  playerLines,
  roleOf,
  tempo,
  topConnections,
  WORK_WEIGHTS,
  workhorses,
} from "@/lib/live/live-insights";
import { createMatchMemory } from "@/lib/live/match-memory";
import { makeEvent, makeHeavy, makeSetup } from "./fixtures";

const memory = createMatchMemory();
memory.setSetup(makeSetup());
const players = memory.players();

let seq = 0;
/** An event with a fresh id and seq; defaults to a completed NBR pass. */
function ev(over: Partial<MatchEvent>): MatchEvent {
  seq++;
  return makeEvent({ event_id: `SYN-0042-${String(seq).padStart(5, "0")}`, seq, ...over });
}
const noPass = { receiver_id: undefined, outcome: undefined } as const;

describe("roles", () => {
  it("maps lineup positions to broad roles", () => {
    expect(roleOf("GK")).toBe("keeper");
    expect(roleOf("RWB")).toBe("defender");
    expect(roleOf("DM")).toBe("midfielder");
    expect(roleOf("LW")).toBe("forward");
    expect(roleOf("XX")).toBe("midfielder");
  });
});

describe("playerLines", () => {
  const events = [
    ev({ player_id: "NBR-07", x: 40, y: 50, end_x: 60, end_y: 50, receiver_id: "NBR-10" }),
    ev({ player_id: "NBR-07", x: 40, y: 50, end_x: 42, end_y: 50, outcome: "fail", receiver_id: undefined }),
    ev({ type: "Shot", player_id: "NBR-10", shot_outcome: "goal", situation: "open_play", shot_speed_kmh: 98, assisted_by: "NBR-07", key_pass_event_id: "SYN-0042-00001", ...noPass }),
    ev({ type: "Shot", player_id: "NBR-10", shot_outcome: "missed", situation: "open_play", shot_speed_kmh: 104, ...noPass }),
    ev({ type: "Tackle", team_id: "HBA", player_id: "HBA-03", outcome: "success", receiver_id: undefined }),
    ev({ type: "Tackle", team_id: "HBA", player_id: "HBA-03", outcome: "fail", receiver_id: undefined }),
    ev({ type: "Aerial", team_id: "HBA", player_id: "HBA-03", outcome: "success", receiver_id: undefined }),
    ev({ type: "Interception", team_id: "HBA", player_id: "HBA-03", ...noPass }),
  ];
  const heavy = makeHeavy({
    shots: {
      home: [{ event_id: "SYN-0042-00003", player_id: "NBR-10", period: 2, match_ms: 1, x: 90, y: 50, xg: 0.4, outcome: "goal", situation: "open_play", body_part: null }],
      away: [],
    },
  });
  const lines = playerLines(events, heavy);

  it("counts passes, progression, distance and key passes", () => {
    const l = lines.get("NBR-07")!;
    expect(l).toMatchObject({ passes: 2, passesCompleted: 1, progressivePasses: 1, keyPasses: 1 });
    expect(l.passDistanceM).toBeCloseTo(21, 5);
  });

  it("counts shots, goals, xG and the hardest shot", () => {
    expect(lines.get("NBR-10")).toMatchObject({ shots: 2, shotsOnTarget: 1, goals: 1, xg: 0.4, topShotSpeedKmh: 104 });
  });

  it("counts duels from tackles, take-ons and aerials", () => {
    expect(lines.get("HBA-03")).toMatchObject({ tackles: 2, tacklesWon: 1, aerialsWon: 1, duels: 3, duelsWon: 2, interceptions: 1 });
  });

  it("takes distance and sprints from the heavy block", () => {
    expect(lines.get("NBR-11")).toMatchObject({ distanceKm: 7.21, sprints: 14, topSpeedKmh: 33.4 });
  });

  it("measures in metres and uses the stats engine's progressive rule", () => {
    expect(metres(0, 0, 100, 0)).toBeCloseTo(105);
    const pass = (over: Partial<MatchEvent>) => makeEvent({ y: 50, end_y: 50, ...over });
    expect(isProgressive(pass({ x: 40, end_x: 70 }))).toBe(true); // 63 m from goal to 31.5 m
    expect(isProgressive(pass({ x: 30, end_x: 70 }))).toBe(false); // starts before x = 35
    expect(isProgressive(pass({ x: 45, end_x: 50 }))).toBe(false); // not 25 % closer
    expect(isProgressive(pass({ x: 40, end_x: 70, qualifiers: ["free_kick"] }))).toBe(false); // a set piece
    expect(isProgressive(pass({ x: 40, end_x: 70, outcome: "fail", receiver_id: undefined }))).toBe(false);
    expect(goalDistance(100, 50)).toBe(0.5);
  });
});

describe("battle", () => {
  const events = [
    ev({ type: "Shot", player_id: "NBR-10", shot_outcome: "goal", situation: "open_play", ...noPass }),
    ev({ type: "Shot", player_id: "NBR-10", shot_outcome: "saved", situation: "open_play", ...noPass }),
    ev({ type: "Shot", team_id: "HBA", player_id: "HBA-10", shot_outcome: "missed", situation: "open_play", ...noPass }),
    ev({ type: "TakeOn", team_id: "HBA", player_id: "HBA-10", outcome: "success", receiver_id: undefined }),
    ev({ type: "TakeOn", team_id: "HBA", player_id: "HBA-11", outcome: "fail", receiver_id: undefined }),
  ];
  const lines = playerLines(events, null);

  it("pairs each side's leading forward and marks who leads each row", () => {
    const b = battle("forward", lines, players);
    expect(b.home?.meta.id).toBe("NBR-10");
    expect(b.away?.meta.id).toBe("HBA-10");
    expect(b.rows.find((r) => r.key === "goals")?.leader).toBe("home");
    expect(b.rows.find((r) => r.key === "take_ons")?.leader).toBe("away");
    expect(b.rows.find((r) => r.key === "shots")).toMatchObject({ home: "2 (2)", away: "1 (0)" });
    expect(b.edge).toBe("home");
  });

  it("finds the opposite number in the same role", () => {
    expect(oppositeNumber("NBR-10", lines, players)?.meta.id).toBe("HBA-10");
  });

  it("leaves a side empty when nobody in the role has done anything", () => {
    const b = battle("defender", lines, players);
    expect(b.home).toBeNull();
    expect(b.edge).toBeNull();
    expect(b.rows.every((r) => r.home === "–")).toBe(true);
  });
});

describe("topConnections", () => {
  const pass = (from: string, to: string, over: Partial<MatchEvent> = {}) => ev({ player_id: from, receiver_id: to, x: 40, y: 50, end_x: 45, end_y: 50, possession_id: 1, ...over });
  const events = [
    pass("NBR-04", "NBR-07"),
    pass("NBR-07", "NBR-04"),
    pass("NBR-04", "NBR-07"),
    pass("NBR-07", "NBR-10", { possession_id: 9, x: 50, end_x: 75 }),
    pass("NBR-07", "NBR-10", { possession_id: 9, x: 55, end_x: 80 }),
    ev({ type: "Shot", player_id: "NBR-10", shot_outcome: "saved", situation: "open_play", possession_id: 9, ...noPass }),
    pass("NBR-02", "NBR-03", { outcome: "fail", receiver_id: undefined }),
    pass("HBA-04", "HBA-06", { team_id: "HBA" }),
  ];

  it("ranks pairs by passes, progression and moves that ended in a shot", () => {
    const top = topConnections(events, "NBR");
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ a: "NBR-07", b: "NBR-10", passes: 2, progressive: 2, intoFinalThird: 2, inShotMoves: 2 });
    expect(top[1]).toMatchObject({ a: "NBR-04", b: "NBR-07", passes: 3, progressive: 0, inShotMoves: 0 });
    expect(top[0].score).toBeGreaterThan(top[1].score);
  });

  it("puts each player at their mean pass-start spot", () => {
    const [first] = topConnections(events, "NBR");
    expect(first.at.a.x).toBeCloseTo((40 + 50 + 55) / 3);
  });

  it("keeps the other team out", () => {
    expect(topConnections(events, "HBA")).toHaveLength(0);
  });
});

describe("workhorses", () => {
  it("ranks by the stated weights and leaves keepers out", () => {
    const events = [
      ev({ type: "Tackle", player_id: "NBR-06", outcome: "success", receiver_id: undefined }),
      ev({ type: "BallRecovery", player_id: "NBR-06", ...noPass }),
      ev({ type: "Save", player_id: "NBR-01", ...noPass }),
      ev({ type: "Pressure", player_id: "NBR-01", ...noPass }),
    ];
    const lines = playerLines(events, makeHeavy());
    const top = workhorses(lines, players);
    expect(top.map((w) => w.playerId)).toEqual(["NBR-11", "NBR-06"]);
    expect(top[0].score).toBeCloseTo(7.21 * WORK_WEIGHTS.distanceKm + 14 * WORK_WEIGHTS.sprints);
    expect(top[1].parts.find((p) => p.key === "duelsWon")).toMatchObject({ value: 1, points: WORK_WEIGHTS.duelsWon });
  });
});

describe("tempo", () => {
  const sides = { home: "NBR", away: "HBA" };
  /** One possession of `passes` completed passes by `team`, spread from `startMs`. */
  const move = (possession: number, team: string, passes: number, startMs: number) =>
    Array.from({ length: passes }, (_, i) => ev({ team_id: team, player_id: `${team}-07`, receiver_id: `${team}-08`, possession_id: possession, match_ms: startMs + i * 1000 }));

  it("waits for three minutes of play", () => {
    expect(tempo(move(1, "NBR", 20, 0), 120_000, sides)).toBeNull();
  });

  it("calls long home possessions control, with home in charge", () => {
    const events = [...move(1, "NBR", 12, 601_000), ...move(2, "HBA", 2, 700_000), ...move(3, "NBR", 10, 760_000)];
    const t = tempo(events, 900_000, sides)!;
    expect(t.passesPerPossession).toBeCloseTo(24 / 3);
    expect(t.state).toBe("control");
    expect(t.inControl).toBe("home");
    expect(t.turnoversPerMinute).toBeCloseTo(2 / 5);
  });

  it("calls short possessions chaos and compares the pass rate with the match so far", () => {
    const early = move(100, "NBR", 60, 0);
    const late = Array.from({ length: 8 }, (_, i) => move(10 + i, i % 2 ? "HBA" : "NBR", 2, 610_000 + i * 20_000)).flat();
    const t = tempo([...early, ...late], 900_000, sides)!;
    expect(t.state).toBe("chaos");
    expect(t.rhythm).toBe("slower");
  });
});

describe("AI moment cards", () => {
  it("labels only checked, model-written lines as AI", () => {
    expect(cardSource({ verified: true, fallback: false })).toBe("ai");
    expect(cardSource({ verified: false, fallback: true })).toBe("stat_line");
    expect(cardSource({ verified: false, fallback: false })).toBe("unchecked");
    expect(CARD_SOURCE_LABEL.stat_line).not.toMatch(/AI/);
  });

  it("names a card's kind from its chart and reads its minute", () => {
    expect(momentKind({ visual: { component: "shot_map" } })).toBe("chance");
    expect(momentKind({ visual: undefined })).toBe("moment");
    expect(momentKind({ visual: { component: "head_to_head" } })).toBe("head_to_head");
    expect(momentKind({ visual: { component: "connections" } })).toBe("connection");
    expect(momentKind({ visual: { component: "engine_room" } })).toBe("workhorse");
    expect(cardMinute("62:14")).toBe(62);
  });
});
