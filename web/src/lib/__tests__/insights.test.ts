import { describe, expect, it } from "vitest";
import { createInsightFeed, keyNumber, overlayText, parseInsight } from "@/lib/live/insights";
import { audienceGroup, effectiveMode, parsePreferences } from "@/lib/preferences";
import { isViewerGroup, parseGroups } from "@/lib/server/pubsub-token";

const MATCH = "SYN-0901";

const overlay = (id: string, showAt: number, over: Record<string, unknown> = {}) => ({
  seq: Number(id.slice(-2)),
  kind: "overlay",
  match_id: MATCH,
  match_ms: showAt,
  clock: "6:03",
  data: {
    overlay_id: id,
    match_id: MATCH,
    moment_id: `MO${id.slice(2)}`,
    kind: "moment",
    priority: "high",
    period: 1,
    clock: "6:03",
    show_at_ms: showAt,
    duration_ms: 6000,
    mode: "casual",
    lang: "en",
    modes: { casual: { en: "Calverholme Athletic score. 1–0.", es: "Calverholme Athletic marca. 1–0." } },
    visual: { component: "key_events", window_ms: [0, showAt], highlight: { team_id: "CAL", event_id: "SYN-0901-00010" } },
    player_tags: [],
    verified: false,
    fallback: true,
    facts_checked: ["home_goals"],
    ...over,
  },
});

describe("parseInsight", () => {
  it("reads an overlay as the publisher sends it", () => {
    const i = parseInsight(overlay("OV-0901-01", 363_000), MATCH);
    expect(i?.kind).toBe("overlay");
  });

  it("reads a player tag and a recap", () => {
    expect(
      parseInsight({ seq: 2, kind: "player_tag", match_id: MATCH, match_ms: 1, clock: "1:00", data: { player_id: "CAL-11", name: "Lange", metric: "top_speed_kmh", value: 33.7, unit: "km/h" } }, MATCH)?.kind,
    ).toBe("player_tag");
    expect(
      parseInsight({ seq: 3, kind: "recap", match_id: MATCH, match_ms: 1, clock: "90:00", data: { match_id: MATCH, lines: [{ text: "Full time." }] } }, MATCH)?.kind,
    ).toBe("recap");
  });

  it("refuses another match, an unknown kind or a broken card", () => {
    expect(parseInsight(overlay("OV-0901-01", 1), "SYN-0902")).toBeNull();
    expect(parseInsight({ ...overlay("OV-0901-01", 1), kind: "stats" }, MATCH)).toBeNull();
    expect(parseInsight(overlay("OV-0901-01", 1, { modes: "nope" }), MATCH)).toBeNull();
  });
});

describe("overlayText", () => {
  it("picks the language, then falls back to English", () => {
    const o = parseInsight(overlay("OV-0901-01", 1), MATCH);
    if (o?.kind !== "overlay") throw new Error("not an overlay");
    expect(overlayText(o.data, "casual", "es")).toMatch(/marca/);
    expect(overlayText(o.data, "casual", "fr")).toMatch(/score/);
    expect(overlayText(o.data, "analyst", "en")).toMatch(/score/);
  });
});

describe("createInsightFeed", () => {
  const add = (feed: ReturnType<typeof createInsightFeed>, raw: unknown) => {
    const i = parseInsight(raw, MATCH);
    if (i) feed.add(i);
  };

  it("shows a card when the playhead reaches it, for its duration, once", () => {
    const feed = createInsightFeed();
    add(feed, overlay("OV-0901-01", 10_000));
    feed.tick(5_000, 1, 0);
    expect(feed.getState().current).toBeNull();
    feed.tick(10_500, 1, 100);
    expect(feed.getState().current?.overlay_id).toBe("OV-0901-01");
    feed.tick(11_000, 1, 7000);
    expect(feed.getState().current).toBeNull();
    // The same card again (a reconnect or a snapshot) is not shown twice
    add(feed, overlay("OV-0901-01", 10_000));
    feed.tick(12_000, 1, 8000);
    expect(feed.getState().current).toBeNull();
    expect(feed.getState().cards).toHaveLength(1);
  });

  it("drops a card that is too old to be live", () => {
    const feed = createInsightFeed();
    add(feed, overlay("OV-0901-02", 10_000));
    feed.tick(400_000, 1, 0);
    expect(feed.getState().current).toBeNull();
  });

  it("keeps the newest recap and tags", () => {
    const feed = createInsightFeed();
    add(feed, { seq: 9, kind: "recap", match_id: MATCH, match_ms: 1, clock: "90:00", data: { match_id: MATCH, lines: [{ text: "Full time." }] } });
    expect(feed.getState().recap?.lines[0].text).toBe("Full time.");
  });
});

describe("preferences", () => {
  it("parses saved choices and drops anything malformed", () => {
    expect(parsePreferences({ mode: "analyst", lang: "hi", club: "CAL", player: "CAL-11" })).toEqual({
      mode: "analyst",
      lang: "hi",
      club: "CAL",
      player: "CAL-11",
    });
    expect(parsePreferences({ mode: "x", lang: "de", club: "cal", player: 3 })).toEqual({ mode: "casual", lang: "en", club: null, player: null });
    expect(parsePreferences(null).mode).toBe("casual");
  });

  it("falls back to casual when the club or player is not in the match", () => {
    const prefs = parsePreferences({ mode: "club", club: "KES" });
    expect(effectiveMode(prefs, ["CAL", "DTN"], new Set())).toBe("casual");
    expect(effectiveMode({ ...prefs, club: "CAL" }, ["CAL", "DTN"], new Set())).toBe("club");
  });

  it("names the audience group of CONTRACTS.md §10.6", () => {
    const p = parsePreferences({ lang: "es", club: "DTN", player: "CAL-07" });
    expect(audienceGroup(MATCH, "casual", p)).toBe("match-SYN-0901-casual-es");
    expect(audienceGroup(MATCH, "analyst", p)).toBe("match-SYN-0901-analyst-es");
    expect(audienceGroup(MATCH, "club", p)).toBe("match-SYN-0901-club-DTN-es");
    expect(audienceGroup(MATCH, "player", p)).toBe("match-SYN-0901-player-CAL-07-es");
  });
});

describe("viewer groups (negotiate)", () => {
  it("accepts the base group and every audience group", () => {
    for (const g of ["match-SYN-0901", "match-SYN-0901-casual-en", "match-SYN-0901-club-DTN-fr", "match-SYN-0901-player-CAL-07-hi"]) {
      expect(isViewerGroup(g)).toBe(true);
    }
    expect(parseGroups("match-SYN-0901,match-SYN-0901-analyst-es")).toEqual(["match-SYN-0901", "match-SYN-0901-analyst-es"]);
  });

  it("refuses anything else", () => {
    for (const g of ["match-SYN-0901-casual-de", "match-SYN-901", "match-SYN-0901-club-dtn-en", "other", "match-SYN-0901-player-CAL-7-en"]) {
      expect(isViewerGroup(g)).toBe(false);
    }
  });
});

describe("keyNumber (the AI card's picked-out number)", () => {
  it("picks the first decimal or unit number, not the minute", () => {
    expect(keyNumber("45' Orrinford Albion are pressing harder: 1.10 pressures per opponent pass, up from 0.73.")).toEqual({
      before: "45' Orrinford Albion are pressing harder: ",
      number: "1.10",
      after: " pressures per opponent pass, up from 0.73.",
    });
    expect(keyNumber("Kestlebury have 61% of the ball in the last 10 minutes")?.number).toBe("61%");
    expect(keyNumber("A big chance worth 0.42 xG for Kone")?.number).toBe("0.42 xG");
  });
  it("falls back to a plain number and keeps the sentence whole", () => {
    const k = keyNumber("Three shots in 5 minutes")!;
    expect(k.number).toBe("5");
    expect(`${k.before}${k.number}${k.after}`).toBe("Three shots in 5 minutes");
  });
  it("keeps a scoreline whole", () => {
    expect(keyNumber("Calverholme Athletic score. 3–0.")).toEqual({ before: "Calverholme Athletic score. ", number: "3–0", after: "." });
  });
  it("is null without a number", () => {
    expect(keyNumber("What a goal")).toBeNull();
  });
});
