"use client";

// CardTrace.tsx — "How this card was made"
//
// Purpose: a link on each commentary card that opens a drawer with the agents' work behind it: each agent in the
//          order it ran with its time and model calls, the analyst's MCP tools and reading of the moment, the
//          fact-checker's rounds (what sent a line back) and verdict, the translations, and the job's time against
//          its deadline
// Inputs:  a card (its match and moment ids); GET /api/match/<id>/moments/<moment>/trace
// Outputs: UI
// Spec:    web/specs/screens.md §4.1
//
// The drawer loads when it opens (an event handler, not an effect), aborts when it closes, and says plainly when a
// trace is not available (a local stack without Cosmos, or a card from before traces were kept).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AGENT_LABEL, AGENT_ROLE, cardTraceSchema, type CardTrace, type TraceAgent } from "@/lib/card-trace";
import type { Overlay } from "@/lib/live/insights";
import { MOMENT_KIND_LABEL, momentKind } from "@/lib/live/live-insights";
import { SourceBadge } from "./MomentStrip";

type Load = { status: "loading" } | { status: "ready"; trace: CardTrace } | { status: "missing" } | { status: "error" };

const LANG_NAME: Record<string, string> = { es: "Spanish", hi: "Hindi", fr: "French" };
const TOOL_STATUS: Record<string, string> = {
  ok: "used",
  after_moment: "newer than the moment: set aside",
  inconsistent: "did not match the moment: set aside",
  unavailable: "unavailable",
};
const OUTCOME: Record<string, string> = {
  published: "Sent to every audience",
  partially_expired: "Sent to some audiences; the rest arrived too late",
  expired: "Ready too late: the match had moved on",
  suppressed: "Not shown",
  rejected: "Stopped: the evidence did not hold",
  failed: "Failed; a template stood in",
  running: "Still running",
  pending: "Waiting to start",
  delivery_pending: "Ready, waiting for its moment",
};
const seconds = (ms: number | null) => (ms === null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const label = (agent: string) => AGENT_LABEL[agent as TraceAgent] ?? agent;

export function CardTraceButton({ card, tone = "light" }: { card: Pick<Overlay, "match_id" | "moment_id" | "clock" | "visual" | "priority" | "verified" | "fallback">; tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const abort = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!card.moment_id) return null;
  const momentId = card.moment_id;

  const show = () => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setLoad({ status: "loading" });
    setOpen(true);
    fetch(`/api/match/${card.match_id}/moments/${momentId}/trace`, { cache: "no-store", signal: ctl.signal })
      .then(async (r) => {
        if (r.status === 404 || r.status === 503) return setLoad({ status: "missing" });
        if (!r.ok) return setLoad({ status: "error" });
        const parsed = cardTraceSchema.safeParse(await r.json());
        setLoad(parsed.success ? { status: "ready", trace: parsed.data } : { status: "error" });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== "AbortError") setLoad({ status: "error" });
      });
  };
  const close = () => {
    abort.current?.abort();
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1 font-mono text-[9.5px] font-black uppercase tracking-[1.2px] ${tone === "dark" ? "text-white/55 hover:text-white" : "text-ink/45 hover:text-accent"}`}
      >
        <span aria-hidden="true">⌥</span> How this card was made
      </button>
      {open && createPortal(<Drawer card={card} load={load} onClose={close} />, document.body)}
    </>
  );
}

function Drawer({ card, load, onClose }: { card: Pick<Overlay, "clock" | "visual" | "priority" | "verified" | "fallback">; load: Load; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/45" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-trace-title"
        className="relative flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-surface text-ink shadow-2xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}
      >
        <header className="sticky top-0 z-[1] flex items-start justify-between gap-3 border-b border-ink/[0.08] bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="ov-eyebrow">How this card was made</p>
            <h2 id="card-trace-title" className="mt-1 flex flex-wrap items-center gap-2 text-[17px] font-black tracking-tight">
              <span className="font-mono tabular">{card.clock.split(":")[0]}′</span>
              <span>{MOMENT_KIND_LABEL[momentKind(card)]}</span>
              <SourceBadge card={card} />
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-[12px] font-bold text-ink/70 hover:border-ink/30 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Close
          </button>
        </header>
        <div className="flex flex-col gap-5 px-5 py-5">
          {load.status === "loading" && <p className="text-[13px] text-ink/55">Reading the agents&apos; record…</p>}
          {load.status === "missing" && (
            <p className="text-[13px] leading-relaxed text-ink/60">
              No record is available for this card. Records are kept for matches played on Azure; a local run or an older
              replay may not have one.
            </p>
          )}
          {load.status === "error" && <p className="text-[13px] text-ink/60">The record could not be read just now. Try again in a moment.</p>}
          {load.status === "ready" && <TraceBody trace={load.trace} />}
        </div>
      </section>
    </div>
  );
}

function TraceBody({ trace }: { trace: CardTrace }) {
  const calls = trace.steps.reduce((n, s) => n + s.calls.length, 0);
  const tools = trace.analyst?.tools.length ?? 0;
  const longest = Math.max(1, ...trace.steps.map((s) => s.ms ?? 0));

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(trace.steps.length)} label="agents ran" />
        <Stat value={String(calls)} label={`model calls${trace.model ? ` · ${trace.model}` : ""}`} />
        <Stat value={trace.work_s !== null ? `${trace.work_s} s` : "—"} label={trace.deadline_s !== null ? `of work · ${trace.deadline_s} s allowed` : "of work"} />
      </div>
      <p className="rounded-[10px] bg-ink/[0.04] px-3 py-2 text-[12.5px] font-semibold text-ink/75">
        {OUTCOME[trace.state] ?? trace.state}
        {trace.terminal_reason ? ` (${trace.terminal_reason})` : ""}
        {trace.elapsed_s !== null && trace.state !== "suppressed" ? `, ${trace.elapsed_s} s after the moment was found` : ""}
      </p>

      <div>
        <p className="ov-eyebrow">The agents, in order</p>
        <ol className="mt-2.5 flex flex-col gap-3">
          {trace.steps.map((s) => (
            <li key={s.agent} className="relative pl-4">
              <span className={`absolute left-0 top-1.5 h-2 w-2 rounded-full ${s.ownOutput ? "bg-accent" : "bg-ink/25"}`} aria-hidden="true" />
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14px] font-extrabold">{AGENT_LABEL[s.agent]}</p>
                <span className="font-mono text-[11px] tabular text-ink/55">{seconds(s.ms)}</span>
              </div>
              <p className="text-[11.5px] text-ink/50">{AGENT_ROLE[s.agent]}</p>
              <div className="mt-1.5 h-1.5 rounded-full bg-ink/[0.06]" aria-hidden="true">
                <div className="h-full rounded-full bg-viz-focus" style={{ width: `${Math.max(2, ((s.ms ?? 0) / longest) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink/80">{s.summary}</p>
              {s.calls.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`${AGENT_LABEL[s.agent]} model calls`}>
                  {s.calls.map((c, i) => (
                    <li
                      key={i}
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${c.ok ? "bg-[#4ade80]/15 text-[#15803d] dark:text-[#4ade80]" : "bg-ink/[0.07] text-ink/60"}`}
                    >
                      {c.agent !== s.agent ? `${label(c.agent)} · ` : ""}
                      {c.ok ? "✓" : `✕ ${c.reason ?? "failed"}`} {seconds(c.ms)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </div>

      {trace.analyst && (
        <div>
          <p className="ov-eyebrow">What the analyst read, through MCP · {tools} tool call{tools === 1 ? "" : "s"}</p>
          {trace.analyst.interpretation && (
            <blockquote className="mt-2 border-l-2 border-viz-focus pl-3 text-[13px] italic leading-snug text-ink/80">{trace.analyst.interpretation}</blockquote>
          )}
          <ul className="mt-2 flex flex-col gap-1">
            {trace.analyst.tools.map((t, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="font-mono text-ink/80">{t.tool}</span>
                <span className="text-right text-ink/50">{TOOL_STATUS[t.status] ?? t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trace.fact_check && (
        <div>
          <p className="ov-eyebrow">The fact-check</p>
          <p className="mt-2 text-[13px] text-ink/80">
            {trace.fact_check.verified} of {trace.fact_check.audiences} lines passed every number and the meaning check
            {trace.fact_check.rounds > 1 ? `, after ${trace.fact_check.rounds - 1} round${trace.fact_check.rounds > 2 ? "s" : ""} of rewrites` : " on the first try"}.
          </p>
          {trace.fact_check.sentBack.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {trace.fact_check.sentBack.map((b) => (
                <li key={b.audience} className="rounded-[8px] bg-ink/[0.04] px-2.5 py-1.5 text-[12px] text-ink/75">
                  <span className="font-bold">{b.audience}</span> sent back: {b.reasons.join("; ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {trace.translation && trace.translation.langs.length > 0 && (
        <div>
          <p className="ov-eyebrow">Translations, re-checked</p>
          <ul className="mt-2 grid grid-cols-3 gap-2">
            {trace.translation.langs.map((l) => (
              <li key={l.lang} className="rounded-[10px] bg-ink/[0.04] px-2.5 py-2 text-center">
                <p className="font-mono text-[15px] font-black tabular">
                  {l.verified}/{l.total}
                </p>
                <p className="text-[11px] text-ink/55">{LANG_NAME[l.lang] ?? l.lang}</p>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-ink/50">A translation that does not pass is shown as the checked template in that language; English is never held back.</p>
        </div>
      )}

      <p className="border-t border-ink/[0.08] pt-3 text-[11px] leading-snug text-ink/45">
        From the record the seven agents share in Azure Cosmos DB. It keeps each stage&apos;s output and timing, never the
        prompts.{trace.audiences !== null ? ` Sent to ${trace.audiences} audience groups (mode × language × club or player).` : ""}
      </p>
    </>
  );
}

function Stat({ value, label: text }: { value: string; label: string }) {
  return (
    <div className="rounded-[10px] bg-ink/[0.04] px-2.5 py-2">
      <p className="font-mono text-[18px] font-black tabular leading-none">{value}</p>
      <p className="mt-1 text-[10.5px] leading-tight text-ink/55">{text}</p>
    </div>
  );
}
