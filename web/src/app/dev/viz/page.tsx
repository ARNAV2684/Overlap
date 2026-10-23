// page.tsx — Analysis visuals preview (development only)
//
// Purpose: show the analysis visuals with one real stat panel, without the local stack, so a change to their look
//          can be reviewed in a browser
// Inputs:  web/data/dev/preview-SYN-1017.json (the last heavy panel of the stats fixture KES v ORR, and its setup)
// Outputs: page
// Spec:    web/specs/charts.md; not linked from the app and answers 404 in production

import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { matchSetupSchema, statPanelSchema } from "@/lib/contracts";
import { VizPreview } from "./VizPreview";

async function preview() {
  "use cache";
  return JSON.parse(await readFile(path.join(process.cwd(), "data", "dev", "preview-SYN-1017.json"), "utf-8"));
}

export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const raw = await preview();
  const setup = matchSetupSchema.parse(raw.setup);
  const panel = statPanelSchema.parse(raw.panel);
  return <VizPreview setup={setup} panel={panel} />;
}
