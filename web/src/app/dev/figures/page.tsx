// page.tsx — 3D player figures preview (development only)
//
// Purpose: look at the player figures (kit, proportions, materials, run cycle) without a match or the local stack
// Inputs:  none
// Outputs: page; 404 in production
// Spec:    web/specs/pitch.md §1.2

import { notFound } from "next/navigation";
import { FigurePreview } from "./FigurePreview";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FigurePreview />;
}
