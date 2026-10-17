// cn.ts — Class name helper
//
// Purpose: join conditional class names and resolve Tailwind conflicts, aware of our custom text classes
// Inputs:  class names, arrays or { name: boolean } maps (anything clsx accepts)
// Outputs: one class string where, for conflicting utilities, the last one wins
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 2.3
//
// tailwind-merge would read an unknown text-score as a colour and drop it next to text-ink. The names below must
// match the --text-* tokens in src/app/globals.css.

import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display",
        "score",
        "metric",
        "title",
        "heading",
        "body",
        "body-sm",
        "caption",
        "eyebrow",
        "label",
        "clock",
        "code",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
