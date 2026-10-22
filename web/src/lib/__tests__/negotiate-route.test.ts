import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NegotiateBody, TokenIssuer } from "@/lib/server/pubsub-token";
import type { PubSubSettings, StreamEnvResult } from "@/lib/server/stream-env";

// The route reads its settings and makes tokens through these two modules; the tests swap in fakes
const fakes = vi.hoisted(() => ({
  env: null as StreamEnvResult<PubSubSettings> | null,
  issuer: null as TokenIssuer | null,
}));
vi.mock("@/lib/server/stream-env", async (original) => ({
  ...(await original<typeof import("@/lib/server/stream-env")>()),
  readPubSubEnv: () => fakes.env,
}));
vi.mock("@/lib/server/pubsub-token", async (original) => ({
  ...(await original<typeof import("@/lib/server/pubsub-token")>()),
  createTokenIssuer: () => fakes.issuer,
}));

const TOKEN = "token-for-tests";
const BODY: NegotiateBody = {
  baseUrl: "ws://localhost:8787/client/hubs/live",
  url: `ws://localhost:8787/client/hubs/live?access_token=${TOKEN}`,
  token: TOKEN,
};

function fakeIssuer(result: "ok" | "pubsub" | "other" = "ok") {
  const calls: string[][] = [];
  return {
    calls,
    issuer: {
      issue: async (groups: string[]) => {
        calls.push(groups);
        if (result === "pubsub") throw new (await import("@/lib/server/pubsub-token")).PubSubError();
        if (result === "other") throw new TypeError(`bad ${TOKEN}`);
        return BODY;
      },
    } satisfies TokenIssuer,
  };
}

async function get(query: string) {
  vi.resetModules();
  const route = await import("@/app/api/negotiate/route");
  const response = await route.GET(new Request(`http://localhost:3000/api/negotiate${query}`));
  return { status: response.status, cache: response.headers.get("Cache-Control"), body: await response.json() };
}

const logs: string[] = [];
beforeEach(() => {
  fakes.env = { ok: true, settings: { endpoint: "http://localhost:8787", hub: "live", local: true } };
  fakes.issuer = fakeIssuer().issuer;
  logs.length = 0;
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/negotiate", () => {
  it("returns the client URL for the match group, uncached and without a log", async () => {
    const fake = fakeIssuer();
    fakes.issuer = fake.issuer;
    expect(await get("?groups=match-SYN-0042")).toEqual({ status: 200, cache: "no-store", body: BODY });
    expect(fake.calls).toEqual([["match-SYN-0042"]]);
    expect(logs).toEqual([]);
  });

  it("answers 400 bad_groups before reading any setting", async () => {
    fakes.env = null;
    for (const query of ["", "?groups=", "?groups=everyone", "?groups=match-SYN-0042-casual-en"]) {
      expect(await get(query)).toEqual({ status: 400, cache: "no-store", body: { error: "bad_groups" } });
    }
  });

  it("answers 503 negotiate_unavailable without settings, naming them in one log line", async () => {
    fakes.env = { ok: false, problems: [{ name: "OVERLAP_WEBPUBSUB_ENDPOINT", problem: "missing" }] };
    expect(await get("?groups=match-SYN-0042")).toEqual({
      status: 503,
      cache: "no-store",
      body: { error: "negotiate_unavailable" },
    });
    expect(logs).toEqual([
      "Negotiate is unavailable: set OVERLAP_WEBPUBSUB_ENDPOINT (missing). See web/.env.example.",
    ]);
  });

  it("answers 502 pubsub_error when the service fails", async () => {
    fakes.issuer = fakeIssuer("pubsub").issuer;
    expect(await get("?groups=match-SYN-0042")).toEqual({ status: 502, cache: "no-store", body: { error: "pubsub_error" } });
    expect(logs).toEqual(["negotiate: Web PubSub token request failed"]);
  });

  it("answers 500 internal_error otherwise and logs only the error's type", async () => {
    fakes.issuer = fakeIssuer("other").issuer;
    expect(await get("?groups=match-SYN-0042")).toEqual({
      status: 500,
      cache: "no-store",
      body: { error: "internal_error" },
    });
    expect(logs).toEqual(["negotiate: unexpected TypeError"]);
    expect(logs.join(" ")).not.toContain(TOKEN);
  });
});
