// announcer.ts — Screen-reader announcement throttle
//
// Purpose: decide when a changing status line is read out, so a screen reader is not flooded. The notice line can
//          change every second ("No messages for 11 seconds", "… 12 seconds"); announcing each one would bury
//          everything else
// Inputs:  each new text via push(text); onAnnounce(text) callback; minGapMs (default 3000)
// Outputs: onAnnounce calls: at most one per minGapMs, always the newest text, and never for a change in numbers only
// Spec:    web/specs/design-system.md §5 (accessibility). web/IMPLEMENTATION_PLAN.md Phase 6 (NoticeBar)
//
// Rules:
//   1. A text whose wording matches the last announced one apart from its numbers is not announced again.
//   2. After an announcement, the next one waits until minGapMs have passed; texts pushed meanwhile collapse into one
//      trailing announcement of the newest.
//   3. cancel() drops a waiting announcement. The announcer stays usable afterwards (React StrictMode re-runs effects).

/** The text with every run of digits replaced, so "for 11 seconds" and "for 12 seconds" compare equal. */
export function announcementKey(text: string): string {
  return text.replace(/\d+/g, "#");
}

export type Announcer = {
  push(text: string): void;
  cancel(): void;
};

type AnnouncerOptions = {
  minGapMs?: number;
  now?: () => number;
};

export function createAnnouncer(
  onAnnounce: (text: string) => void,
  { minGapMs = 3000, now = Date.now }: AnnouncerOptions = {},
): Announcer {
  let lastAt = Number.NEGATIVE_INFINITY;
  let lastKey: string | null = null;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function announce(text: string) {
    lastAt = now();
    lastKey = announcementKey(text);
    onAnnounce(text);
  }

  function flushPending() {
    timer = null;
    const text = pending;
    pending = null;
    // The wording may have gone back to what was last read out while waiting: nothing new to say
    if (text !== null && announcementKey(text) !== lastKey) announce(text);
  }

  return {
    push(text) {
      if (text === "") return;
      if (timer !== null) {
        // Already waiting: keep only the newest text
        pending = text;
        return;
      }
      if (announcementKey(text) === lastKey) return;
      const wait = lastAt + minGapMs - now();
      if (wait <= 0) {
        announce(text);
        return;
      }
      pending = text;
      timer = setTimeout(flushPending, wait);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
