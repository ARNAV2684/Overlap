import { describe, expect, it } from "vitest";
import {
  describeRejection,
  matchEventSchema,
  matchSetupSchema,
  parseEnvelope,
  trackingFrameSchema,
} from "@/lib/contracts";
import { envelope, makeEvent, makeFrame, makeSetup } from "./fixtures";

/** A message being deliberately damaged. Loosely typed on purpose: the point is to build invalid data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;

/** Applies a change to a deep copy, so every test starts from a valid message. */
function broken<T>(value: T, change: (copy: Draft) => void): unknown {
  const copy = structuredClone(value);
  change(copy);
  return copy;
}

const issuesOf = (result: ReturnType<typeof parseEnvelope>) =>
  result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);

describe("valid messages", () => {
  it("accepts the fixtures", () => {
    expect(matchSetupSchema.safeParse(makeSetup()).success).toBe(true);
    expect(matchEventSchema.safeParse(makeEvent()).success).toBe(true);
    expect(trackingFrameSchema.safeParse(makeFrame()).success).toBe(true);
  });

  it("accepts a period marker with no team or player", () => {
    const marker = makeEvent({ type: "PeriodStart", team_id: undefined, player_id: undefined });
    expect(matchEventSchema.safeParse(marker).success).toBe(true);
  });

  it("accepts a clock with stoppage time", () => {
    expect(parseEnvelope(envelope("event", makeEvent(), { clock: "45+2:10" })).ok).toBe(true);
  });
});

describe("unknown and missing fields", () => {
  it("rejects an unknown field in an event, a frame and the setup", () => {
    expect(matchEventSchema.safeParse(broken(makeEvent(), (e) => (e.recievr_id = "NBR-11"))).success).toBe(false);
    expect(trackingFrameSchema.safeParse(broken(makeFrame(), (f) => (f.players[0].extra = 1))).success).toBe(false);
    expect(matchSetupSchema.safeParse(broken(makeSetup(), (s) => (s.hax = 1))).success).toBe(false);
  });

  it("rejects an unknown field on the envelope", () => {
    expect(parseEnvelope(envelope("event", makeEvent(), { extra: 1 })).ok).toBe(false);
  });

  it("names the typo'd field in the reason", () => {
    const result = parseEnvelope(envelope("event", broken(makeEvent(), (e) => (e.recievr_id = "x"))));
    expect(issuesOf(result).join(" ")).toContain("recievr_id");
  });

  it.each(["event_id", "match_id", "seq", "possession_id", "period", "period_ms", "match_ms", "clock", "type"])(
    "rejects an event with no %s",
    (field) => {
      expect(matchEventSchema.safeParse(broken(makeEvent(), (e) => delete e[field])).success).toBe(false);
    },
  );
});

describe("CONTRACTS.md §3 rules", () => {
  const rule = (name: string, change: (e: Draft) => void, mention: string) =>
    it(name, () => {
      const result = parseEnvelope(envelope("event", broken(makeEvent(), change)));
      expect(result.ok).toBe(false);
      expect(issuesOf(result).join(" | ")).toContain(mention);
    });

  rule("a player event needs team_id", (e) => delete e.team_id, "team_id");
  rule("a player event needs player_id", (e) => delete e.player_id, "player_id");
  rule("a successful Pass needs a receiver", (e) => delete e.receiver_id, "receiver_id");
  rule("the receiver is never the passer", (e) => (e.receiver_id = e.player_id), "the passer");
  rule("the receiver is on the passer's team", (e) => (e.receiver_id = "HBA-02"), "other team");
  rule("a Shot needs shot_outcome", (e) => Object.assign(e, { type: "Shot", situation: "open_play", receiver_id: undefined }), "shot_outcome");
  rule("a Shot needs situation", (e) => Object.assign(e, { type: "Shot", shot_outcome: "saved", receiver_id: undefined }), "situation");
  rule(
    "a key-pass shot carries both assist fields",
    (e) => Object.assign(e, { type: "Shot", shot_outcome: "saved", situation: "open_play", assisted_by: "NBR-11" }),
    "come together",
  );
  rule("shot_outcome appears only on a Shot", (e) => (e.shot_outcome = "goal"), "only on a Shot");
  rule("a Foul needs fouled_player_id", (e) => Object.assign(e, { type: "Foul", receiver_id: undefined }), "fouled_player_id");
  rule("a Card needs card", (e) => Object.assign(e, { type: "Card", receiver_id: undefined }), "card");
  rule("a Substitution needs player_on_id", (e) => Object.assign(e, { type: "Substitution", receiver_id: undefined }), "player_on_id");
  rule("coordinates stay on the pitch", (e) => (e.x = 120), "x");
  rule("an unknown card colour is rejected", (e) => Object.assign(e, { type: "Card", card: "orange", receiver_id: undefined }), "card");

  it("accepts the same events when they are complete", () => {
    const complete = [
      makeEvent({ type: "Shot", shot_outcome: "goal", situation: "open_play", receiver_id: undefined, outcome: undefined }),
      makeEvent({
        type: "Shot",
        shot_outcome: "saved",
        situation: "counter",
        assisted_by: "NBR-11",
        key_pass_event_id: "SYN-0042-01185",
        receiver_id: undefined,
        outcome: undefined,
      }),
      makeEvent({ type: "Foul", fouled_player_id: "HBA-05", receiver_id: undefined, outcome: undefined }),
      makeEvent({ type: "Card", card: "red", receiver_id: undefined, outcome: undefined }),
      makeEvent({ type: "Substitution", player_on_id: "NBR-13", receiver_id: undefined, outcome: undefined }),
    ];
    for (const e of complete) expect(matchEventSchema.safeParse(e).success, e.type).toBe(true);
  });

  it("does not demand a receiver from a failed Pass", () => {
    expect(matchEventSchema.safeParse(makeEvent({ outcome: "fail", receiver_id: undefined })).success).toBe(true);
  });
});

describe("setup and tracking frames", () => {
  const setupRule = (name: string, change: (s: Draft) => void, mention: string) =>
    it(name, () => {
      const result = matchSetupSchema.safeParse(broken(makeSetup(), change));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues.map((i) => i.message).join(" | ")).toContain(mention);
    });

  setupRule("a lineup must have exactly 11 players", (s) => s.teams.home.lineup.pop(), "11");
  setupRule("a lineup starts with the goalkeeper", (s) => (s.teams.home.lineup[0].pos = "ST"), "goalkeeper");
  setupRule("a player id must match team and shirt", (s) => (s.teams.home.lineup[1].player_id = "NBR-99"), "does not match");
  setupRule("a player cannot appear twice", (s) => (s.teams.home.bench[0] = structuredClone(s.teams.home.lineup[2])), "duplicate");
  setupRule("kit colours are #RRGGBB", (s) => (s.teams.home.colours.primary = "red"), "colour");
  setupRule("ratings stop at 99", (s) => (s.teams.home.lineup[2].attr.pace = 120), "<=99");
  setupRule("style values stop at 1", (s) => (s.teams.home.style.width = 1.4), "<=1");
  setupRule("a formation looks like 4-3-3", (s) => (s.teams.home.formation = "433"), "formation");

  const conditions = { temperature_c: 11.5, precipitation: "light", wind_ms: 6.0, attendance: 38250 };

  it("accepts a setup with conditions, as the generator sends it (CONTRACTS.md §2)", () => {
    expect(matchSetupSchema.safeParse({ ...makeSetup(), conditions }).success).toBe(true);
  });

  it("accepts a setup without conditions, as the mock sends it", () => {
    expect(matchSetupSchema.safeParse(makeSetup()).success).toBe(true);
  });

  it("rejects an unknown precipitation, a negative wind or attendance, and an unknown field in conditions", () => {
    const withConditions = (change: Partial<Record<string, unknown>>) =>
      matchSetupSchema.safeParse({ ...makeSetup(), conditions: { ...conditions, ...change } }).success;
    expect(withConditions({ precipitation: "snow" })).toBe(false);
    expect(withConditions({ wind_ms: -1 })).toBe(false);
    expect(withConditions({ attendance: -5 })).toBe(false);
    expect(withConditions({ attendance: 100.5 })).toBe(false);
    expect(withConditions({ humidity: 80 })).toBe(false);
  });

  it("keeps the ball and players on the pitch", () => {
    expect(trackingFrameSchema.safeParse(broken(makeFrame(), (f) => (f.ball.x = -3))).success).toBe(false);
    expect(trackingFrameSchema.safeParse(broken(makeFrame(), (f) => (f.players[0].y = 101))).success).toBe(false);
  });

  it("rejects a negative speed", () => {
    expect(trackingFrameSchema.safeParse(broken(makeFrame(), (f) => (f.players[0].speed_kmh = -1))).success).toBe(false);
  });
});

describe("parseEnvelope", () => {
  const status = (extra: object = {}) =>
    envelope("status", { phase: "live", period: 1, score: { home: 1, away: 0 }, ...extra });

  it("returns the typed envelope for event, positions and status", () => {
    const ev = parseEnvelope(envelope("event", makeEvent()));
    const pos = parseEnvelope(envelope("positions", { frames: [makeFrame()] }));
    const st = parseEnvelope(status());
    expect(ev.ok && ev.envelope.kind).toBe("event");
    expect(pos.ok && pos.envelope.kind).toBe("positions");
    expect(st.ok && st.envelope.kind).toBe("status");
    if (ev.ok && ev.envelope.kind === "event") expect(ev.envelope.data.type).toBe("Pass");
  });

  it("passes the first status, which carries the setup", () => {
    expect(parseEnvelope(status({ phase: "pre_match", period: 0, score: { home: 0, away: 0 }, setup: makeSetup() })).ok).toBe(true);
  });

  it.each(["stats", "overlay", "player_tag", "recap"])("accepts a %s envelope and leaves its data alone", (kind) => {
    const result = parseEnvelope(envelope(kind, { anything: [1, 2, 3] }));
    expect(result.ok && result.envelope.data).toEqual({ anything: [1, 2, 3] });
  });

  it("rejects the outer shape when something is wrong", () => {
    expect(parseEnvelope(envelope("event", makeEvent(), { seq: -1 })).ok).toBe(false);
    expect(parseEnvelope(envelope("event", makeEvent(), { seq: 1.5 })).ok).toBe(false);
    expect(parseEnvelope(envelope("bogus", makeEvent())).ok).toBe(false);
    expect(parseEnvelope(envelope("event", makeEvent(), { clock: "62:14:00" })).ok).toBe(false);
    expect(parseEnvelope(envelope("event", makeEvent(), { match_id: "42" })).ok).toBe(false);
  });

  it("requires data to be an object", () => {
    expect(parseEnvelope(envelope("event", "nope")).ok).toBe(false);
    expect(parseEnvelope(envelope("stats", null)).ok).toBe(false);
    expect(parseEnvelope(broken(envelope("event", makeEvent()), (e) => delete e.data)).ok).toBe(false);
  });

  it("rejects data whose match_id differs from the envelope's", () => {
    expect(parseEnvelope(envelope("event", makeEvent({ match_id: "SYN-0001" }))).ok).toBe(false);
    expect(parseEnvelope(envelope("positions", { frames: [makeFrame({ match_id: "SYN-0001" })] })).ok).toBe(false);
    expect(parseEnvelope(status({ setup: { ...makeSetup(), match_id: "SYN-0001" } })).ok).toBe(false);
  });

  it("rejects positions with no frames and an unknown phase", () => {
    expect(parseEnvelope(envelope("positions", { frames: [] })).ok).toBe(false);
    expect(parseEnvelope(status({ phase: "paused" })).ok).toBe(false);
  });

  it("never throws, whatever it is given", () => {
    for (const junk of [null, undefined, "hi", 42, [], {}, { seq: "x", kind: 7, data: null }, () => 1, Symbol("s")]) {
      expect(() => parseEnvelope(junk)).not.toThrow();
      expect(parseEnvelope(junk).ok).toBe(false);
    }
  });

  it("keeps the kind and seq of a rejected envelope for the log", () => {
    const result = parseEnvelope(envelope("event", { nope: 1 }, { seq: 9 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("event");
      expect(result.seq).toBe(9);
      expect(describeRejection(result)).toMatch(/^Rejected event seq 9: data\./);
    }
  });
});
