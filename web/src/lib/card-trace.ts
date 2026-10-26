// card-trace.ts — How one card was made
//
// Purpose: turn the agents' shared job record for a moment (the `insight_job` document in Cosmos `moments`,
//          agents/specs/workflow.md §2) into what the "How this card was made" drawer shows: each agent in the order
//          it ran, its time and model calls, the analyst's MCP tools, the fact-check rounds and verdict, the
//          translations, and the job's time against its deadline
// Inputs:  the raw job document (unknown shape: read loosely, so a richer record never breaks the drawer)
// Outputs: buildCardTrace(), momentOfMatch(), cardTraceSchema, CardTrace; AGENT_LABEL, AGENT_ROLE, describeProblem()
// Spec:    web/specs/screens.md §4.1; web/specs/realtime.md §5.4
//
// Pure: no I/O. The job record holds no prompts and no hidden reasoning (workflow.md §2: bounded audit fields only);
// the drawer shows the analyst's interpretation, which by design has no numbers, and the fact-checker's reasons.

import { z } from "zod";

export const TRACE_AGENTS = ["spotter", "analyst", "recap_writer", "narrator", "fact_checker", "translator", "director"] as const;
export type TraceAgent = (typeof TRACE_AGENTS)[number];

export const AGENT_LABEL: Record<TraceAgent, string> = {
  spotter: "Spotter",
  analyst: "Analyst",
  recap_writer: "Recap writer",
  narrator: "Narrator",
  fact_checker: "Fact-checker",
  translator: "Translator",
  director: "Director",
};

export const AGENT_ROLE: Record<TraceAgent, string> = {
  spotter: "Decides whether the moment deserves a card",
  analyst: "Reads the match through our MCP server and says why it matters",
  recap_writer: "Writes the full-time recap from a fact pack built by code",
  narrator: "Writes one line for each audience",
  fact_checker: "Checks every number in code, then the meaning with a second model",
  translator: "Spanish, Hindi and French with Azure AI Translator, re-checked",
  director: "Times the card and sends one to each audience group",
};

const loose = z.looseObject({});
const callSchema = z.looseObject({
  agent: z.string(),
  model: z.string().optional(),
  ok: z.boolean(),
  reason: z.string().optional(),
  duration_ms: z.number().optional(),
});
const jobSchema = z.looseObject({
  moment_id: z.string(),
  match_id: z.string(),
  state: z.string(),
  terminal_reason: z.string().nullable().optional(),
  first_seen_utc: z.number().optional(),
  deadline_utc: z.number().optional(),
  _ts: z.number().optional(),
  stage_outputs: z.record(z.string(), loose).catch({}),
});

const traceCall = z.object({ agent: z.string(), ok: z.boolean(), reason: z.string().nullable(), ms: z.number().nullable() });
const traceStep = z.object({
  agent: z.enum(TRACE_AGENTS),
  ms: z.number().nullable(),
  summary: z.string(),
  ownOutput: z.boolean(),
  calls: z.array(traceCall),
});
export const cardTraceSchema = z.object({
  moment_id: z.string(),
  trigger: z.string().nullable(),
  state: z.string(),
  terminal_reason: z.string().nullable(),
  model: z.string().nullable(),
  elapsed_s: z.number().nullable(),
  work_s: z.number().nullable(),
  deadline_s: z.number().nullable(),
  steps: z.array(traceStep),
  analyst: z
    .object({ interpretation: z.string().nullable(), tools: z.array(z.object({ tool: z.string(), status: z.string() })) })
    .nullable(),
  fact_check: z
    .object({
      rounds: z.number(),
      verified: z.number(),
      audiences: z.number(),
      sentBack: z.array(z.object({ audience: z.string(), reasons: z.array(z.string()) })),
    })
    .nullable(),
  translation: z
    .object({ langs: z.array(z.object({ lang: z.string(), verified: z.number(), total: z.number() })), dropped: z.number() })
    .nullable(),
  audiences: z.number().nullable(),
});
export type CardTrace = z.infer<typeof cardTraceSchema>;
export type TraceStep = z.infer<typeof traceStep>;

/** A moment (`MO-3013-0006`) or the recap (`RC-3013`) of this match: the number after the prefix is the match's. */
export function momentOfMatch(momentId: string, matchId: string): boolean {
  const m = /^(?:MO-(\d{4,})-\d{4,}|RC-(\d{4,}))$/.exec(momentId);
  return m !== null && `SYN-${m[1] ?? m[2]}` === matchId;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const round1 = (x: number) => Math.round(x * 10) / 10;

/** A numeric-check code from the fact-checker (`number_form:range`, `unknown_name:Vik`) in plain words. */
export function describeProblem(code: string): string {
  const at = code.indexOf(":");
  const [kind, detail] = at < 0 ? [code, ""] : [code.slice(0, at), code.slice(at + 1)];
  const words: Record<string, string> = {
    text_differs: "a number that differs from the fact",
    unit_wrong: "the wrong unit",
    unit_missing: "a missing unit",
    numbers_without_claims: "a number with no fact behind it",
    claims_without_numbers: "a fact it named but did not use",
    number_form: "a number in the wrong form",
    spelled_number: "a number written in words",
    unknown_name: "a name not in the evidence",
    score_not_from_facts: "a score not taken from the facts",
  };
  const said = words[kind] ?? kind.replace(/_/g, " ");
  return detail && kind !== "text_differs" && kind !== "unit_wrong" ? `${said} (${detail})` : said;
}

/** Who a line was for, from its id: `casual`, `analyst`, `club:CAL`, `player:CAL-06`. */
function audienceLabel(id: string): string {
  if (id.startsWith("club:")) return `Club · ${id.slice(5)}`;
  if (id.startsWith("player:")) return `Player · ${id.slice(7)}`;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function summary(agent: TraceAgent, out: Record<string, unknown>): { summary: string; ownOutput: boolean } {
  switch (agent) {
    case "spotter": {
      const decision = str(out.decision) ?? "";
      if (decision === "admit") return { summary: out.model ? "Admitted; ranked by the model" : "Admitted by its rules", ownOutput: true };
      if (decision.startsWith("merge_into")) return { summary: "Merged into a moment on the same event", ownOutput: true };
      return { summary: `Not shown (${str(out.reason) ?? decision})`, ownOutput: true };
    }
    case "analyst": {
      const tools = arr(out.tools).length;
      const ok = str(out.context) === "ok";
      return { summary: `${tools} MCP tool call${tools === 1 ? "" : "s"}; ${ok ? "context read" : "context unavailable"}`, ownOutput: ok && Boolean(str(out.interpretation)) };
    }
    case "narrator":
    case "recap_writer": {
      const written = arr(out.model_ids).length;
      const total = arr(out.lines).length || written;
      return out.fallback || written === 0
        ? { summary: "The model's lines did not arrive; checked templates instead", ownOutput: false }
        : { summary: `${written} line${written === 1 ? "" : "s"} written by the model${total > written ? ` (${total - written} template)` : ""}`, ownOutput: true };
    }
    case "fact_checker": {
      const status = Object.values(obj(out.status)).map(obj);
      const passed = status.filter((s) => s.verified && !s.fallback).length;
      const rounds = arr(out.rounds).length;
      return {
        summary: `${passed} of ${status.length} lines passed${rounds > 1 ? ` after ${rounds - 1} rewrite${rounds > 2 ? "s" : ""}` : ""}`,
        ownOutput: passed > 0,
      };
    }
    case "translator": {
      const entries = Object.entries(obj(out.status)).filter(([k]) => !k.endsWith("|en"));
      const passed = entries.filter(([, s]) => obj(s).verified && !obj(s).fallback).length;
      return { summary: entries.length ? `${passed} of ${entries.length} translations checked and kept` : "No translations needed", ownOutput: passed > 0 };
    }
    case "director": {
      const audiences = arr(obj(out.intent).audiences).length;
      return { summary: `Card timed and sent to ${audiences} audience group${audiences === 1 ? "" : "s"}`, ownOutput: true };
    }
  }
}

/** The drawer's view of one job record, or null when the record is not a job this drawer understands. */
export function buildCardTrace(raw: unknown): CardTrace | null {
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) return null;
  const job = parsed.data;
  const outputs = job.stage_outputs;
  const ran = TRACE_AGENTS.filter((a) => a in outputs);

  // A model call is listed under the stage that made it; a rewrite by the narrator shows under the fact-checker
  const steps: TraceStep[] = ran.map((agent) => {
    const out = obj(outputs[agent]);
    const calls = arr(out.calls).flatMap((c) => {
      const p = callSchema.safeParse(c);
      return p.success ? [{ agent: p.data.agent, ok: p.data.ok, reason: p.data.reason ?? null, ms: num(p.data.duration_ms) }] : [];
    });
    return { agent, ms: num(out.duration_ms), calls, ...summary(agent, out) };
  });

  const model =
    ran.flatMap((a) => arr(obj(outputs[a]).calls).map((c) => str(obj(c).model))).find((m): m is string => m !== null) ?? null;

  const analystOut = "analyst" in outputs ? obj(outputs.analyst) : null;
  const analyst = analystOut
    ? {
        interpretation: str(analystOut.interpretation),
        tools: arr(analystOut.tools).flatMap((t) => {
          const o = obj(t);
          return str(o.tool) ? [{ tool: o.tool as string, status: str(o.status) ?? "unknown" }] : [];
        }),
      }
    : null;

  const checkOut = "fact_checker" in outputs ? obj(outputs.fact_checker) : null;
  const fact_check = checkOut
    ? (() => {
        const status = Object.values(obj(checkOut.status)).map(obj);
        const rounds = arr(checkOut.rounds).map(obj);
        // What sent a line back: its numeric problems and failed meaning checks in the rounds before the last
        const sentBack = new Map<string, Set<string>>();
        rounds.forEach((r, i) => {
          const last = i === rounds.length - 1 && rounds.length > 1;
          if (last) return;
          for (const [id, problems] of Object.entries(obj(r.numeric))) {
            for (const p of arr(problems)) if (typeof p === "string") (sentBack.get(id) ?? sentBack.set(id, new Set()).get(id)!).add(describeProblem(p));
          }
          for (const [id, m] of Object.entries(obj(r.meaning))) {
            const mo = obj(m);
            if (mo.pass === false) for (const reason of arr(mo.reasons)) if (typeof reason === "string") (sentBack.get(id) ?? sentBack.set(id, new Set()).get(id)!).add(reason);
          }
        });
        return {
          rounds: rounds.length,
          verified: status.filter((s) => s.verified && !s.fallback).length,
          audiences: status.length,
          sentBack: [...sentBack.entries()].map(([id, reasons]) => ({ audience: audienceLabel(id), reasons: [...reasons].slice(0, 3) })).slice(0, 4),
        };
      })()
    : null;

  const translateOut = "translator" in outputs ? obj(outputs.translator) : null;
  const translation = translateOut
    ? (() => {
        const byLang = new Map<string, { verified: number; total: number }>();
        for (const [key, s] of Object.entries(obj(translateOut.status))) {
          const lang = key.split("|")[1];
          if (!lang || lang === "en") continue;
          const row = byLang.get(lang) ?? { verified: 0, total: 0 };
          row.total += 1;
          if (obj(s).verified && !obj(s).fallback) row.verified += 1;
          byLang.set(lang, row);
        }
        const order = ["es", "hi", "fr"];
        return {
          langs: [...byLang.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([lang, r]) => ({ lang, ...r })),
          dropped: arr(translateOut.dropped).length,
        };
      })()
    : null;

  const directorOut = "director" in outputs ? obj(obj(outputs.director).intent) : null;
  const first = num(job.first_seen_utc);
  const deadline = num(job.deadline_utc);
  const done = num(job._ts);
  const terminal = !["pending", "running"].includes(job.state);

  return {
    moment_id: job.moment_id,
    trigger: str(obj(outputs.spotter).trigger) ?? str(directorOut?.trigger) ?? (job.moment_id.startsWith("RC-") ? "recap" : null),
    state: job.state,
    terminal_reason: job.terminal_reason ?? null,
    model,
    elapsed_s: first !== null && done !== null && terminal ? round1(Math.max(0, done - first)) : null,
    // The agents' own time: the stages run one after another (the narrator's two calls run side by side inside its stage)
    work_s: steps.some((s) => s.ms !== null) ? round1(steps.reduce((t, s) => t + (s.ms ?? 0), 0) / 1000) : null,
    deadline_s: first !== null && deadline !== null ? round1(deadline - first) : null,
    steps,
    analyst,
    fact_check,
    translation,
    audiences: directorOut ? arr(directorOut.audiences).length : null,
  };
}
