// PassNetwork.tsx — Who passes to whom
//
// Purpose: a team's passing connections from the stats engine: each player at the mean spot they pass from, links
//          between pairs with three or more completed passes, thicker for more
// Inputs:  the heavy block's pass network for one side (CONTRACTS.md §7.4), shirt numbers, the team colour
// Outputs: SVG
// Spec:    web/specs/charts.md §7

import type { PassNetworkData } from "@/lib/contracts";
import { MiniPitch, toM } from "./MiniPitch";

export function PassNetwork({
  network,
  shirts,
  colour,
  label,
}: {
  network: PassNetworkData | null;
  shirts: ReadonlyMap<string, number>;
  colour: string;
  label: string;
}) {
  if (!network || !network.nodes.length) {
    return (
      <MiniPitch label={label}>
        <text x="52.5" y="35" textAnchor="middle" className="fill-ink/40 text-[3px]">
          The network appears after the first minute.
        </text>
      </MiniPitch>
    );
  }
  const at = new Map(network.nodes.map((n) => [n.player_id, toM(n.x, n.y)]));
  const maxLink = Math.max(1, ...network.links.map((l) => l.count));
  const maxPasses = Math.max(1, ...network.nodes.map((n) => n.passes));
  return (
    <MiniPitch label={label}>
      {network.links.map((l) => {
        const a = at.get(l.from);
        const b = at.get(l.to);
        if (!a || !b) return null;
        const t = l.count / maxLink;
        return <line key={`${l.from}-${l.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colour} strokeWidth={0.25 + t * 1.6} strokeOpacity={0.25 + t * 0.6} strokeLinecap="round" />;
      })}
      {network.nodes.map((n) => {
        const p = at.get(n.player_id)!;
        const r = 1.6 + (n.passes / maxPasses) * 1.8;
        return (
          <g key={n.player_id}>
            <circle cx={p.x} cy={p.y} r={r} fill={colour} stroke="#fff" strokeWidth="0.35" />
            <text x={p.x} y={p.y + 0.9} textAnchor="middle" className="fill-white font-mono text-[2.4px] font-black">
              {shirts.get(n.player_id) ?? ""}
            </text>
          </g>
        );
      })}
    </MiniPitch>
  );
}
