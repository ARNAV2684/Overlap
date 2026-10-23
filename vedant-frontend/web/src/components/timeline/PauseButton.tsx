// PauseButton.tsx — Pause and resume the feed
//
// Purpose: freeze the timeline, counters and pitch while reception and the scoreboard carry on; resume catches up
// Inputs:  paused, onToggle? (absent on the loading fallback: the button is disabled)
// Outputs: a toggle Button: "Pause feed" / "Resume feed", with aria-pressed
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.3 (B13)

import { Button } from "@/components/ui/Button";

export function PauseButton({ paused, onToggle }: { paused: boolean; onToggle?: () => void }) {
  return (
    <Button size="sm" aria-pressed={paused} disabled={!onToggle} onClick={onToggle}>
      {paused ? "Resume feed" : "Pause feed"}
    </Button>
  );
}
