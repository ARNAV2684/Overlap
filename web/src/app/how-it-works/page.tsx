// page.tsx — How it works
//
// Purpose: the pipeline in six steps, the seven agents, and what each pitch story means
// Inputs:  none
// Outputs: page
// Spec:    web/specs/screens.md §7

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works" };

const PIPELINE = [
  ["01", "Generator", "Synthetic league, played possession by possession: events, plus every player's position at 5 Hz."],
  ["02", "Event Hubs", "Events and tracking stream in as they happen. The relay forwards them; the archiver keeps every match."],
  ["03", "Stats engine", "xG, pass difficulty, pressing, momentum, control and rhythm, every match second. Spots the moments that matter."],
  ["04", "Seven agents", "Spotter, analyst (through MCP), narrator, fact-checker, translator, director, recap writer."],
  ["05", "Web PubSub", "Each audience (mode, language, club, player) gets its own ordered stream of checked cards."],
  ["06", "This screen", "A 3D pitch from the tracking, the story director's overlays, and the AI cards at the moment they matter."],
] as const;

const AGENTS = [
  ["Spotter", "Ranks the moments: goals first, then big chances, swings and presses."],
  ["Analyst", "Reads the moment's context through the MCP server: live state, pressing, pass network, periods."],
  ["Narrator", "Writes the line for each mode: casual, analyst, club and player."],
  ["Fact-checker", "Checks every number, name and claim against the evidence. Fails go back, then to a template."],
  ["Translator", "Spanish, Hindi and French, re-checked so every number survives."],
  ["Director", "Times the card, picks its chart, and sends one per audience."],
  ["Recap writer", "At full time, the story of the match from its moments."],
] as const;

export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-20 pt-10 sm:px-6">
      <p className="ov-eyebrow">How it works</p>
      <h1 className="mt-2 max-w-[760px] text-[32px] font-black leading-[1.08] tracking-tight sm:text-[42px]">
        From a synthetic kick to a <span className="text-accent">checked story</span> on your screen in about two seconds.
      </h1>
      <p className="mt-4 max-w-[640px] text-[15px] leading-relaxed text-ink/60">
        Overlap ingests a match as it happens, turns it into football statistics, explains why moments matter, renders them
        alongside the play, and tells the same match differently to a casual fan, an analyst, a club&apos;s supporter or someone
        following one player, in their language.
      </p>

      <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PIPELINE.map(([n, title, text]) => (
          <li key={n} className="ov-card p-5">
            <span className="font-mono text-[11px] font-black text-accent">{n}</span>
            <h2 className="mt-2 text-[18px] font-extrabold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-[14px] leading-snug text-ink/55">{text}</p>
          </li>
        ))}
      </ol>

      <div className="mb-4 mt-14 flex items-center gap-3">
        <h2 className="text-[22px] font-black tracking-tight">The seven agents</h2>
        <span className="h-px flex-1 bg-ink/[0.06]" />
        <span className="ov-sub">Microsoft Agent Framework · MCP</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {AGENTS.map(([name, text], i) => (
          <div key={name} className="ov-card p-4">
            <span className="font-mono text-[10px] font-black text-ink/35">{String(i + 1).padStart(2, "0")}</span>
            <p className="mt-1 text-[15px] font-extrabold">{name}</p>
            <p className="mt-1 text-[13px] leading-snug text-ink/50">{text}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 mt-14 flex items-center gap-3">
        <h2 className="text-[22px] font-black tracking-tight">What the pitch tells you</h2>
        <span className="h-px flex-1 bg-ink/[0.06]" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ["Territory", "Who owns the pitch: the share of the last few minutes the ball spent in each half, in the caption."],
          ["Team shape", "After a goal, the scoring team's lines are linked back to front, with how far their defensive line has dropped since."],
          ["Pass network", "When a team pins the other back: who passes to whom on the live players, and the lane they attack down."],
        ].map(([t, d]) => (
          <div key={t} className="ov-card p-5">
            <p className="text-[16px] font-extrabold">{t}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-ink/55">{d}</p>
          </div>
        ))}
      </div>

      <Link href="/" className="mt-12 inline-flex rounded-full bg-accent px-5 py-2.5 text-[14px] font-bold text-white hover:bg-accent/90">
        Watch a match →
      </Link>
    </main>
  );
}
