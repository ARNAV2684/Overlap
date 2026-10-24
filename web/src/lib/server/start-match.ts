// start-match.ts — Start one generator run on Azure
//
// Purpose: everything /api/start-match needs: the next free match number, a per-visitor rate limit, whether a run is
//          already going, and starting one execution of the generator's Container Apps job with its own identity
// Inputs:  OVERLAP_GENERATOR_JOB_ID (the job's Azure resource id), OVERLAP_GENERATOR_IMAGE (its image); the archive's
//          recent match ids; the web app's managed identity (DefaultAzureCredential)
// Outputs: nextMatchNumber(), createRateLimiter(), readStartEnv(), createJobStarter()
// Spec:    infra/specs/security.md §3; web/specs/realtime.md §8
//
// Nothing from the request reaches the job: the route passes only the match number it picked itself. One run at a
// time across the site (the job's executions are checked first), and 3 starts per visitor per hour.

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

/** Matches started on Azure count up from here, clear of the numbers local runs use. */
export const AZURE_FIRST_MATCH = 3000;
export const MAX_MATCH_NUMBER = 9999;
export const STARTS_PER_HOUR = 3;
const ARM = "https://management.azure.com";
const API = "2024-03-01";

/** The next match number: one past the highest SYN-NNNN in the archive, never below AZURE_FIRST_MATCH. */
export function nextMatchNumber(recentIds: readonly string[], floor = AZURE_FIRST_MATCH): number | null {
  let top = floor - 1;
  for (const id of recentIds) {
    const m = /^SYN-(\d{4})$/.exec(id);
    if (m) top = Math.max(top, Number(m[1]));
  }
  const next = top + 1;
  return next > MAX_MATCH_NUMBER ? null : next;
}

/** In-memory, per web replica: at most `limit` starts per key in any rolling hour. */
export function createRateLimiter(limit = STARTS_PER_HOUR, windowMs = 3_600_000, now: () => number = Date.now) {
  const seen = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const t = now();
      const recent = (seen.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        seen.set(key, recent);
        return false;
      }
      recent.push(t);
      seen.set(key, recent);
      return true;
    },
  };
}

export type StartSettings = { jobId: string; image: string };

export function readStartEnv(source: Record<string, string | undefined> = process.env): StartSettings | null {
  const jobId = source.OVERLAP_GENERATOR_JOB_ID?.trim();
  const image = source.OVERLAP_GENERATOR_IMAGE?.trim();
  if (!jobId || !image || !/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.App\/jobs\/[^/]+$/i.test(jobId)) return null;
  return { jobId, image };
}

export type JobStarter = {
  /** True while an execution of the job is still running or about to. */
  running(): Promise<boolean>;
  /** Start one execution that plays match SYN-<number>. */
  start(matchNumber: number): Promise<void>;
};

export function createJobStarter(settings: StartSettings, credential: TokenCredential = new DefaultAzureCredential()): JobStarter {
  const call = async (path: string, init: RequestInit = {}) => {
    const token = await credential.getToken(`${ARM}/.default`);
    if (!token) throw new Error("no management token");
    const response = await fetch(`${ARM}${settings.jobId}${path}?api-version=${API}`, {
      ...init,
      headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`job ${path || "call"} failed (${response.status})`);
    return response;
  };
  return {
    async running() {
      const body = (await (await call("/executions")).json()) as { value?: { properties?: { status?: string } }[] };
      return (body.value ?? []).some((e) => ["Running", "Processing"].includes(e.properties?.status ?? ""));
    },
    async start(matchNumber) {
      await call("/start", {
        method: "POST",
        body: JSON.stringify({
          containers: [
            {
              name: "generator",
              image: settings.image,
              resources: { cpu: 0.5, memory: "1Gi" },
              env: [{ name: "OVERLAP_FIRST_MATCH", value: String(matchNumber) }],
            },
          ],
        }),
      });
    },
  };
}
