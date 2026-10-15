// page.tsx — Match picker
//
// Purpose: the entry point. For now it sends the viewer straight to the default match
// Inputs:  NEXT_PUBLIC_DEFAULT_MATCH_ID (src/lib/env.ts)
// Outputs: a redirect to /match/<default id>
// Spec:    web/specs/screens.md. web/IMPLEMENTATION_PLAN.md Phase 6 (redirect), Phase 10 step 5 (optional picker)
//
// Status: redirect only. A real picker listing the stream's matches (listMatches() in src/lib/api.ts) is Phase 10,
//         optional.

import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export default function Page() {
  redirect(`/match/${env.defaultMatchId}`);
}
