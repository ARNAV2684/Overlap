import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiError, createApiClient, createMatchListClient } from "@/lib/api";
import { envelope, makeEvent, makeFrame, makeSetup } from "./fixtures";

// A small fake of this app's routes. Each test sets `respond` to say what it should answer.
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let respond: Handler;
let seenHeaders: IncomingMessage["headers"] = {};
let seenUrl = "";
let server: Server;
let baseUrl = "";

const json = (res: ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

beforeAll(async () => {
  server = createServer((req, res) => {
    seenHeaders = req.headers;
    seenUrl = req.url ?? "";
    respond(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  respond = (_req, res) => json(res, { error: "no handler set" }, 500);
  seenHeaders = {};
  seenUrl = "";
});

const client = () => createApiClient(baseUrl);
const lists = () => createMatchListClient(baseUrl);
const failure = async (promise: Promise<unknown>): Promise<ApiError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the call to fail");
};

describe("negotiate", () => {
  it("sends the groups as one comma-separated parameter and returns the parsed answer", async () => {
    respond = (_req, res) => json(res, { baseUrl: "ws://x/client/hubs/live", url: "ws://x/client/hubs/live?t=1", token: "tok" });
    const result = await client().negotiate(["match-SYN-0042", "match-SYN-0042-casual-en"]);
    expect(result).toEqual({ baseUrl: "ws://x/client/hubs/live", url: "ws://x/client/hubs/live?t=1", token: "tok" });
    expect(new URL(seenUrl, baseUrl).pathname).toBe("/api/negotiate");
    expect(new URL(seenUrl, baseUrl).searchParams.get("groups")).toBe("match-SYN-0042,match-SYN-0042-casual-en");
  });

  it("rejects an answer with an extra field (invalid-response)", async () => {
    respond = (_req, res) => json(res, { baseUrl: "a", url: "b", token: "c", extra: 1 });
    expect((await failure(client().negotiate(["g"]))).kind).toBe("invalid-response");
  });

  it("rejects an answer with a missing field", async () => {
    respond = (_req, res) => json(res, { baseUrl: "a", url: "b" });
    expect((await failure(client().negotiate(["g"]))).kind).toBe("invalid-response");
  });
});

describe("listMatches (this app's /api/matches)", () => {
  const teams = {
    home: { team_id: "NBR", name: "Northbridge FC" },
    away: { team_id: "HBA", name: "Harbour Athletic" },
  };
  const live = { match_id: "SYN-0505", status: "live", ...teams, phase: "live", score: { home: 1, away: 0 }, clock: "62:14" };
  const waiting = { match_id: "SYN-0506", status: "live", ...teams, phase: null, score: null, clock: null };
  const finished = { match_id: "SYN-0504", status: "finished", ...teams, phase: "full_time", score: { home: 2, away: 2 }, clock: null };

  it("asks this app's route and returns the matches, allowing nulls before the stats engine's first numbers", async () => {
    respond = (_req, res) => json(res, { matches: [live, waiting, finished] });
    const matches = await lists().listMatches();
    expect(seenUrl).toBe("/api/matches");
    expect(matches).toEqual([live, waiting, finished]);
  });

  it("returns an empty list", async () => {
    respond = (_req, res) => json(res, { matches: [] });
    expect(await lists().listMatches()).toEqual([]);
  });

  it("rejects an old bare list, an unknown status and an extra field (invalid-response)", async () => {
    for (const body of [[], { matches: [{ ...live, status: "abandoned" }] }, { matches: [{ ...live, group: "match-SYN-0505" }] }]) {
      respond = (_req, res) => json(res, body);
      expect((await failure(lists().listMatches())).kind).toBe("invalid-response");
    }
  });

  it("reports 503 matches_unavailable as kind http with the status, which the picker words as not set up", async () => {
    respond = (_req, res) => json(res, { error: "matches_unavailable" }, 503);
    expect(await failure(lists().listMatches())).toMatchObject({ kind: "http", status: 503 });
  });
});

describe("getSnapshot", () => {
  const status = envelope("status", { phase: "live", period: 1, score: { home: 0, away: 0 } }, { seq: 1 });
  const event = envelope("event", makeEvent(), { seq: 3 });

  it("returns the setup, the status and the validated envelopes in the order sent", async () => {
    respond = (_req, res) =>
      json(res, {
        match_id: "SYN-0042",
        setup: makeSetup(),
        status,
        envelopes: [status, event, envelope("positions", { frames: [makeFrame()] }, { seq: 40 })],
      });
    const snapshot = await client().getSnapshot("SYN-0042");
    expect(snapshot.matchId).toBe("SYN-0042");
    expect(snapshot.setup.teams.home.name).toBe("Northbridge FC");
    expect(snapshot.status?.kind).toBe("status");
    expect(snapshot.envelopes.map((e) => [e.seq, e.kind])).toEqual([
      [1, "status"],
      [3, "event"],
      [40, "positions"],
    ]);
    expect(snapshot.rejected).toEqual({ count: 0, samples: [] });
    expect(seenUrl).toBe("/api/match/SYN-0042/snapshot");
  });

  it("counts and skips a bad envelope instead of failing the whole catch-up", async () => {
    const bad = envelope("event", { nope: 1 }, { seq: 4 });
    respond = (_req, res) => json(res, { match_id: "SYN-0042", setup: makeSetup(), status, envelopes: [status, bad, event] });
    const snapshot = await client().getSnapshot("SYN-0042");
    expect(snapshot.envelopes.map((e) => e.seq)).toEqual([1, 3]);
    expect(snapshot.rejected.count).toBe(1);
    expect(snapshot.rejected.samples[0]).toMatch(/^Rejected event seq 4/);
  });

  it("keeps only the first few reasons", async () => {
    const bad = (seq: number) => envelope("event", { nope: 1 }, { seq });
    respond = (_req, res) =>
      json(res, { match_id: "SYN-0042", setup: makeSetup(), status: null, envelopes: [bad(1), bad(2), bad(3), bad(4), bad(5)] });
    const snapshot = await client().getSnapshot("SYN-0042");
    expect(snapshot.rejected.count).toBe(5);
    expect(snapshot.rejected.samples).toHaveLength(3);
  });

  it("accepts the server's own rejected count (CONTRACTS.md §7.3) and adds it to the client's", async () => {
    const bad = envelope("event", { nope: 1 }, { seq: 4 });
    respond = (_req, res) =>
      json(res, {
        match_id: "SYN-0042",
        setup: makeSetup(),
        status,
        envelopes: [status, bad, event],
        rejected: { count: 2, samples: ["env-7: unknown kind", "env-9: seq missing"] },
      });
    const snapshot = await client().getSnapshot("SYN-0042");
    expect(snapshot.envelopes.map((e) => e.seq)).toEqual([1, 3]);
    expect(snapshot.rejected.count).toBe(3);
    expect(snapshot.rejected.samples).toEqual([
      expect.stringMatching(/^Rejected event seq 4/),
      "Rejected by the server: env-7: unknown kind",
      "Rejected by the server: env-9: seq missing",
    ]);
  });

  it("accepts a server count of zero, as the relay sends when nothing was left out", async () => {
    respond = (_req, res) =>
      json(res, { match_id: "SYN-0042", setup: makeSetup(), status, envelopes: [status], rejected: { count: 0, samples: [] } });
    expect((await client().getSnapshot("SYN-0042")).rejected).toEqual({ count: 0, samples: [] });
  });

  it("rejects a malformed server count (invalid-response)", async () => {
    respond = (_req, res) =>
      json(res, { match_id: "SYN-0042", setup: makeSetup(), status, envelopes: [], rejected: { count: -1, samples: [] } });
    expect((await failure(client().getSnapshot("SYN-0042"))).kind).toBe("invalid-response");
  });

  it("returns a null status before the match has started", async () => {
    respond = (_req, res) => json(res, { match_id: "SYN-0042", setup: makeSetup(), status: null, envelopes: [] });
    expect((await client().getSnapshot("SYN-0042")).status).toBeNull();
  });

  it("rejects a snapshot for a different match (invalid-response)", async () => {
    respond = (_req, res) => json(res, { match_id: "SYN-0001", setup: makeSetup(), status: null, envelopes: [] });
    const error = await failure(client().getSnapshot("SYN-0042"));
    expect(error.kind).toBe("invalid-response");
    expect(error.message).toContain("SYN-0001");
  });

  it("rejects a snapshot whose setup is broken", async () => {
    const setup = makeSetup();
    setup.teams.home.lineup.pop();
    respond = (_req, res) => json(res, { match_id: "SYN-0042", setup, status: null, envelopes: [] });
    expect((await failure(client().getSnapshot("SYN-0042"))).kind).toBe("invalid-response");
  });

  it("puts the match id in the path safely", async () => {
    respond = (_req, res) => json(res, { error: "unknown" }, 404);
    await failure(client().getSnapshot("SYN-0042/../x"));
    expect(seenUrl).toBe("/api/match/SYN-0042%2F..%2Fx/snapshot");
  });
});

describe("failures", () => {
  it("reports an error status as kind http, with the status", async () => {
    respond = (_req, res) => json(res, { error: "unknown match" }, 404);
    const error = await failure(client().getSnapshot("SYN-0000"));
    expect(error).toMatchObject({ kind: "http", status: 404 });
  });

  it("reports a server error as kind http", async () => {
    respond = (_req, res) => json(res, { error: "boom" }, 500);
    expect(await failure(lists().listMatches())).toMatchObject({ kind: "http", status: 500 });
  });

  it("reports an unreachable server as kind network, naming which server", async () => {
    const dead = createServer();
    await new Promise<void>((resolve) => dead.listen(0, "127.0.0.1", resolve));
    const port = (dead.address() as AddressInfo).port;
    await new Promise<void>((resolve) => dead.close(() => resolve()));
    const deadUrl = `http://127.0.0.1:${port}`;
    expect(await failure(createMatchListClient(deadUrl, 2000).listMatches())).toMatchObject({
      kind: "network",
      message: "match list: cannot reach this app's match list",
    });
    expect(await failure(createApiClient(deadUrl, 2000).negotiate(["g"]))).toMatchObject({
      kind: "network",
      message: "negotiate: cannot reach this app's stream routes",
    });
  });

  it("reports a slow server as kind timeout", async () => {
    respond = (_req, res) => setTimeout(() => json(res, { matches: [] }), 400);
    expect((await failure(createMatchListClient(baseUrl, 50).listMatches())).kind).toBe("timeout");
  });

  it("reports a cancelled call as kind aborted", async () => {
    respond = (_req, res) => setTimeout(() => json(res, { matches: [] }), 400);
    const controller = new AbortController();
    const pending = failure(lists().listMatches(controller.signal));
    controller.abort();
    expect((await pending).kind).toBe("aborted");
  });

  it("reports a body that is not JSON as invalid-response", async () => {
    respond = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello");
    };
    expect((await failure(lists().listMatches())).kind).toBe("invalid-response");
  });
});

describe("CORS safety", () => {
  it("sends no custom request headers, so a browser needs no preflight", async () => {
    // Same origin today, but a header that is not CORS-safelisted would make any cross-origin use need a preflight.
    respond = (_req, res) => json(res, { baseUrl: "a", url: "b", token: "c" });
    await client().negotiate(["g"]);
    const names = Object.keys(seenHeaders);
    expect(names).not.toContain("cache-control");
    expect(names).not.toContain("authorization");
    expect(names.filter((n) => n.startsWith("x-"))).toEqual([]);
    expect(names).not.toContain("content-type"); // a GET has no body
  });
});
