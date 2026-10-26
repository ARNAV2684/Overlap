import { describe, expect, it } from "vitest";
import { buildCardTrace, cardTraceSchema, describeProblem, momentOfMatch } from "@/lib/card-trace";

// Shaped like job:MO-3013-0006 on Azure (26 Oct): admitted, three MCP tools, one rewrite, translations cut short
const call = (agent: string, ok = true, ms = 1000, reason?: string) => ({ agent, prompt: "abc", model: "gpt-5-mini", ok, duration_ms: ms, ...(reason ? { reason } : {}) });
const JOB = {
  id: "job:MO-3013-0006",
  match_id: "SYN-3013",
  kind: "insight_job",
  moment_id: "MO-3013-0006",
  state: "published",
  terminal_reason: null,
  first_seen_utc: 1000,
  deadline_utc: 1025,
  _ts: 1017,
  stage_outputs: {
    spotter: { trigger: "head_to_head", decision: "admit", model: true, duration_ms: 861.6, calls: [call("spotter", true, 828)] },
    analyst: {
      interpretation: "Vik is winning the contest with repeated interventions.",
      context: "ok",
      tools: [
        { tool: "get_match_state", status: "ok" },
        { tool: "get_live_state", status: "after_moment" },
        { tool: "get_player_context", status: "after_moment" },
      ],
      duration_ms: 2548,
      calls: [call("analyst", true, 1782)],
    },
    narrator: { lines: [{}, {}], fallback: false, model_ids: ["casual", "analyst"], duration_ms: 2682, calls: [call("narrator"), call("narrator")] },
    fact_checker: {
      status: { casual: { verified: true, fallback: false }, analyst: { verified: true, fallback: false }, "club:CAL": { verified: false, fallback: true } },
      rounds: [
        {
          attempt: 0,
          numeric: { casual: [], analyst: [], "club:CAL": ["spelled_number:twice"] },
          meaning: { casual: { pass: true, reasons: [] }, analyst: { pass: false, reasons: ["claims a tilt not supported by the facts"] } },
        },
        { attempt: 1, numeric: { analyst: [] }, meaning: { analyst: { pass: true, reasons: [] } } },
      ],
      duration_ms: 6351,
      calls: [call("fact_checker"), call("narrator", true, 3626), call("fact_checker")],
    },
    translator: {
      status: {
        "casual|en": { verified: true, fallback: false },
        "casual|es": { verified: true, fallback: false },
        "casual|hi": { verified: false, fallback: true },
        "casual|fr": { verified: true, fallback: false },
        "analyst|es": { verified: false, fallback: true },
      },
      dropped: [],
      duration_ms: 1845,
      calls: [call("translator", false, 1117, "timeout")],
    },
    director: { intent: { trigger: "head_to_head", audiences: new Array(24).fill({}) }, duration_ms: 0.2 },
  },
};

describe("buildCardTrace", () => {
  it("lists the agents in the order they ran, with their times and calls", () => {
    const t = buildCardTrace(JOB)!;
    expect(t.steps.map((s) => s.agent)).toEqual(["spotter", "analyst", "narrator", "fact_checker", "translator", "director"]);
    expect(t.steps[0]).toMatchObject({ ms: 861.6, summary: "Admitted; ranked by the model" });
    expect(t.steps[3].calls.map((c) => c.agent)).toEqual(["fact_checker", "narrator", "fact_checker"]); // the rewrite
    expect(t.steps[4].calls[0]).toMatchObject({ ok: false, reason: "timeout" });
    expect(t).toMatchObject({ trigger: "head_to_head", state: "published", model: "gpt-5-mini", elapsed_s: 17, deadline_s: 25, audiences: 24 });
    expect(t.work_s).toBe(14.3);                                                 // 0.86 + 2.55 + 2.68 + 6.35 + 1.85 + 0
    expect(cardTraceSchema.safeParse(t).success).toBe(true);
  });

  it("shows what the analyst read through MCP", () => {
    const t = buildCardTrace(JOB)!;
    expect(t.analyst?.interpretation).toMatch(/^Vik is winning/);
    expect(t.analyst?.tools).toHaveLength(3);
    expect(t.steps[1].summary).toBe("3 MCP tool calls; context read");
  });

  it("says what sent a line back, in plain words, and the verdict", () => {
    const fc = buildCardTrace(JOB)!.fact_check!;
    expect(fc).toMatchObject({ rounds: 2, verified: 2, audiences: 3 });
    expect(fc.sentBack).toEqual([
      { audience: "Club · CAL", reasons: ["a number written in words (twice)"] },
      { audience: "Analyst", reasons: ["claims a tilt not supported by the facts"] },
    ]);
    expect(buildCardTrace(JOB)!.steps[3].summary).toBe("2 of 3 lines passed after 1 rewrite");
  });

  it("counts translations per language, English left out", () => {
    expect(buildCardTrace(JOB)!.translation).toEqual({
      langs: [
        { lang: "es", verified: 1, total: 2 },
        { lang: "hi", verified: 0, total: 1 },
        { lang: "fr", verified: 1, total: 1 },
      ],
      dropped: 0,
    });
  });

  it("marks a narrator that fell back, and reads a recap job", () => {
    const recap = {
      ...JOB,
      moment_id: "RC-3013",
      stage_outputs: { recap_writer: { lines: [{}, {}], fallback: true, model_ids: [], duration_ms: 5600, calls: [call("recap_writer")] } },
    };
    const t = buildCardTrace(recap)!;
    expect(t.trigger).toBe("recap");
    expect(t.steps[0]).toMatchObject({ agent: "recap_writer", ownOutput: false });
  });

  it("leaves time out while a job is still running, and rejects what is not a job", () => {
    expect(buildCardTrace({ ...JOB, state: "running" })!.elapsed_s).toBeNull();
    expect(buildCardTrace({ id: "x" })).toBeNull();
    expect(buildCardTrace(null)).toBeNull();
    expect(buildCardTrace({ ...JOB, stage_outputs: "junk" })!.steps).toEqual([]);
  });
});

describe("describeProblem and momentOfMatch", () => {
  it("names numeric problems in words", () => {
    expect(describeProblem("number_form:range")).toBe("a number in the wrong form (range)");
    expect(describeProblem("claims_without_numbers")).toBe("a fact it named but did not use");
    expect(describeProblem("text_differs:home_goals")).toBe("a number that differs from the fact");
    expect(describeProblem("something_new")).toBe("something new");
  });

  it("accepts only this match's moments and recap", () => {
    expect(momentOfMatch("MO-3013-0006", "SYN-3013")).toBe(true);
    expect(momentOfMatch("RC-3013", "SYN-3013")).toBe(true);
    expect(momentOfMatch("MO-3012-0006", "SYN-3013")).toBe(false);
    expect(momentOfMatch("job:MO-3013-0006", "SYN-3013")).toBe(false);
    expect(momentOfMatch("../x", "SYN-3013")).toBe(false);
  });
});
