"use client";

// MomentStrip.tsx — The AI moments as live commentary, right under the pitch
//
// Purpose: the latest moment large, with its minute, kind, who wrote it and the chart it points to, and the moments
//          before it beside it, so a moment is always in view while the match plays; plus the small pieces the
//          on-pitch card and the commentary history share (source badge, kind chip, the cards visible so far)
// Inputs:  the insight feed, the playhead (a replay's future cards stay hidden), the viewer's mode and language
// Outputs: UI
// Spec:    web/specs/screens.md §2.8, §4

import { keyNumber, overlayText, type Overlay } from "@/lib/live/insights";
import { cardSource, CARD_SOURCE_LABEL, CHART_LABEL, MOMENT_KIND_GLYPH, MOMENT_KIND_LABEL, momentKind } from "@/lib/live/live-insights";
import { useExperience, useFeed } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";
import { factLabel, layoutFor } from "@/lib/live/mode-layout";

/** Opens what a card points to: an analysis tab, or a live insight card (with the card's player or team). */
export type ShowChart = (component: string, eventId?: string, highlight?: { team_id?: string; player_id?: string }) => void;

/** The cards this audience has received that have happened by the playhead, newest first. */
export function useVisibleCards(): readonly Overlay[] {
  const { cards } = useFeed();
  const { playheadMs, source } = useExperience();
  return cards.filter((c) => source === "live" || c.show_at_ms <= playheadMs);
}

/** Who wrote the card: "AI · checked" only for a model line the fact-checker passed; a template is a stat line. */
export function SourceBadge({ card, tone = "light" }: { card: Pick<Overlay, "verified" | "fallback">; tone?: "light" | "dark" }) {
  const source = cardSource(card);
  const style =
    source === "ai"
      ? tone === "dark"
        ? "bg-[#4ade80]/15 text-[#4ade80]"
        : "bg-[#4ade80]/15 text-[#16a34a] dark:text-[#4ade80]"
      : tone === "dark"
        ? "bg-white/10 text-white/65"
        : "bg-ink/[0.07] text-ink/55";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[1px] ${style}`}
      title={
        source === "ai"
          ? "Written by the narrator agent; the fact-checker passed every number"
          : source === "stat_line"
            ? "A checked template line: the agents' own line did not arrive in time or did not pass the fact-checker"
            : "Not checked"
      }
    >
      {source === "ai" ? "✓ " : ""}
      {CARD_SOURCE_LABEL[source]}
    </span>
  );
}

/** The kind of moment, from the chart the director picked. */
export function KindChip({ card, tone = "light" }: { card: Pick<Overlay, "visual" | "priority">; tone?: "light" | "dark" }) {
  const kind = momentKind(card);
  const high = card.priority === "high";
  const base = tone === "dark" ? "text-white/70" : "text-ink/60";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[9.5px] font-black uppercase tracking-[1.4px] ${high ? "text-accent" : base}`}>
      <span aria-hidden="true">{MOMENT_KIND_GLYPH[kind]}</span>
      {MOMENT_KIND_LABEL[kind]}
    </span>
  );
}

function Minute({ clock, large = false }: { clock: string; large?: boolean }) {
  return <span className={`font-mono font-black tabular ${large ? "text-[22px] leading-none" : "text-[12px]"}`}>{clock.split(":")[0]}′</span>;
}

/** The sentence with its key number picked out, as on the pitch card. */
export function CardText({ text, className }: { text: string; className: string }) {
  const key = keyNumber(text);
  return (
    <p className={className}>
      {key ? (
        <>
          {key.before}
          <span className="font-mono font-black text-viz-focus">{key.number}</span>
          {key.after}
        </>
      ) : (
        text
      )}
    </p>
  );
}

export function MomentStrip({ onShowChart }: { onShowChart?: ShowChart }) {
  const visible = useVisibleCards();
  const { current } = useFeed();
  const { mode } = useExperience();
  const [prefs] = usePreferences();
  const layout = layoutFor(mode);
  const lead = current ?? visible[0] ?? null;
  const earlier = visible.filter((c) => c.overlay_id !== lead?.overlay_id).slice(0, 3);

  return (
    <section className="ov-card overflow-hidden" aria-label="Live commentary">
      <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full rounded-full bg-accent ${current ? "animate-ping opacity-60" : "opacity-0"}`} />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <p className="ov-eyebrow">Live commentary</p>
        </div>
        <span className="ov-sub">
          {visible.length} moment{visible.length === 1 ? "" : "s"} explained
        </span>
      </div>
      {!lead ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="font-mono text-[18px] text-ink/25" aria-hidden="true">
            ◎
          </span>
          <p className="text-[13px] text-ink/55">
            The agents are watching. When something matters (a goal, a big chance, a momentum swing, a press that changes),
            it is explained here, with every number checked.
          </p>
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <article
            key={lead.overlay_id}
            className={`ov-rise relative flex gap-3.5 px-4 py-3.5 ${lead === current ? "bg-accent/[0.05]" : ""}`}
            aria-live="polite"
          >
            <div className={`absolute inset-y-0 left-0 w-[3px] ${lead.priority === "high" ? "bg-accent" : "bg-viz-focus"}`} />
            <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
              <Minute clock={lead.clock} large />
              {lead === current && <span className="font-mono text-[8px] font-black uppercase tracking-[1.2px] text-accent">Now</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <KindChip card={lead} />
                <SourceBadge card={lead} />
              </div>
              <CardText
                text={overlayText(lead, mode, prefs.lang)}
                className={`mt-1.5 font-semibold leading-snug text-ink/90 ${layout.commentaryLarge ? "text-[18px] sm:text-[20px]" : "text-[15px] sm:text-[16px]"}`}
              />
              {layout.showFacts && lead.facts_checked && lead.facts_checked.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Facts the fact-checker verified">
                  {lead.facts_checked.map((key) => (
                    <li key={key} className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[10px] font-semibold text-ink/65">
                      ✓ {factLabel(key)}
                    </li>
                  ))}
                </ul>
              )}
              {lead.visual && onShowChart && (
                <button
                  type="button"
                  onClick={() => onShowChart(lead.visual!.component, lead.visual!.highlight?.event_id, lead.visual!.highlight)}
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[9.5px] font-black uppercase tracking-[1.2px] text-ink/45 hover:text-accent"
                >
                  {CHART_LABEL[lead.visual.component] ?? lead.visual.component} <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </article>
          {earlier.length > 0 && (
            <ol className="flex gap-2 overflow-x-auto border-t border-ink/[0.06] p-2.5 lg:flex-col lg:overflow-visible lg:border-l lg:border-t-0">
              {earlier.map((card) => (
                <li key={card.overlay_id} className="min-w-[230px] flex-1 rounded-[10px] bg-ink/[0.03] px-3 py-2 lg:min-w-0">
                  <div className="flex items-center gap-2 text-ink/70">
                    <Minute clock={card.clock} />
                    <KindChip card={card} />
                    <span className="ml-auto">
                      <SourceBadge card={card} />
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink/70">{overlayText(card, mode, prefs.lang)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
