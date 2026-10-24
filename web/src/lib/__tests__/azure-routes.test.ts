// azure-routes.test.ts — The web app's Azure-only server pieces
//
// Purpose: the insights snapshot read from Cosmos gives the stand-in's answer; the start-match helpers pick the next
//          free match number, limit each visitor, and refuse to run without the job settings
// Inputs:  in-memory documents
// Outputs: pass / fail
// Spec:    web/specs/realtime.md §4, §8; infra/specs/security.md §3

import { describe, expect, it } from "vitest";
import { audienceGroup, buildInsightsSnapshot, LIVE_WINDOW_MS } from "@/lib/server/insights-snapshot";
import { createRateLimiter, nextMatchNumber, readStartEnv } from "@/lib/server/start-match";

const M = "SYN-3001";
const group = audienceGroup(M, { mode: "casual", lang: "en" });
const state = (matchMs: number, extra: Record<string, unknown> = {}) => ({ phase: "live", period: 1, source: { match_ms: matchMs }, ...extra });
const card = (seq: number, showAt: number, extra: Record<string, unknown> = {}) => ({
  id: `d${seq}`,
  group,
  kind: "audience_delivery",
  state: "sent",
  seq,
  period: 1,
  show_at_ms: showAt,
  envelope_kind: "overlay",
  envelope: { match_id: M, seq, kind: "overlay" },
  ...extra,
});

describe("insights snapshot on Azure", () => {
  it("names audience groups like the publisher", () => {
    expect(group).toBe("match-SYN-3001-casual-en");
    expect(audienceGroup(M, { mode: "club", lang: "es", club: "KES" })).toBe("match-SYN-3001-club-KES-es");
    expect(audienceGroup(M, { mode: "player", lang: "fr", player: "KES-09" })).toBe("match-SYN-3001-player-KES-09-fr");
  });

  it("returns the two newest live cards in seq order and the group's cursor", () => {
    const docs = [card(1, 0), card(2, 10_000), card(3, 20_000), { id: "c", group, kind: "audience_counter", last_seq: 4 }];
    const r = buildInsightsSnapshot(M, group, state(30_000), docs);
    expect(r.status).toBe(200);
    expect((r.body.envelopes as { seq: number }[]).map((e) => e.seq)).toEqual([2, 3]);
    expect(r.body.cursor).toBe(4);
  });

  it("drops cards past their live window, from another period, or for another group", () => {
    const docs = [card(1, 0), card(2, 10_000, { period: 2 }), card(3, 10_000, { group: "match-SYN-3001-analyst-en" })];
    const r = buildInsightsSnapshot(M, group, state(LIVE_WINDOW_MS + 1), docs);
    expect(r.body.envelopes).toEqual([]);
  });

  it("counts mismatched envelopes as rejected", () => {
    const r = buildInsightsSnapshot(M, group, state(1000), [card(1, 0, { envelope: { match_id: "SYN-9999", seq: 1 } })]);
    expect(r.body.rejected).toEqual({ count: 1, samples: ["d1"] });
  });

  it("answers 404 for an unknown match and 503 before a playhead", () => {
    expect(buildInsightsSnapshot(M, group, null, []).status).toBe(404);
    expect(buildInsightsSnapshot(M, group, null, [card(1, 0)]).status).toBe(503);
  });
});

describe("start match", () => {
  it("picks one past the highest archived match, never below the Azure range", () => {
    expect(nextMatchNumber([])).toBe(3000);
    expect(nextMatchNumber(["SYN-2504", "SYN-0042"])).toBe(3000);
    expect(nextMatchNumber(["SYN-3004", "SYN-3001", "bad"])).toBe(3005);
    expect(nextMatchNumber(["SYN-9999"])).toBeNull();
  });

  it("allows three starts per visitor per hour", () => {
    let t = 0;
    const limiter = createRateLimiter(3, 3_600_000, () => t);
    expect([1, 2, 3, 4].map(() => limiter.allow("a"))).toEqual([true, true, true, false]);
    expect(limiter.allow("b")).toBe(true);
    t = 3_600_001;
    expect(limiter.allow("a")).toBe(true);
  });

  it("needs the job's resource id and image", () => {
    expect(readStartEnv({})).toBeNull();
    expect(readStartEnv({ OVERLAP_GENERATOR_JOB_ID: "not-an-id", OVERLAP_GENERATOR_IMAGE: "x" })).toBeNull();
    const id = "/subscriptions/s/resourceGroups/rg-overlap/providers/Microsoft.App/jobs/caj-overlap-generator";
    expect(readStartEnv({ OVERLAP_GENERATOR_JOB_ID: id, OVERLAP_GENERATOR_IMAGE: "cr.azurecr.io/generator:1" })).toEqual({
      jobId: id,
      image: "cr.azurecr.io/generator:1",
    });
  });
});
