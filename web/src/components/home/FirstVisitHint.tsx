"use client";

// FirstVisitHint.tsx — "What you're seeing", for a first visit to the home page
//
// Purpose: tell a first-time visitor what the home page shows (a synthetic match from tracking data, cards that
//          explain moments and what their two badges mean, and how to make it their own) in four short lines, until
//          they dismiss it
// Inputs:  whether the home page is playing a live match or a replay
// Outputs: UI; hintDismissed(), dismissHint() for the browser's memory of the dismissal
// Spec:    web/specs/screens.md §1
//
// The dismissal lives in this browser only (localStorage) and is a convenience: where storage is blocked the hint shows
// on every visit and still closes for the page. It renders nothing on the server and during hydration, so a visitor
// who dismissed it never sees it flash.

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { SourceBadge } from "@/components/match/MomentStrip";

export const HINT_KEY = "ov-home-hint-dismissed";

type HintStorage = Pick<Storage, "getItem" | "setItem">;

/** Whether this browser dismissed the hint before. A storage that throws counts as not dismissed. */
export function hintDismissed(storage: HintStorage | undefined): boolean {
  try {
    return storage?.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembers the dismissal; a storage that throws is ignored (the hint closes for this page anyway). */
export function dismissHint(storage: HintStorage | undefined): void {
  try {
    storage?.setItem(HINT_KEY, "1");
  } catch {
    // Storage blocked: nothing to remember
  }
}

const browserStorage = (): HintStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

// The stored dismissal as an external store: other tabs report through the storage event, this tab through `changed`
const changed = new Set<() => void>();
function subscribe(onChange: () => void) {
  changed.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    changed.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
const dismissedNow = () => hintDismissed(browserStorage());
const hiddenOnServer = () => true;

export function FirstVisitHint({ source }: { source: "live" | "replay" }) {
  const dismissed = useSyncExternalStore(subscribe, dismissedNow, hiddenOnServer);
  // Closed for this page even where storage is blocked
  const [closed, setClosed] = useState(false);
  if (dismissed || closed) return null;

  const close = () => {
    dismissHint(browserStorage());
    setClosed(true);
    changed.forEach((onChange) => onChange());
  };

  return (
    <section aria-labelledby="first-visit-title" className="ov-card flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6 sm:p-5">
      <div className="min-w-0 flex-1">
        <h2 id="first-visit-title" className="ov-sub">
          What you&apos;re seeing
        </h2>
        <ul className="mt-2 grid gap-2 text-[13.5px] leading-snug text-ink/75 sm:grid-cols-2 sm:gap-x-6">
          <li>
            A synthetic match, drawn from tracking data five times a second{source === "replay" ? ", replayed at 5×" : ", live"}. Every
            club and player is invented.
          </li>
          <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>When something matters, a card explains it.</span>
            <SourceBadge card={{ verified: true, fallback: false }} />
            <span>means our agents wrote it and the fact-checker passed every number;</span>
            <SourceBadge card={{ verified: true, fallback: true }} />
            <span>is a checked template.</span>
          </li>
          <li>
            Make it yours in <b className="font-semibold text-ink">Your match</b>: Casual or Analyst, your club, a player to
            follow, and English, Español, हिन्दी or Français.
          </li>
          <li>
            <b className="font-semibold text-ink">Watch</b> shows just the match; <b className="font-semibold text-ink">Analyse</b>{" "}
            adds the story on the pitch.{" "}
            <Link href="/how-it-works" className="font-semibold text-accent underline-offset-2 hover:underline">
              How it works
            </Link>
          </li>
        </ul>
      </div>
      <button
        type="button"
        onClick={close}
        className="shrink-0 self-start rounded-full border border-ink/15 px-3.5 py-1.5 text-[12.5px] font-bold text-ink/80 transition-colors hover:border-ink/30 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Got it
      </button>
    </section>
  );
}
