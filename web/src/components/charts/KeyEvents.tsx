// KeyEvents.tsx — Goals, cards and substitutions
//
// Purpose: the match's key events as a two-sided timeline: home on the left, away on the right, minute in the middle
// Inputs:  key events (charts.ts keyEvents), the current card's event id
// Outputs: UI
// Spec:    web/specs/charts.md §8

import type { KeyEvent } from "@/lib/live/charts";

const ICON: Record<KeyEvent["kind"], { glyph: string; cls: string; label: string }> = {
  goal: { glyph: "⚽", cls: "bg-accent text-white", label: "Goal" },
  yellow: { glyph: "", cls: "bg-[#f5c518]", label: "Yellow card" },
  red: { glyph: "", cls: "bg-[#e5383b]", label: "Red card" },
  sub: { glyph: "⇄", cls: "bg-ink/10 text-ink/70", label: "Substitution" },
  penalty_miss: { glyph: "✕", cls: "bg-ink/10 text-ink/70", label: "Missed penalty" },
};

export function KeyEvents({ events, highlight }: { events: readonly KeyEvent[]; highlight?: string | null }) {
  if (!events.length) return <p className="py-6 text-center text-sm text-ink/40">No goals, cards or changes yet.</p>;
  return (
    <ol className="flex flex-col">
      {[...events].reverse().map((e) => {
        const icon = ICON[e.kind];
        const home = e.side === "home";
        const card = e.kind === "yellow" || e.kind === "red";
        return (
          <li
            key={e.id}
            className={`grid grid-cols-[1fr_56px_1fr] items-center border-b border-ink/[0.05] py-2.5 last:border-0 ${e.id === highlight ? "bg-accent/10" : ""}`}
          >
            <span className={`truncate text-[13px] font-semibold ${home ? "text-right text-ink/85" : ""}`}>{home ? e.text : ""}</span>
            <span className="flex flex-col items-center gap-1">
              <span
                aria-label={icon.label}
                className={`grid place-items-center text-[10px] font-black ${card ? "h-[14px] w-[10px] rounded-[2px]" : "h-[20px] w-[20px] rounded-full"} ${icon.cls}`}
              >
                {icon.glyph}
              </span>
              <span className="font-mono text-[10px] font-bold text-ink/40">{e.clock.split(":")[0]}′</span>
            </span>
            <span className="truncate text-[13px] font-semibold text-ink/85">{home ? "" : e.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
