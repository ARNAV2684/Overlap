// Spec: web/specs/realtime.md §8. All starts pass shared durable admission.
import { connection } from "next/server";
import { readArchiveEnv } from "@/lib/server/archive-env";
import { highestArchivedMatchId } from "@/lib/server/archive-store";
import { createJobStarter, readStartEnv } from "@/lib/server/start-match";
import { admitStart, createControlStore, visitorKey } from "@/lib/server/start-control";

const headers = { "Cache-Control": "no-store" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });
function services() {
  const start = readStartEnv(), archive = readArchiveEnv();
  if (!start || !archive.ok) return null;
  return { starter: createJobStarter(start), control: createControlStore(archive.settings.blob),
    highest: () => highestArchivedMatchId(archive.settings) };
}

export async function GET() {
  await connection();
  try {
    const s = services();
    const available = !!s && (await Promise.all([s.starter.available(), s.control.available()])).every(Boolean);
    return json({ available });
  } catch { return json({ available: false }); }
}

/** The browser's own page may start a match; another site may not. Behind the Container Apps ingress the server sees
 * its internal URL (http://…:3000), so the Origin is compared with the host the browser addressed (forwarded Host). */
function fromThisSite(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try { return new URL(origin).host === host.split(",")[0].trim(); } catch { return false; }
}

export async function POST(request: Request) {
  if (!fromThisSite(request)) return json({ error: "forbidden" }, 403);
  try {
    const s = services();
    if (!s) return json({ error: "start_unavailable" }, 503);
    const result = await admitStart(s.control, s.starter,
      async () => { const id = await s.highest(); return id ? [id] : []; }, visitorKey(request));
    return json(result.body, result.status);
  } catch { return json({ error: "start_unavailable" }, 503); }
}
