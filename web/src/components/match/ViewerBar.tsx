"use client";

// ViewerBar.tsx — Make the match yours
//
// Purpose: the personalisation controls: mode (casual, analyst, my club, player focus), language, favourite club and
//          followed player. Changing them switches the AI cards to that audience at once
// Inputs:  preferences; the match setup for the club and player lists
// Outputs: UI
// Spec:    web/specs/screens.md §3

import { LANG_LABELS, LANGS, MODE_LABELS, MODES, type Lang, type Mode } from "@/lib/preferences";
import { useScoreboard } from "@/lib/store-hooks";
import { useExperience } from "@/providers/MatchExperience";
import { usePreferences } from "@/providers/PreferencesProvider";

const selectCls =
  "w-full appearance-none rounded-[10px] border border-ink/10 bg-ink/[0.03] px-3 py-2 pr-8 text-[13px] font-semibold text-ink outline-none transition-colors hover:border-ink/20 focus-visible:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="ov-sub">{label}</span>
      <span className="relative">
        {children}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink/40">▼</span>
      </span>
    </label>
  );
}

export function ViewerBar() {
  const [prefs, update] = usePreferences();
  const { setup } = useScoreboard();
  const { mode } = useExperience();
  const teams = setup ? [setup.teams.home, setup.teams.away] : [];
  const fellBack = mode !== prefs.mode;

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
          <select className={selectCls} value={prefs.lang} onChange={(e) => update({ lang: e.target.value as Lang })}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Club">
          <select className={selectCls} value={prefs.club ?? ""} onChange={(e) => update({ club: e.target.value || null, ...(e.target.value ? { mode: "club" as Mode } : {}) })}>
            <option value="">None</option>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Follow">
          <select className={selectCls} value={prefs.player ?? ""} onChange={(e) => update({ player: e.target.value || null, ...(e.target.value ? { mode: "player" as Mode } : {}) })}>
            <option value="">Nobody</option>
            {teams.map((t) => (
              <optgroup key={t.team_id} label={t.name}>
                {t.lineup.map((p) => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.shirt} · {p.name} ({p.pos})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
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
