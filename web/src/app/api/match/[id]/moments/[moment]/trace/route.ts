// route.ts — How one card was made
//
// Purpose: the agents' work behind one card, for the "How this card was made" drawer: each agent's time and model
//          calls, the analyst's MCP tools, the fact-check rounds and verdict, the translations
// Inputs:  HTTP GET; Cosmos `moments` (the job record `job:<moment id>`) through jobs-store.ts
// Outputs: JSON CardTrace (card-trace.ts), or { error }
// Spec:    web/specs/realtime.md §5.4
//
// No cache: a job can still be running when its card is opened. The record holds no prompts and no line text beyond
// what the drawer shows; settings and keys never appear in a response or a log line.

import { buildCardTrace, momentOfMatch } from "@/lib/card-trace";
import { isMatchId } from "@/lib/contracts";
import { createJobsStore, type JobsStore } from "@/lib/server/jobs-store";
import { describeStreamEnvProblems, readScreenEnv } from "@/lib/server/stream-env";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

let current: { key: string; store: JobsStore } | null = null;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; moment: string }> }) {
  const { id, moment } = await params;
  if (!isMatchId(id)) return fail("bad_match_id", 400);
  if (!momentOfMatch(moment, id)) return fail("bad_moment_id", 400);

  const env = readScreenEnv();
  if (!env.ok) {
    console.warn(describeStreamEnvProblems(env.problems, "Card trace"));
    return fail("trace_unavailable", 503);
  }
  const key = JSON.stringify(env.settings);
  if (current?.key !== key) current = { key, store: createJobsStore(env.settings) };

  try {
    const job = await current.store.job(id, moment);
    if (job === null) return fail("trace_not_found", 404);
    const trace = buildCardTrace(job);
    if (trace === null) return fail("trace_not_found", 404);
    return Response.json(trace, { headers: NO_STORE });
  } catch (error) {
    console.error(`card trace: ${error instanceof Error ? error.message : "unexpected error"}`);
    return fail("storage_error", 502);
  }
}
