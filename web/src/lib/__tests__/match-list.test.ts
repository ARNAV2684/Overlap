import { describe, expect, it } from "vitest";
import { buildMatchList, liveMatchIds, matchListSchema, parseMatchRows, parseShowcaseIds } from "@/lib/match-list";

/** A `matches` row as the store's projection returns it, with the Cosmos fields a query can still carry. */
const row = (matchId: string, status: string, ts: number, extra: Record<string, unknown> = {}) => ({
  match_id: matchId,
  status,
  _ts: ts,
  _rid: "rid",
  home_id: "NBR",
  home_name: "Northbridge FC",
  away_id: "HBA",
  away_name: "Harbour Athletic",
  ...(status === "finished" ? { result: { score: { home: 2, away: 1 }, events: 2171 } } : {}),
  ...extra,
});

/** A match_state document (CONTRACTS.md §4.2), shortened. */
const state = (phase: string, clock: string, home: number, away: number) => ({
  id: "state",
  kind: "match_state",
  schema_version: 1,
  source: { event_seq: 1186, match_ms: 3_854_000 },
  phase,
  period: 2,
  clock,
  score: { home, away },
  panel: null,
  totals: {},
  players: {},
});

describe("parseMatchRows", () => {
  it("keeps valid live and finished rows and drops Cosmos fields", () => {
    const { rows, leftOut } = parseMatchRows([row("SYN-0505", "live", 20), row("SYN-0504", "finished", 10)]);
    expect(leftOut).toEqual([]);
    expect(rows.map((r) => r.match_id)).toEqual(["SYN-0505", "SYN-0504"]);
    expect(rows[0]).not.toHaveProperty("_rid");
  });

  it("leaves out a row without a setup, with another status, or finished without a result, naming it by id", () => {
    const noSetup = { match_id: "SYN-0001", status: "live", _ts: 1 };
    const otherStatus = row("SYN-0002", "abandoned", 1);
    const noResult = { ...row("SYN-0003", "finished", 1), result: undefined };
    const badId = row("not-an-id", "live", 1);
    const { rows, leftOut } = parseMatchRows([noSetup, otherStatus, noResult, badId, null, row("SYN-0505", "live", 2)]);
    expect(rows.map((r) => r.match_id)).toEqual(["SYN-0505"]);
    expect(leftOut).toEqual(["SYN-0001", "SYN-0002", "SYN-0003", "(no id)", "(no id)"]);
  });
});

describe("buildMatchList", () => {
  it("lists live matches first, then finished ones, each most recently written first", () => {
    const { rows } = parseMatchRows([
      row("SYN-0501", "finished", 50),
      row("SYN-0502", "live", 10),
      row("SYN-0503", "finished", 90),
      row("SYN-0504", "live", 30),
    ]);
    expect(liveMatchIds(rows)).toEqual(["SYN-0502", "SYN-0504"]);
    const list = buildMatchList(rows, new Map());
    expect(list.matches.map((m) => m.match_id)).toEqual(["SYN-0504", "SYN-0502", "SYN-0503", "SYN-0501"]);
  });

  it("takes a live match's phase, score and clock from its match_state", () => {
    const { rows } = parseMatchRows([row("SYN-0505", "live", 1)]);
    const list = buildMatchList(rows, new Map([["SYN-0505", state("half_time", "45+2:10", 1, 0)]]));
    expect(list.matches).toEqual([
      {
        match_id: "SYN-0505",
        status: "live",
        home: { team_id: "NBR", name: "Northbridge FC" },
        away: { team_id: "HBA", name: "Harbour Athletic" },
        phase: "half_time",
        score: { home: 1, away: 0 },
        clock: "45+2:10",
      },
    ]);
  });

  it("blanks a live match's numbers when its match_state is missing or broken, and still lists it", () => {
    const { rows } = parseMatchRows([row("SYN-0505", "live", 2), row("SYN-0506", "live", 1)]);
    const broken = { ...state("live", "12:00", 0, 0), phase: "extra_time" };
    const list = buildMatchList(rows, new Map<string, unknown>([["SYN-0505", null], ["SYN-0506", broken]]));
    for (const match of list.matches) expect(match).toMatchObject({ status: "live", phase: null, score: null, clock: null });
  });

  it("shows a finished match at full time with its archived score and no clock, ignoring any match_state", () => {
    const { rows } = parseMatchRows([row("SYN-0504", "finished", 1)]);
    const list = buildMatchList(rows, new Map([["SYN-0504", state("live", "88:00", 0, 0)]]));
    expect(list.matches[0]).toMatchObject({ status: "finished", phase: "full_time", score: { home: 2, away: 1 }, clock: null });
  });

  it("builds what the browser's strict schema accepts", () => {
    const { rows } = parseMatchRows([row("SYN-0505", "live", 2), row("SYN-0504", "finished", 1)]);
    const list = buildMatchList(rows, new Map([["SYN-0505", state("live", "62:14", 1, 0)]]));
    expect(matchListSchema.safeParse(list).success).toBe(true);
  });
});

// Read-only liveness: old archive rows never become invented finished results.
describe("live freshness", () => {
  it("omits stale live rows but keeps recently active and genuinely finished matches", async () => {
    const { currentMatchRows, parseMatchRows } = await import("@/lib/match-list");
    const base = { home_id: "KES", home_name: "Kes", away_id: "ORR", away_name: "Orr", _ts: 1 };
    const { rows } = parseMatchRows([
      { ...base, match_id: "SYN-3000", status: "live" },
      { ...base, match_id: "SYN-3001", status: "live" },
      { ...base, match_id: "SYN-3002", status: "finished", result: { score: { home: 1, away: 0 } } },
      { ...base, _ts: 999, match_id: "SYN-3003", status: "live" },
    ]);
    const states = new Map([["SYN-3001", { _ts: 999 }]]);
    const selected = currentMatchRows(rows, states, 1_000_000);
    expect(selected.map((r) => r.match_id)).toEqual(["SYN-3001", "SYN-3002", "SYN-3003"]);
    expect(rows).toHaveLength(4); // no mutation
    expect(rows[0].status).toBe("live");
  });
});

describe("showcase replays", () => {
  it("reads the setting's match ids and ignores anything else", () => {
    expect([...parseShowcaseIds(" SYN-3012, SYN-3013 ,,nope,SYN-12")]).toEqual(["SYN-3012", "SYN-3013"]);
    expect(parseShowcaseIds(undefined).size).toBe(0);
    expect(parseShowcaseIds("").size).toBe(0);
  });

  it("marks finished showcase matches without changing the order, and never a live one", () => {
    const { rows } = parseMatchRows([row("SYN-3014", "live", 40), row("SYN-3013", "finished", 30), row("SYN-3012", "finished", 20)]);
    const list = buildMatchList(rows, new Map(), new Set(["SYN-3012", "SYN-3014"]));
    expect(list.matches.map((m) => [m.match_id, m.showcase ?? false])).toEqual([
      ["SYN-3014", false],
      ["SYN-3013", false],
      ["SYN-3012", true],
    ]);
    expect(matchListSchema.safeParse(list).success).toBe(true);
  });
});
