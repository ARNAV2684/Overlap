// CardChip.tsx — Yellow / red card chip
//
// Purpose: mark a booking on a timeline row. The words are always shown, so colour is never the only signal
// Inputs:  card ("yellow" | "second_yellow" | "red", the `card` field in CONTRACTS.md §3), className
// Outputs: a chip. A second yellow shows both chips: "Second yellow" in yellow, then "Red"
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import { cn } from "@/lib/cn";

export type CardKind = "yellow" | "second_yellow" | "red";

const chip = "inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-label font-semibold";
const yellowChip = "bg-card-yellow text-card-yellow-ink";
const redChip = "bg-card-red text-card-red-ink";

function Glyph() {
  // A small upright card, drawn in the chip's own text colour
  return <span aria-hidden="true" className="inline-block h-3 w-2 rounded-[2px] bg-current" />;
}

export function CardChip({ card, className }: { card: CardKind; className?: string }) {
  if (card === "second_yellow") {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <span className={cn(chip, yellowChip)}>
          <Glyph />
          Second yellow
        </span>
        <span className={cn(chip, redChip)}>
          <Glyph />
          Red
        </span>
      </span>
    );
  }
  return (
    <span className={cn(chip, card === "red" ? redChip : yellowChip, className)}>
      <Glyph />
      {card === "red" ? "Red card" : "Yellow card"}
    </span>
  );
}
