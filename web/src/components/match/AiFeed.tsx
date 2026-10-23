"use client";

// AiFeed.tsx — The AI commentary feed
//
// Purpose: every moment card this audience has received, newest first, with its minute, verified badge and the chart
//          it points to; the full-time recap on top when it arrives; player tags from the publisher
// Inputs:  the insight feed, the playhead (cards from the future of a replay stay hidden)
// Outputs: UI
// Spec:    web/specs/screens.md §4

import { overlayText } from "@/lib/live/insights";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience, useFeed } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { COMPONENT_LABEL } from "./PitchOverlay";

export function AiFeed({ onShowChart }: { onShowChart?: (component: string, eventId?: string) => void }) {
  const { cards, current, recap, tags } = useFeed();
  const { mode, playheadMs, source } = useExperience();
  const [prefs] = usePreferences();
  const { phase } = useScoreboard();
  // In a replay the history holds the whole match: show only what has happened so far
  const visible = cards.filter((c) => source === "live" || c.show_at_ms <= playheadMs);
  // A replay reaches its recap at full time, like the live match did
  const showRecap = recap !== null && (source === "live" || phase === "full_time");

  return (
    <div className="ov-card flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent font-mono text-[10px] font-black text-white">AI</span>
          <p className="ov-eyebrow">Moments</p>
        </div>
        <span className="ov-sub">{visible.length} explained</span>
      </div>
      <div className="flex max-h-[520px] min-h-[200px] flex-col gap-2 overflow-y-auto p-3">
        {showRecap && (
          <article className="rounded-[12px] border border-accent/30 bg-accent/[0.07] p-3.5">
            <p className="font-mono text-[9.5px] font-black uppercase tracking-[1.6px] text-accent">Full-time recap</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {recap!.lines.map((l, i) => (
                <p key={i} className="text-[13.5px] font-semibold leading-snug text-ink/90">
                  {l.text}
                </p>
              ))}
            </div>
          </article>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 4).map((t) => (
              <span key={`${t.player_id}-${t.metric}`} className="rounded-full bg-[#4ade80]/12 px-2.5 py-1 font-mono text-[10px] font-black text-[#4ade80]">
                {t.name ?? t.player_id} · {t.value} {t.unit}
              </span>
            ))}
          </div>
        )}
        {visible.map((card) => {
          const on = current?.overlay_id === card.overlay_id;
          return (
            <article
              key={card.overlay_id}
              className={`rounded-[12px] border p-3 transition-colors ${on ? "border-accent/50 bg-accent/[0.06]" : "border-ink/[0.06] bg-ink/[0.02]"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-black text-ink/80">{card.clock.split(":")[0]}′</span>
                {card.priority === "high" && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="High priority" />}
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-black uppercase tracking-[1px] ${
                    card.verified ? "bg-[#4ade80]/15 text-[#16a34a] dark:text-[#4ade80]" : "bg-ink/10 text-ink/50"
                  }`}
                >
                  {card.verified ? "✓ verified" : card.fallback ? "template" : "unverified"}
                </span>
                {card.visual && onShowChart && (
                  <button
                    type="button"
                    onClick={() => onShowChart(card.visual!.component, card.visual!.highlight?.event_id)}
                    className="ml-auto font-mono text-[9.5px] font-bold uppercase tracking-[1px] text-ink/40 hover:text-accent"
                  >
                    {COMPONENT_LABEL[card.visual.component] ?? card.visual.component} →
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[13.5px] leading-snug text-ink/85">{overlayText(card, mode, prefs.lang)}</p>
            </article>
          );
        })}
        {!visible.length && !showRecap && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <p className="text-[14px] font-semibold text-ink/70">The agents are watching.</p>
            <p className="text-[12.5px] text-ink/45">
              When something matters (a goal, a big chance, a momentum swing, a press that changes), a card explains why, with
              every number checked.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
