import { afterEach, describe, expect, it, vi } from "vitest";

/** env.ts reads and validates at import time, so each case needs a fresh import. */
async function loadEnv() {
  vi.resetModules();
  return (await import("@/lib/env")).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  it("reads the two public settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_STREAM_BASE_URL", "http://localhost:8787");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", "SYN-9001");
    expect(await loadEnv()).toEqual({ streamBaseUrl: "http://localhost:8787", defaultMatchId: "SYN-9001" });
  });

  it("strips trailing slashes from the base URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_STREAM_BASE_URL", "http://localhost:8787///");
    expect((await loadEnv()).streamBaseUrl).toBe("http://localhost:8787");
  });

  it("fails loudly, naming every problem and the file to copy", async () => {
    vi.stubEnv("NEXT_PUBLIC_STREAM_BASE_URL", "not a url");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", "nope");
    const attempt = loadEnv();
    await expect(attempt).rejects.toThrow(/Invalid environment/);
    await expect(attempt).rejects.toThrow(/\.env\.example/);
    await expect(attempt).rejects.toThrow(/NEXT_PUBLIC_STREAM_BASE_URL/);
    await expect(attempt).rejects.toThrow(/NEXT_PUBLIC_DEFAULT_MATCH_ID/);
  });

  it("fails when a setting is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_STREAM_BASE_URL", undefined);
    await expect(loadEnv()).rejects.toThrow(/NEXT_PUBLIC_STREAM_BASE_URL/);
  });

  it("insists on the SYN-NNNN match id format", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", "SYN-12");
    await expect(loadEnv()).rejects.toThrow(/SYN-9001/);
  });
});
