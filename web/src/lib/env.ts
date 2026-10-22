// env.ts — Environment
//
// Purpose: read and validate the public settings once, and fail loudly if one is missing or malformed
// Inputs:  NEXT_PUBLIC_DEFAULT_MATCH_ID (see web/.env.example)
// Outputs: env: { defaultMatchId }
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 1 step 5; web/specs/realtime.md §6
//
// Next.js only inlines NEXT_PUBLIC_ values it can see written out in full, so each variable is read as
// process.env.NEXT_PUBLIC_NAME below. Do not read them through process.env[name]. The stream needs no public setting:
// the browser calls this app's own routes (realtime.md §1.1, §3.1).

import { z } from "zod";

const envSchema = z.strictObject({
  NEXT_PUBLIC_DEFAULT_MATCH_ID: z
    .string()
    .regex(/^SYN-\d{4}$/, { message: "must look like SYN-9001 (CONTRACTS.md §1.3)" }),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_DEFAULT_MATCH_ID: process.env.NEXT_PUBLIC_DEFAULT_MATCH_ID,
});

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment. Copy web/.env.example to web/.env.local and fix:\n${problems}`,
  );
}

export const env = {
  /** Match opened when none is chosen. */
  defaultMatchId: parsed.data.NEXT_PUBLIC_DEFAULT_MATCH_ID,
} as const;
