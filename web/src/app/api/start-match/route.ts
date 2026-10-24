// route.ts — Start match API
//
// Purpose: start one new live match on Azure: the generator's Container Apps job plays SYN-<next number> at 20×
// Inputs:  HTTP POST (no body is read); the visitor's address (x-forwarded-for) for the rate limit; the archive's recent
//          matches (archive-store.ts); the job settings (start-match.ts)
// Outputs: 202 { match_id }; 429 { error: "rate_limited" | "match_running" }; 503 { error: "start_unavailable" };
//          502 { error: "start_failed" }
// Spec:    web/specs/realtime.md §8; infra/specs/security.md §3
//
// Nothing from the request reaches the job. Locally (no job settings) the route answers 503 and the generator is run by
// hand, as before.

import { describeArchiveEnvProblems, readArchiveEnv } from "@/lib/server/archive-env";
import { createMatchListStore, type MatchListStore } from "@/lib/server/archive-store";
import { createJobStarter, createRateLimiter, nextMatchNumber, readStartEnv, type JobStarter } from "@/lib/server/start-match";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

const limiter = createRateLimiter();
let current: { key: string; starter: JobStarter; list: MatchListStore } | null = null;

export async function POST(request: Request) {
  const start = readStartEnv();
  const archive = readArchiveEnv();
  if (!start || !archive.ok) {
    if (!archive.ok) console.warn(describeArchiveEnvProblems(archive.problems, "Start match"));
    return fail("start_unavailable", 503);
  }
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.allow(visitor)) return fail("rate_limited", 429);

  const key = JSON.stringify([start, archive.settings]);
  if (current?.key !== key) current = { key, starter: createJobStarter(start), list: createMatchListStore(archive.settings) };
  try {
    if (await current.starter.running()) return fail("match_running", 429);
    const recent = await current.list.recentMatches(100);
    const number = nextMatchNumber(recent.map((m) => String(m.match_id ?? "")));
    if (number === null) return fail("start_unavailable", 503);
    await current.starter.start(number);
    return Response.json({ match_id: `SYN-${String(number).padStart(4, "0")}` }, { status: 202, headers: NO_STORE });
  } catch (error) {
    console.error(`start match: ${error instanceof Error ? error.message : "unexpected error"}`);
    return fail("start_failed", 502);
  }
}
