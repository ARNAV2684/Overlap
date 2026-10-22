// PassNetwork.tsx — Pass network
//
// Purpose: who passes to whom in one team: a node per player at his mean pass-start position, sized by passes, and a
//          link per pair with 3 or more completed passes, scaled to the busiest link (metrics.md §6), attacking left
//          to right
// Inputs:  network (heavy.pass_network[side], or null before the first heavy panel: an empty pitch with "First update
//          at the end of the first minute"), players (names and shirts from the setup), team (the club's name),
//          colour (its primary kit colour, or undefined before the setup: grey), className
// Outputs: a TeamPitch figure whose label counts players and links and names the busiest passer; a <title> on every
//          node and link
// Spec:    web/specs/charts.md §2 (pass network)
//
// The stats engine draws the network for the starting XI until the team's first substitution, which the caption says.
// Nodes get the dark marker outline and readableInk() numbers, like the live pitch's markers. No window or highlight
// yet: they come with overlays.

import { memo } from "react";
import { TeamPitch } from "@/components/charts/pitch/TeamPitch";
import { cn } from "@/lib/cn";
import type { PassNetworkData } from "@/lib/contracts";
import { FIRST_HEAVY_NOTE, networkGeometry, topPasser } from "@/lib/stat-charts";
import type { PlayerInfo } from "@/lib/store";
import { inkFillClass } from "@/lib/team-colours";

type PassNetworkProps = {
  network: PassNetworkData | null;
  players: ReadonlyMap<string, PlayerInfo>;
  team: string;
  colour?: string;
  className?: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function PassNetworkView({ network, players, team, colour, className }: PassNetworkProps) {
  if (!network) {
    return <TeamPitch label={`Pass network, ${team}: ${FIRST_HEAVY_NOTE.toLowerCase()}`} empty={FIRST_HEAVY_NOTE} className={className} />;
  }

  const { nodes, links } = networkGeometry(network, players);
  const top = topPasser(nodes);
  const label =
    `Pass network, ${team}: ${plural(nodes.length, "player", "players")}, ` +
    `${plural(links.length, "link", "links")} of 3 or more passes.` +
    (top ? ` Most passes: ${top.name} (${top.passes}).` : "");

  return (
    <TeamPitch label={label} caption="Starting XI until the first substitution" className={className}>
      <g>
        {links.map((link) => (
          <line
            key={link.key}
            x1={link.from.x}
            y1={link.from.y}
            x2={link.to.x}
            y2={link.to.y}
            strokeWidth={link.width}
            strokeOpacity={link.opacity}
            strokeLinecap="round"
            className="stroke-pitch-marker-edge"
          >
            <title>{`${link.from.name} to ${link.to.name}: ${plural(link.count, "pass", "passes")}`}</title>
          </line>
        ))}
      </g>
      <g>
        {nodes.map((node) => (
          <g key={node.playerId} transform={`translate(${node.x} ${node.y})`}>
            <title>{`${node.name}: ${plural(node.passes, "pass", "passes")}`}</title>
            <circle
              r={node.r}
              fill={colour}
              strokeWidth={0.25}
              className={cn("stroke-pitch-marker-edge", colour === undefined && "fill-greys-500")}
            />
            {node.shirt === undefined ? null : (
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(1.2, node.r * 0.9)}
                className={cn("font-semibold select-none", colour ? inkFillClass(colour) : "fill-white")}
              >
                {node.shirt}
              </text>
            )}
          </g>
        ))}
      </g>
    </TeamPitch>
  );
}

export const PassNetwork = memo(PassNetworkView);
