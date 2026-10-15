import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The same "@/" shortcut as tsconfig.json
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Values for src/lib/env.ts, so tests never depend on a developer's .env.local
    env: {
      NEXT_PUBLIC_STREAM_BASE_URL: "http://localhost:8787",
      NEXT_PUBLIC_DEFAULT_MATCH_ID: "SYN-9001",
    },
  },
});
