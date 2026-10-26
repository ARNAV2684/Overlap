"use client";

// AiFeed.tsx — The commentary history
//
// Purpose: every moment card this audience has received, newest first and grouped by half, each with its minute,
//          kind, who wrote it (AI or a checked stat line) and the chart it points to; the full-time recap on top when
//          it arrives; player tags from the publisher
// Inputs:  the insight feed, the playhead (cards from the future of a replay stay hidden)
// Outputs: UI
// Spec:    web/specs/screens.md §4

import { overlayText, type Overlay } from "@/lib/live/insights";
import { cardMinute, cardSource, CHART_LABEL } from "@/lib/live/live-insights";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience, useFeed } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { CardText, KindChip, SourceBadge, useVisibleCards, type ShowChart } from "./MomentStrip";

/** The half a card belongs to: its period when it has one, else its minute. */
function halfOf(card: Overlay): number {
  return card.period ?? (cardMinute(card.clock) >= 45 ? 2 : 1);
}

export function AiFeed({ onShowChart }: { onShowChart?: ShowChart }) {
  const { current, recap, tags } = useFeed();
  const { mode, source } = useExperience();
  const [prefs] = usePreferences();
  const { phase } = useScoreboard();
  const visible = useVisibleCards();
  // A replay reaches its recap at full time, like the live match did
  const showRecap = recap !== null && (source === "live" || phase === "full_time");
  const aiWritten = visible.filter((c) => cardSource(c) === "ai").length;
  const halves = [...new Set(visible.map(halfOf))].sort((a, b) => b - a);

  return (
    <div className="ov-card flex min-h-0 flex-col" id="commentary">
      <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent font-mono text-[10px] font-black text-on-accent">AI</span>
          <p className="ov-eyebrow">Commentary</p>
        </div>
        <span className="ov-sub" title="Lines written by the agents and passed by the fact-checker, out of every moment">
          {aiWritten} of {visible.length} written by the agents
        </span>
      </div>
      <div className="flex max-h-[460px] min-h-[160px] flex-col gap-2 overflow-y-auto p-3">
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
              <span key={`${t.player_id}-${t.metric}`} className="rounded-full bg-[#4ade80]/12 px-2.5 py-1 font-mono text-[10px] font-black text-[#16a34a] dark:text-[#4ade80]">
                {t.name ?? t.player_id} · {t.value} {t.unit}
              </span>
            ))}
          </div>
        )}
        {halves.map((half) => (
          <div key={half} className="flex flex-col gap-2">
            <p className="sticky top-0 z-[1] -mx-3 bg-surface/95 px-3 py-1 font-mono text-[9px] font-black uppercase tracking-[1.6px] text-ink/40 backdrop-blur">
              {half === 1 ? "First half" : half === 2 ? "Second half" : `Period ${half}`}
            </p>
            {visible
              .filter((c) => halfOf(c) === half)
              .map((card) => {
                const on = current?.overlay_id === card.overlay_id;
                return (
                  <article
                    key={card.overlay_id}
                    className={`relative rounded-[12px] border p-3 pl-3.5 transition-colors ${on ? "border-accent/50 bg-accent/[0.06]" : "border-ink/[0.06] bg-ink/[0.02]"}`}
                  >
                    <span className={`absolute inset-y-2 left-0 w-[3px] rounded-full ${card.priority === "high" ? "bg-accent" : "bg-viz-focus/60"}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-black text-ink/80">{card.clock.split(":")[0]}′</span>
                      <KindChip card={card} />
                      <SourceBadge card={card} />
                      {card.visual && onShowChart && (
                        <button
                          type="button"
                          onClick={() => onShowChart(card.visual!.component, card.visual!.highlight?.event_id, card.visual!.highlight)}
                          className="ml-auto font-mono text-[9.5px] font-bold uppercase tracking-[1px] text-ink/40 hover:text-accent"
                        >
                          {CHART_LABEL[card.visual.component] ?? card.visual.component} →
                        </button>
                      )}
                    </div>
                    <CardText text={overlayText(card, mode, prefs.lang)} className="mt-1.5 text-[13.5px] leading-snug text-ink/85" />
                  </article>
                );
              })}
          </div>
        ))}
        {!visible.length && !showRecap && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <p className="text-[14px] font-semibold text-ink/70">The agents are watching.</p>
            <p className="text-[12.5px] text-ink/45">Every moment they explain is kept here, newest first.</p>
          </div>
        )}
      </div>
    </div>
  );
}
