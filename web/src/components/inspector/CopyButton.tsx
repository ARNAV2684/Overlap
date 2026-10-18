"use client";

// CopyButton.tsx — Copy the inspected message
//
// Purpose: copy the JSON shown in the inspector to the clipboard, and say whether it worked
// Inputs:  text (what to copy; null disables the button), className
// Outputs: a Button plus a polite status line: "Copied" (or "Copy failed") for 2 s, read out by screen readers
// Spec:    web/specs/screens.md (message inspector). web/IMPLEMENTATION_PLAN.md Phase 9.2
//
// The clipboard API needs a secure context (localhost counts) and can be refused; a refusal says "Copy failed".

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** How long "Copied" stays visible. */
export const COPIED_MS = 2000;

/** A new object per attempt, so copying twice in a row restarts the 2 s timer. */
type Result = { text: "Copied" | "Copy failed" } | null;

export function CopyButton({ text, className }: { text: string | null; className?: string }) {
  const [result, setResult] = useState<Result>(null);

  useEffect(() => {
    if (result === null) return;
    const timer = setTimeout(() => setResult(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy() {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setResult({ text: "Copied" });
    } catch {
      setResult({ text: "Copy failed" });
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span role="status" className="text-caption text-ink-muted">
        {result?.text ?? ""}
      </span>
      <Button size="sm" variant="ghost" disabled={text === null} onClick={copy}>
        Copy JSON
      </Button>
    </div>
  );
}
