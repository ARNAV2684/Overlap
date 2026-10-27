// stream-env.ts — Live stream settings (server only)
//
// Purpose: read the settings the negotiate and snapshot routes need: the Web PubSub endpoint and hub, and the screen
//          relay's Cosmos container. Say which are missing or malformed without ever repeating a value
// Inputs:  OVERLAP_WEBPUBSUB_ENDPOINT, OVERLAP_WEBPUBSUB_HUB (default live); OVERLAP_COSMOS_ENDPOINT,
//          OVERLAP_COSMOS_DATABASE (default live), OVERLAP_COSMOS_KEY (local emulator only), OVERLAP_COSMOS_CONTAINER
//          (default screen). See web/.env.example
// Outputs: readPubSubEnv(), readScreenEnv(): the settings, or the names of the problems; describeStreamEnvProblems()
// Spec:    web/specs/realtime.md §1.1, §3.1
//
// The relay's own variable names (functions/relay_store.py), so one infra/local/.env.local serves both. None has the
// NEXT_PUBLIC_ prefix; import this file only from server code. Like archive-env.ts it returns problems instead of
// throwing, so a missing setting switches one route off and the rest of the app still runs.

type Source = Record<string, string | undefined>;

export type PubSubSettings = {
  endpoint: string;
  hub: string;
  /** The local stand-in (localhost or 127.0.0.1), which accepts any token. Otherwise: DefaultAzureCredential. */
  local: boolean;
};

export type ScreenSettings = {
  endpoint: string;
  database: string;
  /** The local emulator's key. Null means: sign in with DefaultAzureCredential (managed identity on Azure). */
  key: string | null;
  container: string;
};

export type StreamEnvProblem = { name: string; problem: "missing" | "not a URL" | "not a name" };

export type StreamEnvResult<T> = { ok: true; settings: T } | { ok: false; problems: StreamEnvProblem[] };

/** The hosts functions/relay_store.py treats as the local stand-in. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Web PubSub hub names; also safe for Cosmos database and container names. */
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,62}$/;

/** Empty and whitespace-only values count as unset, the way .env files leave a blank line like `NAME=`. */
function value(source: Source, name: string): string | null {
  const raw = source[name]?.trim();
  return raw ? raw : null;
}

function httpUrl(text: string): URL | null {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function serverOnly() {
  if (typeof window !== "undefined") throw new Error("stream-env.ts is server-only");
}

/** A reader that collects problems as it goes. */
function reader(source: Source) {
  const problems: StreamEnvProblem[] = [];
  return {
    problems,
    url(name: string): URL | null {
      const text = value(source, name);
      if (text === null) {
        problems.push({ name, problem: "missing" });
        return null;
      }
      const url = httpUrl(text);
      if (url === null) problems.push({ name, problem: "not a URL" });
      return url;
    },
    name(name: string, fallback: string): string {
      const text = value(source, name) ?? fallback;
      if (!NAME.test(text)) problems.push({ name, problem: "not a name" });
      return text;
    },
  };
}

/** Reads the Web PubSub settings for the negotiate route. Never throws; `source` is for tests. */
export function readPubSubEnv(source: Source = process.env): StreamEnvResult<PubSubSettings> {
  serverOnly();
  const read = reader(source);
  const endpoint = read.url("OVERLAP_WEBPUBSUB_ENDPOINT");
  const hub = read.name("OVERLAP_WEBPUBSUB_HUB", "live");
  if (read.problems.length > 0 || endpoint === null) return { ok: false, problems: read.problems };
  return {
    ok: true,
    settings: {
      endpoint: endpoint.href.replace(/\/+$/, ""),
      hub,
      local: endpoint.protocol === "http:" && LOCAL_HOSTS.has(endpoint.hostname),
    },
  };
}

/** Reads the screen relay's Cosmos settings for the snapshot route. Never throws; `source` is for tests. */
export function readScreenEnv(source: Source = process.env): StreamEnvResult<ScreenSettings> {
  serverOnly();
  const read = reader(source);
  const endpoint = read.url("OVERLAP_COSMOS_ENDPOINT");
  const database = read.name("OVERLAP_COSMOS_DATABASE", "live");
  const container = read.name("OVERLAP_COSMOS_CONTAINER", "screen");
  if (read.problems.length > 0 || endpoint === null) return { ok: false, problems: read.problems };
  return {
    ok: true,
    settings: {
      endpoint: endpoint.href.replace(/\/+$/, ""),
      database,
      key: value(source, "OVERLAP_COSMOS_KEY"),
      container,
    },
  };
}

/** One log line naming each problem. Names only: a value never appears. `feature` names what is switched off. */
export function describeStreamEnvProblems(problems: StreamEnvProblem[], feature: string): string {
  const list = problems.map(({ name, problem }) => `${name} (${problem})`).join(", ");
  return `${feature} is unavailable: set ${list}. See web/.env.example.`;
}
