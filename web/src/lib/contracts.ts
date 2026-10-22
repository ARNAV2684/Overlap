// contracts.ts — Contract types
//
// Purpose: zod schemas (and the TypeScript types derived from them) for every message the viewer receives, per
//          CONTRACTS.md. Unknown fields are rejected: "a typo fails loudly" (CONTRACTS.md §1.3)
// Inputs:  raw parsed JSON from the stream (Web PubSub, snapshot, replay file)
// Outputs: schemas, types, and parseEnvelope(), which never throws
// Spec:    CONTRACTS.md §1–§4 and §7 (§7.4 stat panels). web/IMPLEMENTATION_PLAN.md Phase 4.1
//
// This file mirrors CONTRACTS.md. Change a shape only in a PR that edits CONTRACTS.md too, with both sides agreeing.

import { z } from "zod";

// ---------------------------------------------------------------------------------------------------------------
// Building blocks (CONTRACTS.md §1)
// ---------------------------------------------------------------------------------------------------------------

const matchId = z.string().regex(/^SYN-\d{4}$/, "match id looks like SYN-0042");
/** True for a well-formed match id (SYN-NNNN), for example a route parameter. */
export const isMatchId = (value: unknown): value is string => matchId.safeParse(value).success;
const teamId = z.string().regex(/^[A-Z]{3}$/, "team id is 3 capital letters");
const playerId = z.string().regex(/^[A-Z]{3}-\d{2}$/, "player id looks like NBR-11");
const eventId = z.string().regex(/^SYN-\d{4}-\d{5}$/, "event id looks like SYN-0042-01186");
const seasonId = z.string().regex(/^S\d+$/, "season id looks like S1");
/** Display only. Never sort or compute with it (CONTRACTS.md §1.2). */
const clock = z.string().regex(/^\d{1,3}(\+\d{1,2})?:\d{2}$/, "clock looks like 62:14 or 45+2:10");
const hexColour = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "colour looks like #B3202A");
/** 0–100 on both axes; metres = x × 1.05, y × 0.68 (CONTRACTS.md §1.1). */
const coordinate = z.number().min(0).max(100);
const ms = z.number().int().nonnegative();
/** 1, 2 halves · 3, 4 extra time · 5 shootout. Never inferred from the minute. */
const period = z.number().int().min(1).max(5);

// ---------------------------------------------------------------------------------------------------------------
// Match setup (CONTRACTS.md §2)
// ---------------------------------------------------------------------------------------------------------------

const rating = z.number().int().min(1).max(99);
const unit = z.number().min(0).max(1);

export const playerSchema = z.strictObject({
  player_id: playerId,
  name: z.string().min(1),
  pos: z.string().min(1),
  shirt: z.number().int().min(1).max(99),
  attr: z.strictObject({
    pace: rating,
    passing: rating,
    dribbling: rating,
    finishing: rating,
    tackling: rating,
    stamina: rating,
  }),
});

export const teamSchema = z
  .strictObject({
    team_id: teamId,
    name: z.string().min(1),
    colours: z.strictObject({ primary: hexColour, secondary: hexColour }),
    formation: z.string().regex(/^\d(-\d)+$/, "formation looks like 4-3-3"),
    style: z.strictObject({ press_intensity: unit, directness: unit, width: unit }),
    /** Exactly 11, goalkeeper first. */
    lineup: z.array(playerSchema).length(11),
    bench: z.array(playerSchema),
  })
  .superRefine((team, ctx) => {
    if (team.lineup[0]?.pos !== "GK") {
      ctx.addIssue({ code: "custom", path: ["lineup", 0, "pos"], message: "lineup starts with the goalkeeper (GK)" });
    }
    [...team.lineup, ...team.bench].forEach((player, index) => {
      const expected = `${team.team_id}-${String(player.shirt).padStart(2, "0")}`;
      if (player.player_id !== expected) {
        ctx.addIssue({
          code: "custom",
          path: [index < 11 ? "lineup" : "bench", index < 11 ? index : index - 11, "player_id"],
          message: `player id ${player.player_id} does not match team and shirt (${expected})`,
        });
      }
    });
  });

/** Weather and crowd, decided before kickoff. The generator always sends it; the mock leaves it out. */
export const conditionsSchema = z.strictObject({
  temperature_c: z.number(),
  precipitation: z.enum(["none", "light", "heavy"]),
  wind_ms: z.number().nonnegative(),
  attendance: z.number().int().nonnegative(),
});

export const matchSetupSchema = z
  .strictObject({
    match_id: matchId,
    seed: z.number().int(),
    competition: z.string().min(1),
    season_id: seasonId,
    venue: z.strictObject({ name: z.string().min(1), city: z.string().min(1) }),
    kickoff_utc: z.iso.datetime(),
    conditions: conditionsSchema.optional(),
    storylines: z.array(z.string()),
    teams: z.strictObject({ home: teamSchema, away: teamSchema }),
  })
  .superRefine((setup, ctx) => {
    const seen = new Set<string>();
    for (const side of ["home", "away"] as const) {
      for (const player of [...setup.teams[side].lineup, ...setup.teams[side].bench]) {
        if (seen.has(player.player_id)) {
          ctx.addIssue({ code: "custom", path: ["teams", side], message: `duplicate player ${player.player_id}` });
        }
        seen.add(player.player_id);
      }
    }
  });

// ---------------------------------------------------------------------------------------------------------------
// Event (CONTRACTS.md §3, team frame)
// ---------------------------------------------------------------------------------------------------------------

export const EVENT_TYPES = [
  "Pass",
  "Carry",
  "TakeOn",
  "Shot",
  "Save",
  "Tackle",
  "Interception",
  "Clearance",
  "Aerial",
  "Pressure",
  "BallRecovery",
  "Foul",
  "Card",
  "Substitution",
  "Offside",
  "Corner",
  "PeriodStart",
  "PeriodEnd",
] as const;

export const SHOT_OUTCOMES = ["goal", "saved", "missed", "blocked", "woodwork"] as const;
export const SITUATIONS = ["open_play", "counter", "corner", "free_kick", "penalty", "throw_in"] as const;
export const CARDS = ["yellow", "second_yellow", "red"] as const;

export const matchEventSchema = z
  .strictObject({
    // Always present
    event_id: eventId,
    match_id: matchId,
    /** Unique and strictly increasing per match; consumers drop a seq they already applied. */
    seq: z.number().int().positive(),
    possession_id: z.number().int().nonnegative(),
    period,
    period_ms: ms,
    /** Monotonic play time with half-time excluded: use it for ordering and windows. */
    match_ms: ms,
    clock,
    type: z.enum(EVENT_TYPES),
    // Present on every event except PeriodStart / PeriodEnd (checked below)
    team_id: teamId.optional(),
    player_id: playerId.optional(),
    // Location (team frame)
    x: coordinate.optional(),
    y: coordinate.optional(),
    end_x: coordinate.optional(),
    end_y: coordinate.optional(),
    // Other fields (CONTRACTS.md §3 "Other fields")
    outcome: z.enum(["success", "fail"]).optional(),
    body_part: z.enum(["left_foot", "right_foot", "head", "other"]).optional(),
    under_pressure: z.boolean().optional(),
    qualifiers: z.array(z.string()).optional(),
    ball_speed_kmh: z.number().nonnegative().optional(),
    target_player_id: playerId.optional(),
    // Pass
    receiver_id: playerId.optional(),
    // Shot
    shot_outcome: z.enum(SHOT_OUTCOMES).optional(),
    situation: z.enum(SITUATIONS).optional(),
    shot_speed_kmh: z.number().nonnegative().optional(),
    goal_mouth_y: z.number().optional(),
    goal_mouth_z: z.number().optional(),
    assisted_by: playerId.optional(),
    key_pass_event_id: eventId.optional(),
    // Foul, Card, Substitution
    fouled_player_id: playerId.optional(),
    card: z.enum(CARDS).optional(),
    player_on_id: playerId.optional(),
  })
  .superRefine((e, ctx) => {
    const need = (field: keyof typeof e, message: string) => {
      if (e[field] === undefined) ctx.addIssue({ code: "custom", path: [field], message });
    };

    // Every event except the period markers has a team and a player
    if (e.type !== "PeriodStart" && e.type !== "PeriodEnd") {
      need("team_id", `${e.type} needs team_id`);
      need("player_id", `${e.type} needs player_id`);
    }
    // A successful Pass has an exact receiver, never the passer, on the passer's team
    if (e.type === "Pass" && e.outcome === "success") {
      need("receiver_id", "a successful Pass needs receiver_id");
      if (e.receiver_id !== undefined) {
        if (e.receiver_id === e.player_id) {
          ctx.addIssue({ code: "custom", path: ["receiver_id"], message: "the receiver is the passer" });
        }
        if (e.team_id !== undefined && !e.receiver_id.startsWith(`${e.team_id}-`)) {
          ctx.addIssue({ code: "custom", path: ["receiver_id"], message: "the receiver is on the other team" });
        }
      }
    }
    // A Shot has an outcome and a situation; a key-pass shot carries both assist fields
    if (e.type === "Shot") {
      need("shot_outcome", "a Shot needs shot_outcome");
      need("situation", "a Shot needs situation");
      if ((e.assisted_by === undefined) !== (e.key_pass_event_id === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: [e.assisted_by === undefined ? "assisted_by" : "key_pass_event_id"],
          message: "assisted_by and key_pass_event_id come together",
        });
      }
    } else if (e.shot_outcome !== undefined) {
      ctx.addIssue({ code: "custom", path: ["shot_outcome"], message: "shot_outcome appears only on a Shot" });
    }
    // A Foul is one event by the offender, naming who was fouled
    if (e.type === "Foul") need("fouled_player_id", "a Foul needs fouled_player_id");
    if (e.type === "Card") need("card", "a Card needs card");
    if (e.type === "Substitution") need("player_on_id", "a Substitution needs player_on_id (player_id is the player going off)");
  });

// ---------------------------------------------------------------------------------------------------------------
// Tracking frame (CONTRACTS.md §4, pitch frame, 5 Hz)
// ---------------------------------------------------------------------------------------------------------------

export const trackingFrameSchema = z.strictObject({
  match_id: matchId,
  period,
  period_ms: ms,
  match_ms: ms,
  ball: z.strictObject({
    x: coordinate,
    y: coordinate,
    z: z.number(),
    speed_kmh: z.number().nonnegative(),
  }),
  players: z.array(
    z.strictObject({
      player_id: playerId,
      x: coordinate,
      y: coordinate,
      speed_kmh: z.number().nonnegative(),
      dist_m: z.number().nonnegative(),
    }),
  ),
});

// ---------------------------------------------------------------------------------------------------------------
// Envelope (CONTRACTS.md §7) and its payloads
// ---------------------------------------------------------------------------------------------------------------

export const ENVELOPE_KINDS = ["event", "positions", "stats", "overlay", "player_tag", "recap", "status"] as const;

/** `data` of a `status` envelope (CONTRACTS.md §7.2). The first one carries the setup. */
export const statusDataSchema = z.strictObject({
  phase: z.enum(["pre_match", "live", "half_time", "full_time"]),
  /** 0 before kick-off, then 1–5. */
  period: z.number().int().min(0).max(5),
  score: z.strictObject({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
  setup: matchSetupSchema.optional(),
});

/** `data` of a `positions` envelope, the latest ~1 s of frames (CONTRACTS.md §7.2). */
export const positionsDataSchema = z.strictObject({
  frames: z.array(trackingFrameSchema).min(1),
});

// ---------------------------------------------------------------------------------------------------------------
// Stat panel (CONTRACTS.md §7.4). The heavy block is mirrored from what the stats engine sends
// (stats/whole_match.py; sizes in stats/specs/publishing.md §2, index order in stats/state.py)
// ---------------------------------------------------------------------------------------------------------------

/** Sent as null when its sample is too small; the field is then listed in `low_sample` (stats/specs/metrics.md §7). */
const metric = z.number().nullable();
const count = z.number().int().nonnegative();
const bySide = <T extends z.ZodType>(schema: T) => z.strictObject({ home: schema, away: schema });
/** `outer` arrays of `inner` counts each. */
const countGrid = (outer: number, inner: number) => z.array(z.array(count).length(inner)).length(outer);

/** Pressing grid: `[col][row]`, 9 columns from the team's own goal, 6 rows from its left (metrics.md §4). */
export const PRESSING_COLS = 9;
export const PRESSING_ROWS = 6;
/** Touch zones: `[channel][col]`, 3 channels from the team's left, 6 columns from its own goal (metrics.md §6). */
export const ZONE_CHANNELS = 3;
export const ZONE_COLS = 6;

export const teamPanelSchema = z.strictObject({
  team_id: teamId,
  possession_pct: metric,
  shots: metric,
  shots_on_target: metric,
  xg: metric,
  passes: metric,
  pass_completion_pct: metric,
  ppda_last_10min: metric,
  pressures_per_opp_pass_last_10min: metric,
  momentum_share_last_10min_pct: metric,
  press_height_last_10min_m: metric,
});

/** One 5-minute bucket of `period_ms`: weighted momentum points per team (CONTRACTS.md §8). */
export const momentumBucketSchema = z.strictObject({
  period,
  bucket: z.number().int().nonnegative(),
  home: z.number().nonnegative(),
  away: z.number().nonnegative(),
});

export const passNetworkSchema = z.strictObject({
  /** Mean pass-start position in the team's own frame. */
  nodes: z.array(z.strictObject({ player_id: playerId, x: coordinate, y: coordinate, passes: count })),
  /** Completed passes from → to, only links with 3 or more. */
  links: z.array(z.strictObject({ from: playerId, to: playerId, count })),
});

export const heavyBlockSchema = z.strictObject({
  momentum_buckets: z.array(momentumBucketSchema),
  pass_network: bySide(passNetworkSchema),
  pressing_grid: bySide(countGrid(PRESSING_COLS, PRESSING_ROWS)),
  zones: bySide(countGrid(ZONE_CHANNELS, ZONE_COLS)),
  /** Only with tracking: keyed by player id. */
  players: z
    .record(
      playerId,
      z.strictObject({ distance_km: z.number().nonnegative(), top_speed_kmh: z.number().nonnegative(), sprints: count }),
    )
    .optional(),
});

/** `data` of a `stats` envelope: the light panel every match second, with `heavy` every whole minute and at PeriodEnd. */
export const statPanelSchema = z.strictObject({
  match_id: matchId,
  /** A whole second. */
  match_ms: ms,
  clock,
  period,
  /** The last event included. */
  source_seq: count,
  score: z.strictObject({ home: count, away: count }),
  teams: bySide(teamPanelSchema),
  /** The current bucket. */
  momentum: momentumBucketSchema,
  /** Paths of the fields sent as null, for example "teams.home.ppda_last_10min". */
  low_sample: z.array(z.string()),
  heavy: heavyBlockSchema.optional(),
});

/** The outer envelope. `data` must be an object; what is inside it is checked per kind by parseEnvelope(). */
export const envelopeSchema = z.strictObject({
  seq: z.number().int().nonnegative(),
  kind: z.enum(ENVELOPE_KINDS),
  match_id: matchId,
  match_ms: ms,
  clock,
  data: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------------------------------------------
// Types derived from the schemas, so the types and the runtime checks cannot disagree
// ---------------------------------------------------------------------------------------------------------------

export type Player = z.infer<typeof playerSchema>;
export type Team = z.infer<typeof teamSchema>;
export type MatchSetup = z.infer<typeof matchSetupSchema>;
export type MatchEvent = z.infer<typeof matchEventSchema>;
export type EventType = (typeof EVENT_TYPES)[number];
export type TrackingFrame = z.infer<typeof trackingFrameSchema>;
export type StatusData = z.infer<typeof statusDataSchema>;
export type PositionsData = z.infer<typeof positionsDataSchema>;
export type TeamPanel = z.infer<typeof teamPanelSchema>;
export type MomentumBucket = z.infer<typeof momentumBucketSchema>;
export type PassNetworkData = z.infer<typeof passNetworkSchema>;
export type HeavyBlock = z.infer<typeof heavyBlockSchema>;
export type StatPanel = z.infer<typeof statPanelSchema>;
/** A stat panel that carries the heavy block. */
export type HeavyStatPanel = StatPanel & { heavy: HeavyBlock };
export type EnvelopeKind = (typeof ENVELOPE_KINDS)[number];
export type Phase = StatusData["phase"];

type EnvelopeFields = Omit<z.infer<typeof envelopeSchema>, "kind" | "data">;
export type Envelope<K extends EnvelopeKind, D> = EnvelopeFields & { kind: K; data: D };

/** Kinds this screen does not render yet. They pass validation and are ignored by consumers, not rejected. */
export type IgnoredKind = Exclude<EnvelopeKind, "event" | "positions" | "status" | "stats">;

/** A validated envelope. Switch on `kind` to narrow `data`. */
export type ParsedEnvelope =
  | Envelope<"event", MatchEvent>
  | Envelope<"positions", PositionsData>
  | Envelope<"status", StatusData>
  | Envelope<"stats", StatPanel>
  | Envelope<IgnoredKind, Record<string, unknown>>;

// ---------------------------------------------------------------------------------------------------------------
// parseEnvelope: never throws
// ---------------------------------------------------------------------------------------------------------------

export type ContractIssue = { path: string; message: string };

export type ParseResult =
  | { ok: true; envelope: ParsedEnvelope }
  | {
      ok: false;
      /** Best effort, for logging: present when the envelope was readable enough to know them. */
      kind?: string;
      seq?: number;
      issues: ContractIssue[];
    };

function toIssues(error: z.ZodError, prefix = ""): ContractIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, issue.path.join(".")].filter(Boolean).join("."),
    message: issue.message,
  }));
}

/** One line for the console: kind, seq and the first problem. */
export function describeRejection(result: Extract<ParseResult, { ok: false }>): string {
  const first = result.issues[0];
  const where = `${result.kind ?? "unknown kind"}${result.seq === undefined ? "" : ` seq ${result.seq}`}`;
  return `Rejected ${where}: ${first ? `${first.path || "(root)"}: ${first.message}` : "unknown problem"}`;
}

/**
 * Validates an envelope in two steps: the outer shape, then `data` against the schema for its kind.
 * Kinds the screen does not render (overlay, player_tag, recap) pass with `data` as a plain object.
 * Also checks that the match id inside `data` is the envelope's own.
 */
export function parseEnvelope(raw: unknown): ParseResult {
  const outer = envelopeSchema.safeParse(raw);
  if (!outer.success) {
    const maybe = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      ok: false,
      kind: typeof maybe.kind === "string" ? maybe.kind : undefined,
      seq: typeof maybe.seq === "number" ? maybe.seq : undefined,
      issues: toIssues(outer.error),
    };
  }

  const { kind, data, ...rest } = outer.data;
  const fail = (issues: ContractIssue[]): ParseResult => ({ ok: false, kind, seq: rest.seq, issues });

  switch (kind) {
    case "event": {
      const inner = matchEventSchema.safeParse(data);
      if (!inner.success) return fail(toIssues(inner.error, "data"));
      if (inner.data.match_id !== rest.match_id) {
        return fail([{ path: "data.match_id", message: "differs from the envelope's match_id" }]);
      }
      return { ok: true, envelope: { ...rest, kind, data: inner.data } };
    }
    case "positions": {
      const inner = positionsDataSchema.safeParse(data);
      if (!inner.success) return fail(toIssues(inner.error, "data"));
      if (inner.data.frames.some((frame) => frame.match_id !== rest.match_id)) {
        return fail([{ path: "data.frames", message: "a frame's match_id differs from the envelope's match_id" }]);
      }
      return { ok: true, envelope: { ...rest, kind, data: inner.data } };
    }
    case "status": {
      const inner = statusDataSchema.safeParse(data);
      if (!inner.success) return fail(toIssues(inner.error, "data"));
      if (inner.data.setup && inner.data.setup.match_id !== rest.match_id) {
        return fail([{ path: "data.setup.match_id", message: "differs from the envelope's match_id" }]);
      }
      return { ok: true, envelope: { ...rest, kind, data: inner.data } };
    }
    case "stats": {
      const inner = statPanelSchema.safeParse(data);
      if (!inner.success) return fail(toIssues(inner.error, "data"));
      if (inner.data.match_id !== rest.match_id) {
        return fail([{ path: "data.match_id", message: "differs from the envelope's match_id" }]);
      }
      return { ok: true, envelope: { ...rest, kind, data: inner.data } };
    }
    default:
      return { ok: true, envelope: { ...rest, kind, data } };
  }
}
