// PassMap.tsx — A player's or a team's passes
//
// Purpose: each pass as an arrow from where it started to where it ended: completed in the team colour, failed in
//          grey, key passes (a shot followed) in the accent
// Inputs:  passes in the team frame (charts.ts passLines), the team colour
// Outputs: SVG and a one-line summary
// Spec:    web/specs/charts.md §6

import type { PassLine } from "@/lib/live/charts";
import { MiniPitch, toM } from "./MiniPitch";

export function PassMap({ passes, colour, label }: { passes: readonly PassLine[]; colour: string; label: string }) {
  const shown = passes.slice(-160);
  const ok = passes.filter((p) => p.ok).length;
  const prog = passes.filter((p) => p.ok && p.progressive).length;
  const key = passes.filter((p) => p.key).length;
  const markerId = `pm-${label.replace(/\W/g, "")}`;
  return (
    <div>
      <MiniPitch label={label}>
        <defs>
          {[
            ["ok", colour],
            ["fail", "#7a7a92"],
            ["key", "#ff4f38"],
          ].map(([k, c]) => (
            <marker key={k} id={`${markerId}-${k}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto">
              <path d="M0 0 L6 3 L0 6 z" fill={c} />
            </marker>
          ))}
        </defs>
        {shown.map((p) => {
          const a = toM(p.x, p.y);
          const b = toM(p.ex, p.ey);
          const kind = p.key ? "key" : p.ok ? "ok" : "fail";
          const stroke = p.key ? "#ff4f38" : p.ok ? colour : "#7a7a92";
          return (
            <line
              key={p.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={stroke}
              strokeWidth={p.key ? 0.55 : 0.32}
              strokeOpacity={p.ok ? (p.progressive ? 0.95 : 0.55) : 0.45}
              markerEnd={`url(#${markerId}-${kind})`}
            />
          );
        })}
      </MiniPitch>
      <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/45">
        {passes.length ? `${ok}/${passes.length} completed · ${prog} progressive · ${key} key` : "No passes yet."}
      </p>
    </div>
  );
}
