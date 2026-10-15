import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const REQUIRED = ["NEXT_PUBLIC_STREAM_BASE_URL", "NEXT_PUBLIC_DEFAULT_MATCH_ID"] as const;

export default defineConfig(({ mode }) => {
  // The settings come from .env.local, the same file `npm run dev` reads. Vite's loader is used because Next's own
  // loader skips .env.local when NODE_ENV is "test". Values already set in the shell win over the file.
  const env = loadEnv(mode, root, "NEXT_PUBLIC_");
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}. Copy web/.env.example to web/.env.local, then run the tests again.`);
  }

  return {
    resolve: {
      // The same "@/" shortcut as tsconfig.json
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      env,
    },
  };
});
