"use client";

// NoticeBar.tsx — Connection notice line
//
// Purpose: one line under the intro saying what the stream is doing ("Connected…", "Connection lost…", "Feed paused…")
// Inputs:  NoticeBar: the notice from the nearest MatchStreamProvider (useNotice())
//          NoticeBarView: notice { text, tone: "info" | "warning" } (for pages and previews without a store)
// Outputs: a visible line, plus a visually hidden polite live region that is throttled (src/lib/announcer.ts): at most
//          one announcement every 3 s, and none when only a number changed (the stale countdown ticks every second)
// Spec:    web/specs/design-system.md §5. web/IMPLEMENTATION_PLAN.md Phase 6 (and 8.3: the warning tone, used while
//          paused, turns the line accent-text)
//
// The visible line is not itself a live region; otherwise every text change would be read out unthrottled.

import { useEffect, useState } from "react";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { createAnnouncer } from "@/lib/announcer";
import { cn } from "@/lib/cn";
import type { Notice } from "@/lib/store";
import { useNotice } from "@/lib/store-hooks";

export function NoticeBarView({ notice, className }: { notice: Notice; className?: string }) {
  const warning = notice.tone === "warning";
  const [spoken, setSpoken] = useState("");
  // Creating it has no side effects, and cancel() leaves it usable, so StrictMode's second effect run is harmless
  const [announcer] = useState(() => createAnnouncer(setSpoken));

  useEffect(() => announcer.push(notice.text), [announcer, notice.text]);
  useEffect(() => () => announcer.cancel(), [announcer]);

  return (
    <div className={cn("mb-[18px] min-h-5", className)}>
      <p
        className={cn(
          "flex items-start gap-1.5 text-caption",
          warning ? "text-accent-text" : "text-ink-muted",
        )}
      >
        {warning ? (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 fill-none stroke-current stroke-2"
          >
            <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
            <path d="M12 10v4.5M12 17.5v.01" strokeLinecap="round" />
          </svg>
        ) : null}
        <span>{notice.text}</span>
      </p>
      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {spoken}
      </VisuallyHidden>
    </div>
  );
}

/** The notice wired to the live store. Must sit inside a MatchStreamProvider. */
export function NoticeBar({ className }: { className?: string }) {
  const notice = useNotice();
  return <NoticeBarView notice={notice} className={className} />;
}
