// start-match.ts — Start one generator run on Azure
//
// Purpose: everything /api/start-match needs: the next free match number, a per-visitor rate limit, whether a run is
//          already going, and starting one execution of the generator's Container Apps job with its own identity
// Inputs:  OVERLAP_GENERATOR_JOB_ID (the job's Azure resource id); the archive's recent match ids; the web app's managed
//          identity (DefaultAzureCredential)
// Outputs: nextMatchNumber(), createRateLimiter(), readStartEnv(), createJobStarter()
// Spec:    infra/specs/security.md §3; web/specs/realtime.md §8
//
// Nothing from the request reaches the job: the route passes only the match number it picked itself. One run at a
// time across the site (the job's executions are checked first), and 3 starts per visitor per hour. A start with an
// override replaces the job's whole container, so the job's own container (image, identity, settings) is read first
// and only OVERLAP_FIRST_MATCH is added to it.

import { DefaultAzureCredential, type TokenCredential } from "@azure/identity";

/** Matches started on Azure count up from here, clear of the numbers local runs use. */
export const AZURE_FIRST_MATCH = 3000;
export const MAX_MATCH_NUMBER = 9999;
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

export type StartSettings = { jobId: string };

export function readStartEnv(source: Record<string, string | undefined> = process.env): StartSettings | null {
  if (source.OVERLAP_LIVE_ENABLED !== "true") return null;
  const jobId = source.OVERLAP_GENERATOR_JOB_ID?.trim();
  if (!jobId || !/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.App\/jobs\/[^/]+$/i.test(jobId)) return null;
  return { jobId };
}

type JobContainer = { name?: string; env?: { name: string; value?: string }[] } & Record<string, unknown>;

/** The job's own container with OVERLAP_FIRST_MATCH set to the match number. */
export function withMatchNumber(container: JobContainer, matchNumber: number): JobContainer {
  const env = (container.env ?? []).filter((e) => e.name !== "OVERLAP_FIRST_MATCH");
  return { ...container, env: [...env, { name: "OVERLAP_FIRST_MATCH", value: String(matchNumber) }] };
}

export type JobStarter = {
  /** True while an execution of the job is still running or about to. */
  running(): Promise<boolean>;
  /** Start one execution that plays match SYN-<number>. */
  start(matchNumber: number): Promise<string | null>;
  execution(name: string): Promise<"active" | "terminal" | "unknown">;
  available(): Promise<boolean>;
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
    async available() {
      try { await call(""); return true; } catch { return false; }
    },
    async execution(name) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) return "unknown";
      try {
        const body = await (await call(`/executions/${name}`)).json() as { properties?: { status?: string } };
        const status = body.properties?.status;
        if (["Succeeded", "Failed", "Stopped"].includes(status ?? "")) return "terminal";
        return ["Running", "Processing"].includes(status ?? "") ? "active" : "unknown";
      } catch { return "unknown"; }
    },
    async running() {
      const body = (await (await call("/executions")).json()) as { value?: { properties?: { status?: string } }[] };
      return (body.value ?? []).some((e) => ["Running", "Processing"].includes(e.properties?.status ?? ""));
    },
    async start(matchNumber) {
      const job = (await (await call("")).json()) as { properties?: { template?: { containers?: JobContainer[] } } };
      const container = job.properties?.template?.containers?.[0];
      if (!container) throw new Error("job has no container");
      const started = await (await call("/start", {
        method: "POST", body: JSON.stringify({ containers: [withMatchNumber(container, matchNumber)] }),
      })).json() as { name?: string };
      return typeof started.name === "string" && /^[a-zA-Z0-9_-]+$/.test(started.name) ? started.name : null;
    },
  };
}
