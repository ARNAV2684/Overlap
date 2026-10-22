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
  it("reads the public setting", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", "SYN-9001");
    expect(await loadEnv()).toEqual({ defaultMatchId: "SYN-9001" });
  });

  it("no longer needs a stream server address", async () => {
    vi.stubEnv("NEXT_PUBLIC_STREAM_BASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", "SYN-9001");
    expect(await loadEnv()).toEqual({ defaultMatchId: "SYN-9001" });
  });

  it("fails loudly, naming the problem and the file to copy", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", "nope");
    const attempt = loadEnv();
    await expect(attempt).rejects.toThrow(/Invalid environment/);
    await expect(attempt).rejects.toThrow(/\.env\.example/);
    await expect(attempt).rejects.toThrow(/NEXT_PUBLIC_DEFAULT_MATCH_ID/);
  });

  it("fails when the setting is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", undefined);
    await expect(loadEnv()).rejects.toThrow(/NEXT_PUBLIC_DEFAULT_MATCH_ID/);
  });

  it("insists on the SYN-NNNN match id format", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_MATCH_ID", "SYN-12");
    await expect(loadEnv()).rejects.toThrow(/SYN-9001/);
  });
});
