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

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "forbidden" }, 403);
  }
  try {
    const s = services();
    if (!s) return json({ error: "start_unavailable" }, 503);
    const result = await admitStart(s.control, s.starter,
      async () => { const id = await s.highest(); return id ? [id] : []; }, visitorKey(request));
    return json(result.body, result.status);
  } catch { return json({ error: "start_unavailable" }, 503); }
}
