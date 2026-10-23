// insights.ts — AI moment cards, player tags and the recap for one audience
//
// Purpose: read what the insights publisher sends to the viewer's audience group (CONTRACTS.md §6, §10.6), keep it
//          in order without duplicates, and decide which card is on screen for the current playhead
// Inputs:  envelopes from the audience group (live) and its snapshot (catch-up)
// Outputs: parseInsight(), createInsightFeed(), createGroupSocket()
// Spec:    web/specs/realtime.md §4; web/specs/screens.md §4
//
// The relay stays the only sender on match-<id>; the publisher is the only sender on the audience groups, with its
// own seq per group. Cards dedupe by overlay_id, so a reconnect or a snapshot never shows the same card twice.

import { z } from "zod";
import { negotiate as defaultNegotiate } from "@/lib/api";

// ---------------------------------------------------------------------------------------------------------------
// Shapes (loose on purpose: unknown extra fields are kept, so a richer publisher never breaks the screen)
// ---------------------------------------------------------------------------------------------------------------

const textByLang = z.record(z.string(), z.string());

export const overlaySchema = z.looseObject({
  overlay_id: z.string().min(1),
  match_id: z.string(),
  moment_id: z.string().optional(),
  kind: z.literal("moment"),
  priority: z.enum(["low", "normal", "high"]).catch("normal"),
  period: z.number().int().optional(),
  clock: z.string(),
  show_at_ms: z.number(),
  duration_ms: z.number().positive().catch(6000),
  mode: z.string().optional(),
  lang: z.string().optional(),
  modes: z.record(z.string(), textByLang),
  visual: z
    .looseObject({
      component: z.string(),
      window_ms: z.tuple([z.number(), z.number()]).optional(),
      highlight: z
        .looseObject({
          team_id: z.string().optional(),
          player_id: z.string().optional(),
          event_id: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  player_tags: z.array(z.looseObject({ player_id: z.string(), label: z.string() })).optional(),
  verified: z.boolean(),
  fallback: z.boolean(),
  facts_checked: z.array(z.string()).optional(),
});
export type Overlay = z.infer<typeof overlaySchema>;

export const playerTagSchema = z.looseObject({
  player_id: z.string(),
  name: z.string().nullable().optional(),
  metric: z.string(),
  value: z.number(),
  unit: z.string(),
  threshold: z.number().optional(),
});
export type PlayerTagData = z.infer<typeof playerTagSchema>;

export const recapSchema = z.looseObject({
  recap_id: z.string().optional(),
  match_id: z.string(),
  lines: z.array(z.looseObject({ text: z.string() })),
  verified: z.boolean().optional(),
  fallback: z.boolean().optional(),
});
export type RecapData = z.infer<typeof recapSchema>;

const outerSchema = z.looseObject({
  seq: z.number().int().nonnegative(),
  kind: z.string(),
  match_id: z.string(),
  match_ms: z.number(),
  clock: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export type Insight =
  | { kind: "overlay"; seq: number; matchMs: number; clock: string; data: Overlay }
  | { kind: "player_tag"; seq: number; matchMs: number; clock: string; data: PlayerTagData }
  | { kind: "recap"; seq: number; matchMs: number; clock: string; data: RecapData };

/** One envelope from an audience group, or null when it is not one we can show. */
export function parseInsight(raw: unknown, matchId: string): Insight | null {
  const outer = outerSchema.safeParse(raw);
  if (!outer.success || outer.data.match_id !== matchId) return null;
  const { seq, kind, match_ms: matchMs, clock, data } = outer.data;
  if (kind === "overlay") {
    const parsed = overlaySchema.safeParse(data);
    return parsed.success ? { kind, seq, matchMs, clock, data: parsed.data } : null;
  }
  if (kind === "player_tag") {
    const parsed = playerTagSchema.safeParse(data);
    return parsed.success ? { kind, seq, matchMs, clock, data: parsed.data } : null;
  }
  if (kind === "recap") {
    const parsed = recapSchema.safeParse(data);
    return parsed.success ? { kind, seq, matchMs, clock, data: parsed.data } : null;
  }
  return null;
}

/** The card's text for a mode and language, falling back to English and then to any text it has. */
export function overlayText(overlay: Overlay, mode: string, lang: string): string {
  const byMode = overlay.modes[mode] ?? Object.values(overlay.modes)[0] ?? {};
  return byMode[lang] ?? byMode.en ?? Object.values(byMode)[0] ?? "";
}

/**
 * The number a card is built around, picked out of its sentence so the card can show it big: a scoreline (3–0), else
 * the first number with a decimal or a unit (1.10, 61%, 0.42 xG, 24 m), else the first plain number that isn't a
 * match minute (45′). The
 * number itself comes from the evidence pack; this only finds it in the text. Null when the sentence has none.
 */
export function keyNumber(text: string): { before: string; number: string; after: string } | null {
  // A scoreline is one number to a reader: "3–0" stays whole
  const score = /(?<![\d.])(\d{1,2}) ?[–-] ?(\d{1,2})(?![\d%′'’])(?!\.\d)/.exec(text);
  if (score) return { before: text.slice(0, score.index), number: score[0], after: text.slice(score.index + score[0].length) };
  const candidates = [...text.matchAll(/(\d+(?:\.\d+)?)(\s?(?:%|xG|m\b|km\/h|min\b))?(['′’]?)/g)].filter((m) => !m[3]);
  const pick = candidates.find((m) => m[1].includes(".") || m[2]) ?? candidates[0];
  if (!pick || pick.index === undefined) return null;
  const number = `${pick[1]}${pick[2] ?? ""}`;
  return { before: text.slice(0, pick.index), number, after: text.slice(pick.index + number.length) };
}

// ---------------------------------------------------------------------------------------------------------------
// Feed: ordering, dedupe, and which card is up now
// ---------------------------------------------------------------------------------------------------------------

/** A card can still go on screen this long after its moment (CONTRACTS.md §10.6 expiry). */
export const LIVE_FOR_MS = 300_000;
/** How long a card stays up, in wall-clock ms (the overlay's duration_ms is wall time on screen). */
export const DEFAULT_SHOW_MS = 6000;

export type FeedState = {
  /** Every card received, newest moment first: the commentary feed. */
  cards: readonly Overlay[];
  /** The card on screen now, if any. */
  current: Overlay | null;
  tags: readonly PlayerTagData[];
  recap: RecapData | null;
};

export type InsightFeed = {
  add(insight: Insight): void;
  /** Moves the schedule on: `matchMs`/`period` is the base playhead, `wallNow` the browser's monotonic time. */
  tick(matchMs: number, period: number, wallNow: number): void;
  getState(): FeedState;
  subscribe(listener: () => void): () => void;
};

export function createInsightFeed(): InsightFeed {
  const byId = new Map<string, Overlay>();
  const shown = new Set<string>();
  let queue: Overlay[] = [];
  let current: { card: Overlay; until: number } | null = null;
  let tags: PlayerTagData[] = [];
  let recap: RecapData | null = null;
  let state: FeedState = { cards: [], current: null, tags: [], recap: null };
  const listeners = new Set<() => void>();

  const publish = () => {
    state = {
      cards: [...byId.values()].sort((a, b) => b.show_at_ms - a.show_at_ms),
      current: current?.card ?? null,
      tags,
      recap,
    };
    listeners.forEach((l) => l());
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(insight) {
      if (insight.kind === "overlay") {
        const card = insight.data;
        if (byId.has(card.overlay_id)) return;
        byId.set(card.overlay_id, card);
        queue.push(card);
        // At most two waiting; high priority first, then the newest moment
        queue.sort((a, b) => (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) || b.show_at_ms - a.show_at_ms);
        queue = queue.slice(0, 2);
      } else if (insight.kind === "player_tag") {
        tags = [insight.data, ...tags.filter((t) => !(t.player_id === insight.data.player_id && t.metric === insight.data.metric))].slice(0, 20);
      } else {
        recap = insight.data;
      }
      publish();
    },
    tick(matchMs, period, wallNow) {
      let changed = false;
      if (current && wallNow >= current.until) {
        current = null;
        changed = true;
      }
      // Drop cards that are no longer eligible
      const before = queue.length;
      queue = queue.filter((c) => matchMs - c.show_at_ms <= LIVE_FOR_MS && (c.period === undefined || c.period === period || matchMs < c.show_at_ms));
      if (queue.length !== before) changed = true;
      if (!current) {
        const i = queue.findIndex((c) => c.show_at_ms <= matchMs && (c.period === undefined || c.period === period));
        if (i >= 0) {
          const [card] = queue.splice(i, 1);
          if (!shown.has(card.overlay_id)) {
            shown.add(card.overlay_id);
            current = { card, until: wallNow + Math.max(DEFAULT_SHOW_MS, Math.min(card.duration_ms, 12_000)) };
          }
          changed = true;
        }
      }
      if (changed) publish();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Group socket: joins groups on the Web PubSub client protocol and hands every message to `onMessage`
// ---------------------------------------------------------------------------------------------------------------

export const SUBPROTOCOL = "json.webpubsub.azure.v1";

export type GroupSocket = { start(): void; stop(): void };

export type GroupSocketOptions = {
  groups: string[];
  onMessage: (data: unknown, group: string) => void;
  /** Called after each (re)connection has joined, so the caller can fetch a catch-up snapshot. */
  onJoined?: () => void;
  negotiate?: (groups: string[], signal?: AbortSignal) => Promise<{ url: string }>;
  WebSocketImpl?: typeof WebSocket;
};

export function createGroupSocket(options: GroupSocketOptions): GroupSocket {
  const negotiate = options.negotiate ?? defaultNegotiate;
  const WS = options.WebSocketImpl ?? globalThis.WebSocket;
  let running = false;
  let generation = 0;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let abort: AbortController | null = null;

  const schedule = (gen: number) => {
    if (!running || gen !== generation) return;
    const delay = Math.min(15_000, 2000 * 2 ** attempt++) * (1 + Math.random() * 0.2);
    retry = setTimeout(() => connect(), delay);
  };

  async function connect() {
    const gen = ++generation;
    abort?.abort();
    abort = new AbortController();
    try {
      const { url } = await negotiate(options.groups, abort.signal);
      if (!running || gen !== generation) return;
      const ws = new WS(url, SUBPROTOCOL);
      socket = ws;
      let ackId = 1;
      ws.onmessage = (event) => {
        if (gen !== generation) return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (msg.type === "system" && msg.event === "connected") {
          attempt = 0;
          for (const group of options.groups) ws.send(JSON.stringify({ type: "joinGroup", group, ackId: ackId++ }));
          options.onJoined?.();
        } else if (msg.type === "message" && msg.from === "group") {
          options.onMessage(msg.data, String(msg.group ?? ""));
        }
      };
      ws.onclose = () => {
        if (gen === generation) schedule(gen);
      };
      ws.onerror = () => ws.close();
    } catch {
      schedule(gen);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      void connect();
    },
    stop() {
      running = false;
      generation++;
      abort?.abort();
      if (retry) clearTimeout(retry);
      retry = null;
      socket?.close();
      socket = null;
    },
  };
}
