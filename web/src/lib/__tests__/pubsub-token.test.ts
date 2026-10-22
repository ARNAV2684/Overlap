import { describe, expect, it } from "vitest";
import { createTokenIssuer, MAX_GROUPS, parseGroups, TOKEN_LIFETIME_MINUTES } from "@/lib/server/pubsub-token";

/** The token's claims (the stand-in does not check them; the real service enforces them). */
function claims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

describe("parseGroups", () => {
  it("accepts one or more match groups and drops repeats", () => {
    expect(parseGroups("match-SYN-0042")).toEqual(["match-SYN-0042"]);
    expect(parseGroups("match-SYN-0042,match-SYN-0043,match-SYN-0042")).toEqual(["match-SYN-0042", "match-SYN-0043"]);
  });

  it("rejects a missing, empty or foreign group, and too many", () => {
    expect(parseGroups(null)).toBeNull();
    expect(parseGroups("")).toBeNull();
    expect(parseGroups("match-SYN-42")).toBeNull();
    expect(parseGroups("match-SYN-0042-casual-en")).toBeNull();
    expect(parseGroups("match-SYN-0042,")).toBeNull();
    expect(parseGroups("everyone")).toBeNull();
    const tooMany = Array.from({ length: MAX_GROUPS + 1 }, (_, i) => `match-SYN-000${i}`).join(",");
    expect(parseGroups(tooMany)).toBeNull();
  });
});

describe("createTokenIssuer (local stand-in)", () => {
  const issuer = createTokenIssuer({ endpoint: "http://localhost:8787", hub: "live", local: true });

  it("returns the stand-in's WebSocket address with the token in the URL", async () => {
    const body = await issuer.issue(["match-SYN-0042"]);
    expect(body.baseUrl).toBe("ws://localhost:8787/client/hubs/live");
    expect(body.url).toBe(`ws://localhost:8787/client/hubs/live?access_token=${body.token}`);
  });

  it("lets the token join only the requested groups, never send, for ten minutes", async () => {
    const token = claims((await issuer.issue(["match-SYN-0042", "match-SYN-0043"])).token);
    expect(token.role).toEqual(["webpubsub.joinLeaveGroup.match-SYN-0042", "webpubsub.joinLeaveGroup.match-SYN-0043"]);
    expect(token["webpubsub.group"]).toEqual(["match-SYN-0042", "match-SYN-0043"]);
    expect(JSON.stringify(token)).not.toMatch(/sendToGroup/);
    expect(token.sub).toBeUndefined();
    expect((token.exp as number) - (token.iat as number)).toBe(TOKEN_LIFETIME_MINUTES * 60);
  });
});
