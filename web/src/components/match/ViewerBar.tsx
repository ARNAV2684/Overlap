"use client";

// ViewerBar.tsx — Make the match yours
//
// Purpose: the personalisation controls: mode (casual, analyst, my club, player focus), language, favourite club and
//          followed player. Changing them switches the AI cards to that audience at once
// Inputs:  preferences; the match setup for the club and player lists
// Outputs: UI
// Spec:    web/specs/screens.md §3

import { useId } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { LANG_LABELS, LANGS, MODE_LABELS, MODES, type Lang, type Mode } from "@/lib/preferences";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";

/** A labelled picker: the label names the dropdown for screen readers (Select's aria-labelledby). */
function Field({ label, children }: { label: string; children: (labelId: string) => React.ReactNode }) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span id={labelId} className="ov-sub">
        {label}
      </span>
      {children(labelId)}
    </div>
  );
}

export function ViewerBar() {
  const [prefs, update] = usePreferences();
  const { setup } = useScoreboard();
  const { mode } = useExperience();
  const teams = setup ? [setup.teams.home, setup.teams.away] : [];
  const fellBack = mode !== prefs.mode;
  const langOptions: SelectOption[] = LANGS.map((l) => ({ value: l, label: LANG_LABELS[l] }));
  const clubOptions: SelectOption[] = [{ value: "", label: "None" }, ...teams.map((t) => ({ value: t.team_id, label: t.name }))];
  // The starting elevens, under each club's name
  const playerOptions: SelectOption[] = [
    { value: "", label: "Nobody" },
    ...teams.flatMap((t) => t.lineup.map((p) => ({ value: p.player_id, label: `${p.shirt} · ${p.name} (${p.pos})`, group: t.name }))),
  ];

  return (
    <div className="ov-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="ov-eyebrow">Your match</p>
        <span className="ov-sub">same match · your story</span>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-[12px] bg-ink/[0.04] p-1" role="radiogroup" aria-label="Mode">
        {MODES.map((m: Mode) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={prefs.mode === m}
            onClick={() => update({ mode: m })}
            className={`rounded-[9px] px-1 py-2 text-[12px] font-bold transition-colors ${
              prefs.mode === m ? "bg-surface text-ink shadow-sm" : "text-ink/50 hover:text-ink/80"
            }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Language">
          {(labelId) => (
            <Select labelledBy={labelId} value={prefs.lang} options={langOptions} onChange={(v) => update({ lang: v as Lang })} />
          )}
        </Field>
        <Field label="Club">
          {(labelId) => (
            <Select
              labelledBy={labelId}
              value={prefs.club ?? ""}
              options={clubOptions}
              onChange={(v) => update({ club: v || null, ...(v ? { mode: "club" as Mode } : {}) })}
            />
          )}
        </Field>
        <Field label="Follow">
          {(labelId) => (
            <Select
              labelledBy={labelId}
              align="end"
              value={prefs.player ?? ""}
              options={playerOptions}
              onChange={(v) => update({ player: v || null, ...(v ? { mode: "player" as Mode } : {}) })}
            />
          )}
        </Field>
      </div>
      {fellBack && (
        <p className="mt-2.5 text-[12px] text-ink/45">
          {prefs.mode === "club" ? "Pick a club in this match" : "Pick a player in this match"} for {MODE_LABELS[prefs.mode].toLowerCase()} cards; showing casual for now.
        </p>
      )}
    </div>
  );
}
