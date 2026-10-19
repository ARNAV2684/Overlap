// JsonViewer.tsx — Syntax-coloured JSON
//
// Purpose: show a message exactly as received, pretty-printed, with keys, strings and numbers in their own colours
// Inputs:  json (pretty-printed JSON text; null shows the placeholder), placeholder?, className
// Outputs: a scrolling <pre> that can take keyboard focus (so it can be scrolled without a mouse); tokenizeJson()
// Spec:    web/specs/screens.md (message inspector). web/IMPLEMENTATION_PLAN.md Phase 9.2
//
// A small tokenizer instead of a dependency. It only colours the text JSON.stringify produced, so it never changes it:
// the tokens joined back together are exactly the pretty-printed JSON.

import { useMemo } from "react";
import { cn } from "@/lib/cn";

export type JsonTokenKind = "key" | "string" | "number" | "literal" | "plain";
export type JsonToken = { kind: JsonTokenKind; text: string };

// A string (a key when a colon follows), a number, or true / false / null
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** Splits pretty-printed JSON into coloured tokens. Joining every token's text gives the input back unchanged. */
export function tokenizeJson(json: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const match of json.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ kind: "plain", text: json.slice(last, at) });
    const [, string, colon, number, literal] = match;
    if (string !== undefined && colon !== undefined) {
      tokens.push({ kind: "key", text: string }, { kind: "plain", text: colon });
    } else if (string !== undefined) {
      tokens.push({ kind: "string", text: string });
    } else if (number !== undefined) {
      tokens.push({ kind: "number", text: number });
    } else if (literal !== undefined) {
      tokens.push({ kind: "literal", text: literal });
    }
    last = at + match[0].length;
  }
  if (last < json.length) tokens.push({ kind: "plain", text: json.slice(last) });
  return tokens;
}

const colours: Record<JsonTokenKind, string | undefined> = {
  key: "text-blue-300",
  string: "text-orange-200",
  number: "text-greys-100",
  literal: "text-blue-200",
  plain: undefined,
};

type JsonViewerProps = {
  json: string | null;
  placeholder?: string;
  className?: string;
};

export function JsonViewer({ json, placeholder = "Incoming event data will appear here.", className }: JsonViewerProps) {
  const tokens = useMemo(() => (json === null ? null : tokenizeJson(json)), [json]);

  return (
    <pre
      tabIndex={0}
      aria-label="Message JSON"
      className={cn(
        "max-h-[340px] min-h-40 overflow-auto bg-bg/60 p-4 font-mono text-code text-ink-muted focus-visible:outline-offset-[-2px] sm:px-5",
        className,
      )}
    >
      {tokens === null
        ? placeholder
        : tokens.map((token, i) =>
            colours[token.kind] ? (
              <span key={i} className={colours[token.kind]}>
                {token.text}
              </span>
            ) : (
              token.text
            ),
          )}
    </pre>
  );
}
