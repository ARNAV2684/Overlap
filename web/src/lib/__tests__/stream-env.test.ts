import { describe, expect, it } from "vitest";
import { describeStreamEnvProblems, readPubSubEnv, readScreenEnv } from "@/lib/server/stream-env";

const SECRET = "emulator-key-for-tests";

describe("readPubSubEnv", () => {
  it("reads the local stand-in and defaults the hub to live", () => {
    expect(readPubSubEnv({ OVERLAP_WEBPUBSUB_ENDPOINT: "http://localhost:8787/" })).toEqual({
      ok: true,
      settings: { endpoint: "http://localhost:8787", hub: "live", local: true },
    });
    expect(readPubSubEnv({ OVERLAP_WEBPUBSUB_ENDPOINT: "http://127.0.0.1:8787", OVERLAP_WEBPUBSUB_HUB: "live" }))
      .toMatchObject({ ok: true, settings: { local: true } });
  });

  it("treats any other endpoint as Azure (managed identity)", () => {
    expect(readPubSubEnv({ OVERLAP_WEBPUBSUB_ENDPOINT: "https://overlap.webpubsub.azure.com" })).toEqual({
      ok: true,
      settings: { endpoint: "https://overlap.webpubsub.azure.com", hub: "live", local: false },
    });
    // https on localhost is not the stand-in, which only speaks plain http
    expect(readPubSubEnv({ OVERLAP_WEBPUBSUB_ENDPOINT: "https://localhost:8787" })).toMatchObject({
      settings: { local: false },
    });
  });

  it("names a missing or malformed setting, never its value", () => {
    expect(readPubSubEnv({})).toEqual({
      ok: false,
      problems: [{ name: "OVERLAP_WEBPUBSUB_ENDPOINT", problem: "missing" }],
    });
    const bad = readPubSubEnv({ OVERLAP_WEBPUBSUB_ENDPOINT: "ws://localhost:8787", OVERLAP_WEBPUBSUB_HUB: "live hub" });
    expect(bad).toEqual({
      ok: false,
      problems: [
        { name: "OVERLAP_WEBPUBSUB_ENDPOINT", problem: "not a URL" },
        { name: "OVERLAP_WEBPUBSUB_HUB", problem: "not a name" },
      ],
    });
    expect(JSON.stringify(bad)).not.toContain("ws://localhost");
  });
});

describe("readScreenEnv", () => {
  it("reads the local settings: emulator key, database live, container screen", () => {
    expect(readScreenEnv({ OVERLAP_COSMOS_ENDPOINT: "http://localhost:8081", OVERLAP_COSMOS_KEY: SECRET })).toEqual({
      ok: true,
      settings: { endpoint: "http://localhost:8081", database: "live", key: SECRET, container: "screen" },
    });
  });

  it("reads the Azure settings: no key means managed identity; blank values count as unset", () => {
    const result = readScreenEnv({
      OVERLAP_COSMOS_ENDPOINT: "https://overlap.documents.azure.com:443/",
      OVERLAP_COSMOS_DATABASE: " ",
      OVERLAP_COSMOS_KEY: "",
      OVERLAP_COSMOS_CONTAINER: "screen",
    });
    expect(result).toEqual({
      ok: true,
      settings: { endpoint: "https://overlap.documents.azure.com", database: "live", key: null, container: "screen" },
    });
  });

  it("does not need the archive's Blob setting", () => {
    expect(readScreenEnv({ OVERLAP_COSMOS_ENDPOINT: "http://localhost:8081" }).ok).toBe(true);
  });

  it("names the problems without values", () => {
    const result = readScreenEnv({ OVERLAP_COSMOS_KEY: SECRET, OVERLAP_COSMOS_CONTAINER: "screen/../x" });
    expect(result).toEqual({
      ok: false,
      problems: [
        { name: "OVERLAP_COSMOS_ENDPOINT", problem: "missing" },
        { name: "OVERLAP_COSMOS_CONTAINER", problem: "not a name" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe("describeStreamEnvProblems", () => {
  it("is one line naming the feature and each problem", () => {
    expect(describeStreamEnvProblems([{ name: "OVERLAP_WEBPUBSUB_ENDPOINT", problem: "missing" }], "Negotiate")).toBe(
      "Negotiate is unavailable: set OVERLAP_WEBPUBSUB_ENDPOINT (missing). See web/.env.example.",
    );
  });
});
