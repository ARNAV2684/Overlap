// archive-env.ts — Match archive settings (server only)
//
// Purpose: read the settings the replay route needs to reach the match archive, and say which are missing or
//          malformed without ever repeating a value
// Inputs:  OVERLAP_COSMOS_ENDPOINT, OVERLAP_COSMOS_DATABASE (default live), OVERLAP_COSMOS_KEY (local emulator only),
//          OVERLAP_ARCHIVE_STORAGE (connection string, local) or OVERLAP_ARCHIVE_BLOB_ENDPOINT (Azure). See
//          web/.env.example
// Outputs: readArchiveEnv(): the settings, or the names of the problems; describeArchiveEnvProblems() for one log line
// Spec:    web/specs/realtime.md §5.1 (settings). Plan: vedant-frontend/plans/active/PLAN_web_replay.md
//
// These are the archiver's own variable names (archiver/event_store.py, archiver/tracking_chunks.py). None has the
// NEXT_PUBLIC_ prefix, so Next.js never sends them to the browser; import this file only from server code. Settings
// are optional for the app as a whole: without them the replay route answers replay_unavailable and the live screen
// still runs. That is why this file returns problems instead of throwing like env.ts.

type Source = Record<string, string | undefined>;

export type ArchiveSettings = {
  cosmos: {
    endpoint: string;
    database: string;
    /** The local emulator's key. Null means: sign in with DefaultAzureCredential (managed identity on Azure). */
    key: string | null;
  };
  blob:
    | { kind: "connection-string"; connectionString: string }
    /** Azure: signed in with DefaultAzureCredential. */
    | { kind: "endpoint"; endpoint: string };
};

export type ArchiveEnvProblem = { name: string; problem: "missing" | "not a URL" };

export type ArchiveEnvResult = { ok: true; settings: ArchiveSettings } | { ok: false; problems: ArchiveEnvProblem[] };

const BLOB_NAMES = "OVERLAP_ARCHIVE_STORAGE or OVERLAP_ARCHIVE_BLOB_ENDPOINT";

/** Empty and whitespace-only values count as unset, the way .env files leave a blank line like `NAME=`. */
function value(source: Source, name: string): string | null {
  const raw = source[name]?.trim();
  return raw ? raw : null;
}

function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Reads the archive settings. Never throws; `source` is for tests. */
export function readArchiveEnv(source: Source = process.env): ArchiveEnvResult {
  if (typeof window !== "undefined") throw new Error("archive-env.ts is server-only");

  const problems: ArchiveEnvProblem[] = [];
  const url = (name: string): string | null => {
    const text = value(source, name);
    if (text !== null && !isHttpUrl(text)) problems.push({ name, problem: "not a URL" });
    return text !== null && isHttpUrl(text) ? text.replace(/\/+$/, "") : null;
  };

  const cosmosEndpoint = url("OVERLAP_COSMOS_ENDPOINT");
  if (value(source, "OVERLAP_COSMOS_ENDPOINT") === null) {
    problems.push({ name: "OVERLAP_COSMOS_ENDPOINT", problem: "missing" });
  }

  // The endpoint wins over the connection string, as in archiver/tracking_chunks.py
  const blobEndpoint = url("OVERLAP_ARCHIVE_BLOB_ENDPOINT");
  const connectionString = value(source, "OVERLAP_ARCHIVE_STORAGE");
  const blob: ArchiveSettings["blob"] | null = blobEndpoint
    ? { kind: "endpoint", endpoint: blobEndpoint }
    : connectionString
      ? { kind: "connection-string", connectionString: connectionString.replace(/^"(.*)"$/, "$1") }
      : null;
  if (blob === null && value(source, "OVERLAP_ARCHIVE_BLOB_ENDPOINT") === null) {
    problems.push({ name: BLOB_NAMES, problem: "missing" });
  }

  if (problems.length > 0 || cosmosEndpoint === null || blob === null) return { ok: false, problems };
  return {
    ok: true,
    settings: {
      cosmos: {
        endpoint: cosmosEndpoint,
        database: value(source, "OVERLAP_COSMOS_DATABASE") ?? "live",
        key: value(source, "OVERLAP_COSMOS_KEY"),
      },
      blob,
    },
  };
}

/** One log line naming each problem. Names only: a value never appears. `feature` names what is switched off. */
export function describeArchiveEnvProblems(problems: ArchiveEnvProblem[], feature = "Replay"): string {
  const list = problems.map(({ name, problem }) => `${name} (${problem})`).join(", ");
  return `${feature} is unavailable: set ${list}. See web/.env.example.`;
}
