import { describe, expect, it } from "vitest";
import { describeArchiveEnvProblems, readArchiveEnv } from "@/lib/server/archive-env";

const LOCAL = {
  OVERLAP_COSMOS_ENDPOINT: "http://localhost:8081",
  OVERLAP_COSMOS_DATABASE: "live",
  OVERLAP_COSMOS_KEY: "emulator-key-for-tests",
  OVERLAP_ARCHIVE_STORAGE: "UseDevelopmentStorage=true",
};

describe("readArchiveEnv", () => {
  it("reads the local settings: emulator key and Azurite connection string", () => {
    expect(readArchiveEnv(LOCAL)).toEqual({
      ok: true,
      settings: {
        cosmos: { endpoint: "http://localhost:8081", database: "live", key: "emulator-key-for-tests" },
        blob: { kind: "connection-string", connectionString: "UseDevelopmentStorage=true" },
      },
    });
  });

  it("reads the Azure settings: no key means managed identity, and the Blob endpoint wins", () => {
    const result = readArchiveEnv({
      OVERLAP_COSMOS_ENDPOINT: "https://overlap.documents.azure.com:443/",
      OVERLAP_ARCHIVE_BLOB_ENDPOINT: "https://overlapstore.blob.core.windows.net/",
      OVERLAP_ARCHIVE_STORAGE: "UseDevelopmentStorage=true",
    });
    expect(result).toEqual({
      ok: true,
      settings: {
        cosmos: { endpoint: "https://overlap.documents.azure.com:443", database: "live", key: null },
        blob: { kind: "endpoint", endpoint: "https://overlapstore.blob.core.windows.net" },
      },
    });
  });

  it("treats blank values as unset and defaults the database to live", () => {
    const result = readArchiveEnv({ ...LOCAL, OVERLAP_COSMOS_DATABASE: "  ", OVERLAP_COSMOS_KEY: "" });
    expect(result.ok && result.settings.cosmos).toEqual({ endpoint: "http://localhost:8081", database: "live", key: null });
  });

  it("strips quotes a shell left around the connection string", () => {
    const result = readArchiveEnv({ ...LOCAL, OVERLAP_ARCHIVE_STORAGE: '"UseDevelopmentStorage=true"' });
    expect(result.ok && result.settings.blob).toEqual({
      kind: "connection-string",
      connectionString: "UseDevelopmentStorage=true",
    });
  });

  it("lists every missing setting at once", () => {
    expect(readArchiveEnv({})).toEqual({
      ok: false,
      problems: [
        { name: "OVERLAP_COSMOS_ENDPOINT", problem: "missing" },
        { name: "OVERLAP_ARCHIVE_STORAGE or OVERLAP_ARCHIVE_BLOB_ENDPOINT", problem: "missing" },
      ],
    });
  });

  it("rejects endpoints that are not http or https URLs", () => {
    const result = readArchiveEnv({
      ...LOCAL,
      OVERLAP_COSMOS_ENDPOINT: "localhost:8081",
      OVERLAP_ARCHIVE_BLOB_ENDPOINT: "ftp://store",
    });
    expect(result).toEqual({
      ok: false,
      problems: [
        { name: "OVERLAP_COSMOS_ENDPOINT", problem: "not a URL" },
        { name: "OVERLAP_ARCHIVE_BLOB_ENDPOINT", problem: "not a URL" },
      ],
    });
  });
});

describe("describeArchiveEnvProblems", () => {
  it("names the settings and never repeats a value", () => {
    const secret = "AccountKey=do-not-print-me";
    const result = readArchiveEnv({ OVERLAP_COSMOS_KEY: secret, OVERLAP_COSMOS_ENDPOINT: secret });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const line = describeArchiveEnvProblems(result.problems);
    expect(line).toBe(
      "Replay is unavailable: set OVERLAP_COSMOS_ENDPOINT (not a URL), " +
        "OVERLAP_ARCHIVE_STORAGE or OVERLAP_ARCHIVE_BLOB_ENDPOINT (missing). See web/.env.example.",
    );
    expect(line).not.toContain(secret);
  });
});
