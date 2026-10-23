// season-store.ts — Season document reader
//
// Purpose: read and check the season document the stats engine built, once per file change
// Inputs:  OVERLAP_SEASON_DIR (optional; default web/data/season), files season-<id>.json
// Outputs: a parsed season document, or a reason it can't be read
// Spec:    web/specs/realtime.md §7
//
// The document is a committed build artefact (stats/main.py season), so it works the same locally and on Azure
// without a database. It is parsed against the schema once and kept until the file changes.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { seasonDocumentSchema, type SeasonDocument } from "@/lib/contracts";

export type SeasonRead = { ok: true; doc: SeasonDocument } | { ok: false; reason: "not_found" | "invalid" };

const cache = new Map<string, { mtimeMs: number; doc: SeasonDocument }>();

export function seasonDir(): string {
  return process.env.OVERLAP_SEASON_DIR || path.join(process.cwd(), "data", "season");
}

export async function readSeason(seasonId: string): Promise<SeasonRead> {
  const file = path.join(seasonDir(), `season-${seasonId}.json`);
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(file)).mtimeMs;
  } catch {
    return { ok: false, reason: "not_found" };
  }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return { ok: true, doc: hit.doc };
  try {
    const parsed = seasonDocumentSchema.safeParse(JSON.parse(await readFile(file, "utf-8")));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      console.warn(`season ${seasonId}: invalid document at ${first?.path.join(".")}: ${first?.message}`);
      return { ok: false, reason: "invalid" };
    }
    cache.set(file, { mtimeMs, doc: parsed.data });
    return { ok: true, doc: parsed.data };
  } catch {
    console.warn(`season ${seasonId}: unreadable document`);
    return { ok: false, reason: "invalid" };
  }
}
