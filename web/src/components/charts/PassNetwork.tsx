// PassNetwork.tsx — Who passes to whom
//
// Purpose: a team's passing connections from the stats engine: each player at the mean spot they pass from (sized by
//          passes, with the shirt number), links between pairs with three or more completed passes, thicker for
//          more; the strongest connections and the hub of the team listed beside it
// Inputs:  the heavy block's pass network for one side (CONTRACTS.md §7.4), shirt numbers and names
// Outputs: a viz card
// Spec:    web/specs/charts.md §7

import type { PassNetworkData } from "@/lib/contracts";
import { Em, EmptyViz, InsightPanel, VizCard, VizPitch } from "@/components/viz/Viz";

export function PassNetwork({
  network,
  shirts,
  names,
  team,
  controls,
}: {
  network: PassNetworkData | null;
  shirts: ReadonlyMap<string, number>;
  names?: ReadonlyMap<string, string>;
  team: string;
  controls?: React.ReactNode;
}) {
  const nodes = network?.nodes ?? [];
  const links = network?.links ?? [];
  const at = new Map(nodes.map((n) => [n.player_id, { x: n.x * 1.05, y: n.y * 0.68 }]));
  const maxLink = Math.max(1, ...links.map((l) => l.count));
  const maxPasses = Math.max(1, ...nodes.map((n) => n.passes));
  const hub = [...nodes].sort((a, b) => b.passes - a.passes)[0];
  const strongest = [...links].sort((a, b) => b.count - a.count).slice(0, 4);
  const name = (id: string) => names?.get(id)?.split(" ").slice(-1)[0] ?? `#${shirts.get(id) ?? "?"}`;
  const linked = links.reduce((s, l) => s + l.count, 0);
  return (
    <VizCard
      eyebrow="Pass network · starting XI"
      title={`How ${team} connect`}
      subtitle="Players at the average spot they pass from; lines for pairs with 3 or more completed passes"
      kpis={[
        { value: String(nodes.reduce((s, n) => s + n.passes, 0)), label: "Passes" },
        { value: String(links.length), label: "Links", focus: true },
        { value: String(linked), label: "Linked passes" },
      ]}
      controls={controls}
      aside={
        hub ? (
          <InsightPanel
            sentence={
              <>
                Play runs through <Em>{name(hub.player_id)}</Em>, with {hub.passes} passes from an average spot{" "}
                {hub.x < 40 ? "deep in their own half" : hub.x < 60 ? "around halfway" : "in the attacking half"}.
              </>
            }
            listTitle="Strongest connections"
            items={strongest.map((l) => ({ label: `${name(l.from)} → ${name(l.to)}`, value: String(l.count) }))}
          />
        ) : undefined
      }
    >
      {!nodes.length ? (
        <EmptyViz text="The network appears after the first minute." />
      ) : (
        <VizPitch label={`${team} pass network: ${nodes.length} players, ${links.length} links`}>
          {links.map((l) => {
            const a = at.get(l.from);
            const b = at.get(l.to);
            if (!a || !b) return null;
            const t = l.count / maxLink;
            return <line key={`${l.from}-${l.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-viz-focus)" strokeWidth={0.25 + t * 1.5} strokeOpacity={0.2 + t * 0.7} strokeLinecap="round" />;
          })}
          {nodes.map((n) => {
            const p = at.get(n.player_id)!;
            const r = 1.7 + (n.passes / maxPasses) * 2;
            return (
              <g key={n.player_id}>
                <circle cx={p.x} cy={p.y} r={r} fill="var(--color-viz-bg)" stroke="var(--color-viz-focus)" strokeWidth="0.5" />
                <text x={p.x} y={p.y + 0.95} textAnchor="middle" className="viz-svg-count" style={{ fontSize: "2.6px" }}>
                  {shirts.get(n.player_id) ?? ""}
                </text>
              </g>
            );
          })}
        </VizPitch>
      )}
    </VizCard>
  );
}
