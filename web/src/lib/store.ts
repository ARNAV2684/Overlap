// store.ts — Match store
//
// Purpose: the one state for the live screen. Every envelope goes in through ingest(); the screen reads small,
//          reference-stable slices of it (see store-hooks.ts)
// Inputs:  envelopes (validated, or raw and validated here), the connection status, the viewer's controls
// Outputs: createMatchStore(): getState(), subscribe(), and the actions below
// Spec:    web/specs/realtime.md §2. web/IMPLEMENTATION_PLAN.md Phase 5.1
//
// How it works
//  - Ingesting is cheap and constant. Rows and counters change in plain mutable fields; React is told at most once
//    every 250 ms (FLUSH_MS), so a 20x feed does not re-render per message.
//  - `seq` is the dedupe key: an envelope whose seq was already applied is dropped (delivery is at-least-once).
//    Dedupe lasts for one session: reset() starts a new one, which a reconnect needs because a restarted server
//    counts seq from 1 again. A snapshot's seq is not contiguous, so nothing here assumes +1.
//  - Two kinds of slice. "Live" slices (connection, scoreboard, notice, controls, players) always update. "Display"
//    slices (counters, timeline, latest frame, stats, inspector) freeze while the feed is paused and catch up on resume.
//  - Stat panels add no row: the store keeps the newest panel and the newest one with a heavy block (CONTRACTS.md §7.4).
//  - A slice keeps the same object until its content changes, so a component re-renders only when its data did.
//  - Time: ordering uses match_ms and arrival order, never the display clock string (CONTRACTS.md §1.2).

import type {
  Envelope,
  HeavyStatPanel,
  MatchEvent,
  MatchSetup,
  ParsedEnvelope,
  Phase,
  PositionsData,
  StatPanel,
  StatusData,
  TrackingFrame,
} from "@/lib/contracts";
import { describeRejection, parseEnvelope } from "@/lib/contracts";
import { describeEvent, playerNamer, type Emphasis, type PlayerNamer } from "@/lib/describe-event";
import { formatPhase } from "@/lib/format";
import { RingBuffer } from "@/lib/ring-buffer";

// ---------------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------------

/** Rows kept per category (match events and state changes; tracking frames). */
export const ROW_LIMIT = 600;
/** Rows shown for the active filter. */
export const VISIBLE_ROWS = 120;
/** React is told about changes at most this often. */
export const FLUSH_MS = 250;
/** No message for this long while live means the stream has gone quiet. */
export const STALE_AFTER_MS = 10_000;
/** The "messages in the last 10 seconds" window. */
export const RECENT_WINDOW_MS = 10_000;
/** Rejected messages written to the console, so a drifting contract is loud but does not flood it. */
const MAX_LOGGED_REJECTIONS = 5;

export const notices = {
  connecting: "Connecting to the match stream…",
  loadingHistory: "Loading earlier match events while new messages arrive…",
  connected: "Connected. New messages appear automatically; earlier events are marked History.",
  historyUnavailable: "Earlier history is unavailable. New live messages will still appear.",
  unreachable: "Cannot reach the stream server. Is it running?",
  connectionLost: "Connection lost. Displaying the last received data; retrying shortly.",
  finished: "Full time. The stream closed; the last received data remains visible.",
  paused: "Feed, counters and pitch paused. Reception and scoreboard continue; resume to catch up.",
  resumed: "Display resumed. New messages appear automatically.",
  stale: (seconds: number, phase: Phase | null) =>
    `No messages for ${seconds} seconds. Match phase: ${phase ? formatPhase(phase).toLowerCase() : "unknown"}.`,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------

export type ConnectionStatus = "connecting" | "live" | "stale" | "reconnecting" | "finished";
export type Filter = "events" | "tracking" | "all";
export type RowKind = "event" | "status" | "tracking";

export type PlayerInfo = {
  player_id: string;
  name: string;
  pos: string;
  shirt: number;
  team_id: string;
  side: "home" | "away";
};

/** One line of the timeline. Immutable. */
export type TimelineRow = {
  /** Unique per row: the envelope's seq, plus ":<n>" for the n-th frame of a positions envelope. */
  key: string;
  /** Arrival order, ascending. Newest-first display sorts on this. */
  order: number;
  /** The envelope's seq (not the event's own seq). */
  seq: number;
  kind: RowKind;
  /** match_ms of what happened. */
  ms: number;
  period?: number;
  title: string;
  detail: string;
  teamId?: string;
  emphasis?: Emphasis;
  /** When the browser received it, or null for rows that came from the snapshot ("History"). */
  received: number | null;
  /** What the inspector shows. */
  raw: unknown;
  /** Kept on event rows so they can be described again if the setup arrives late. */
  event?: MatchEvent;
};

export type ConnectionState = {
  status: ConnectionStatus;
  /** Messages rejected by contract validation in this session. */
  rejected: number;
};

export type Scoreboard = {
  matchId: string;
  setup: MatchSetup | null;
  /** null until the first status envelope. */
  phase: Phase | null;
  period: number;
  score: { home: number; away: number } | null;
  /** The server's display clock, for example "62:14". Never computed with. */
  clock: string;
  /** Play time of the newest thing seen; only moves forward. */
  matchMs: number;
};

export type Counters = {
  /** Live (not snapshot) envelopes, events and tracking frames received on this connection. */
  messages: number;
  events: number;
  frames: number;
  lastAt: number | null;
  /** Live messages in the last 10 seconds. */
  recent: number;
};

export type Timeline = {
  filter: Filter;
  /** The newest VISIBLE_ROWS rows for the filter, newest first. */
  rows: readonly TimelineRow[];
};

export type Inspector = {
  /** The selected row, or (when following) the newest event. */
  row: TimelineRow | null;
  following: boolean;
};

/** The stat panels the charts read. Panels are cumulative, so the newest of each is all a chart needs. */
export type Stats = {
  /** The panel with the greatest match_ms. */
  latest: StatPanel | null;
  /** The panel with the greatest match_ms among those with a heavy block (every whole minute and at PeriodEnd). */
  heavy: HeavyStatPanel | null;
};

export type Controls = { filter: Filter; paused: boolean };
export type Notice = { text: string; tone: "info" | "warning" };

export type StoreState = {
  // live
  connection: ConnectionState;
  scoreboard: Scoreboard;
  controls: Controls;
  notice: Notice;
  players: ReadonlyMap<string, PlayerInfo>;
  // display: frozen while paused
  counters: Counters;
  timeline: Timeline;
  latestFrame: TrackingFrame | null;
  stats: Stats;
  inspector: Inspector;
};

export type IngestResult = "applied" | "duplicate" | "wrong-match" | "ignored";

export type MatchStore = {
  readonly matchId: string;
  getState(): StoreState;
  subscribe(listener: () => void): () => void;
  /**
   * Hands every applied envelope to `listener` straight away, before the 250 ms display flush, so a renderer can
   * keep every tracking frame (the display slice keeps only the newest). Returns the unsubscribe function.
   */
  onEnvelope(listener: (envelope: ParsedEnvelope, receivedAt: number | null) => void): () => void;
  /** Applies a validated envelope. `receivedAt` is the browser's time, or null for snapshot (history) envelopes. */
  ingest(envelope: ParsedEnvelope, receivedAt: number | null): IngestResult;
  /** Validates first. A message that fails is counted and logged, never thrown. */
  ingestRaw(raw: unknown, receivedAt: number | null): IngestResult | "rejected";
  /** The setup from a snapshot (it also arrives inside the first status envelope). */
  setSetup(setup: MatchSetup): void;
  /** Adds to the rejected-message count, for envelopes the snapshot loader already refused. */
  addRejected(count: number): void;
  /** Starts a new session: forgets rows, counters and applied seqs. Keeps the filter and pause state. */
  reset(): void;
  setConnection(status: ConnectionStatus): void;
  /** Ignored while paused, so the pause notice stays. */
  setNotice(text: string, tone?: Notice["tone"]): void;
  /** Call about once a second: expires old arrivals and notices when the stream has gone quiet. */
  tick(now?: number): void;
  setFilter(filter: Filter): void;
  setPaused(paused: boolean): void;
  select(key: string): void;
  followLatest(): void;
  /** Publishes pending changes now instead of at the next 250 ms tick. */
  flush(): void;
  /** Stops the timer and forgets listeners. */
  destroy(): void;
};

export type StoreOptions = {
  /** Clock, for tests. */
  now?: () => number;
  flushMs?: number;
  /** Called with one line for each of the first few rejected messages. Defaults to console.warn. */
  onReject?: (message: string) => void;
};

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

const DISPLAY_SLICES = ["counters", "timeline", "latestFrame", "stats", "inspector"] as const;
type Slice = keyof StoreState;

function sameRows(a: readonly TimelineRow[], b: readonly TimelineRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row === b[i]);
}

/** Merges two newest-first lists by arrival order, newest first, keeping `limit`. */
function mergeNewest(a: TimelineRow[], b: TimelineRow[], limit: number): TimelineRow[] {
  const out: TimelineRow[] = [];
  let i = 0;
  let j = 0;
  while (out.length < limit && (i < a.length || j < b.length)) {
    if (j >= b.length || (i < a.length && a[i].order > b[j].order)) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

/** The scoreboard before anything has arrived. Exported for the loading fallback, which must look the same. */
export const emptyScoreboard = (matchId: string): Scoreboard => ({
  matchId,
  setup: null,
  phase: null,
  period: 0,
  score: null,
  clock: "–:–",
  matchMs: -1,
});

/** The counters before anything has arrived. Exported for the loading fallback. */
export const emptyCounters = (): Counters => ({ messages: 0, events: 0, frames: 0, lastAt: null, recent: 0 });

/** No stat panel yet. Exported for the loading fallback. */
export const emptyStats = (): Stats => ({ latest: null, heavy: null });

const hasHeavy = (panel: StatPanel): panel is HeavyStatPanel => panel.heavy !== undefined;

function playersFrom(setup: MatchSetup | null): Map<string, PlayerInfo> {
  const map = new Map<string, PlayerInfo>();
  if (!setup) return map;
  for (const side of ["home", "away"] as const) {
    const team = setup.teams[side];
    for (const p of [...team.lineup, ...team.bench]) {
      map.set(p.player_id, { player_id: p.player_id, name: p.name, pos: p.pos, shirt: p.shirt, team_id: team.team_id, side });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------------------------------------------

export function createMatchStore(matchId: string, options: StoreOptions = {}): MatchStore {
  const now = options.now ?? Date.now;
  const flushMs = options.flushMs ?? FLUSH_MS;
  const onReject = options.onReject ?? ((message: string) => console.warn(message));

  // ---- mutable working data (cheap to change; React never sees it directly)
  let applied = new Set<number>();
  let order = 0;
  const events = new RingBuffer<TimelineRow>(ROW_LIMIT); // event and status rows
  const tracking = new RingBuffer<TimelineRow>(ROW_LIMIT);
  let setup: MatchSetup | null = null;
  let nameOf: PlayerNamer = playerNamer(null);
  let scoreboard = emptyScoreboard(matchId);
  let counters = emptyCounters();
  let arrivals: number[] = [];
  let latestFrame: TrackingFrame | null = null;
  let latestPanel: StatPanel | null = null;
  let heavyPanel: HeavyStatPanel | null = null;
  let selectedRow: TimelineRow | null = null;
  let rejected = 0;
  let loggedRejections = 0;
  let status: ConnectionStatus = "connecting";
  let lastAt: number | null = null;
  let filter: Filter = "events";
  let paused = false;
  /** While paused, rows that arrived after this order are hidden from the display. */
  let cutoff: number | null = null;
  const envelopeListeners = new Set<(envelope: ParsedEnvelope, receivedAt: number | null) => void>();
  let notice: Notice = { text: notices.connecting, tone: "info" };

  // ---- published state
  let state: StoreState = {
    connection: { status, rejected },
    scoreboard,
    controls: { filter, paused },
    notice,
    players: new Map(),
    counters,
    timeline: { filter, rows: [] },
    latestFrame: null,
    stats: emptyStats(),
    inspector: { row: null, following: true },
  };
  const listeners = new Set<() => void>();
  const dirty = new Set<Slice>();
  let forceDisplay = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFlushAt = Number.NEGATIVE_INFINITY;

  const visible = (row: TimelineRow) => cutoff === null || row.order <= cutoff;

  // ---- publishing
  function mark(...slices: Slice[]) {
    for (const s of slices) dirty.add(s);
    schedule();
  }

  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(flush, Math.max(0, flushMs - (now() - lastFlushAt)));
  }

  /** Publishes now, for user actions that should feel instant. */
  function flushNow(forDisplay = false) {
    if (forDisplay) forceDisplay = true;
    flush();
  }

  function rowsFor(f: Filter): TimelineRow[] {
    if (f === "events") return events.newest(VISIBLE_ROWS, visible);
    if (f === "tracking") return tracking.newest(VISIBLE_ROWS, visible);
    return mergeNewest(events.newest(VISIBLE_ROWS, visible), tracking.newest(VISIBLE_ROWS, visible), VISIBLE_ROWS);
  }

  function followedRow(): TimelineRow | null {
    return (
      events.find((r) => r.kind === "event" && visible(r)) ??
      events.find(visible) ??
      tracking.find(visible) ??
      null
    );
  }

  function recentCount(at: number): number {
    while (arrivals.length > 0 && arrivals[0] <= at - RECENT_WINDOW_MS) arrivals.shift();
    return arrivals.length;
  }

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastFlushAt = now();
    const next: Partial<StoreState> = {};
    const showDisplay = !paused || forceDisplay;

    for (const slice of [...dirty]) {
      const isDisplay = (DISPLAY_SLICES as readonly Slice[]).includes(slice);
      if (isDisplay && !showDisplay) continue; // stays dirty until resume
      dirty.delete(slice);

      switch (slice) {
        case "connection": {
          const c = state.connection;
          if (c.status !== status || c.rejected !== rejected) next.connection = { status, rejected };
          break;
        }
        case "scoreboard": {
          const s = state.scoreboard;
          const same =
            s.setup === scoreboard.setup &&
            s.phase === scoreboard.phase &&
            s.period === scoreboard.period &&
            s.clock === scoreboard.clock &&
            s.matchMs === scoreboard.matchMs &&
            s.score?.home === scoreboard.score?.home &&
            s.score?.away === scoreboard.score?.away &&
            (s.score === null) === (scoreboard.score === null);
          if (!same) next.scoreboard = scoreboard;
          break;
        }
        case "controls":
          if (state.controls.filter !== filter || state.controls.paused !== paused) next.controls = { filter, paused };
          break;
        case "notice":
          if (state.notice.text !== notice.text || state.notice.tone !== notice.tone) next.notice = notice;
          break;
        case "players":
          next.players = playersFrom(setup);
          break;
        case "counters": {
          const recent = recentCount(now());
          const c = state.counters;
          if (
            c.messages !== counters.messages ||
            c.events !== counters.events ||
            c.frames !== counters.frames ||
            c.lastAt !== counters.lastAt ||
            c.recent !== recent
          ) {
            next.counters = { ...counters, recent };
          }
          break;
        }
        case "timeline": {
          const rows = rowsFor(filter);
          if (state.timeline.filter !== filter || !sameRows(state.timeline.rows, rows)) {
            next.timeline = { filter, rows };
          }
          break;
        }
        case "latestFrame":
          if (state.latestFrame !== latestFrame) next.latestFrame = latestFrame;
          break;
        case "stats":
          if (state.stats.latest !== latestPanel || state.stats.heavy !== heavyPanel) {
            next.stats = { latest: latestPanel, heavy: heavyPanel };
          }
          break;
        case "inspector": {
          const row = selectedRow ?? followedRow();
          const following = selectedRow === null;
          if (state.inspector.row !== row || state.inspector.following !== following) {
            next.inspector = { row, following };
          }
          break;
        }
      }
    }
    forceDisplay = false;

    if (Object.keys(next).length > 0) {
      state = { ...state, ...next };
      for (const listener of [...listeners]) listener();
    }
  }

  // ---- row builders
  function eventRow(env: Envelope<"event", MatchEvent>, received: number | null): TimelineRow {
    const e = env.data;
    const d = describeEvent(e, nameOf);
    return {
      key: String(env.seq),
      order: ++order,
      seq: env.seq,
      kind: "event",
      ms: e.match_ms,
      period: e.period,
      title: d.title,
      detail: d.detail,
      teamId: e.team_id,
      emphasis: d.emphasis,
      received,
      raw: env,
      event: e,
    };
  }

  function statusRow(env: Envelope<"status", StatusData>, received: number | null): TimelineRow {
    return {
      key: String(env.seq),
      order: ++order,
      seq: env.seq,
      kind: "status",
      ms: env.match_ms,
      period: env.data.period,
      title: "Match state",
      detail: formatPhase(env.data.phase),
      received,
      raw: env,
    };
  }

  function frameRow(env: Envelope<"positions", PositionsData>, frame: TrackingFrame, index: number, received: number | null): TimelineRow {
    return {
      key: `${env.seq}:${index}`,
      order: ++order,
      seq: env.seq,
      kind: "tracking",
      ms: frame.match_ms,
      period: frame.period,
      title: "Position frame",
      detail: `${frame.players.length} players · ball (${frame.ball.x}, ${frame.ball.y})`,
      received,
      raw: { envelope_seq: env.seq, kind: "tracking", match_id: env.match_id, frame },
    };
  }

  // ---- actions
  function applySetup(next: MatchSetup) {
    // The setup arrives twice (snapshot, then the first status). Same match and seed means the same setup (CONTRACTS.md §2).
    if (setup !== null && setup.match_id === next.match_id && setup.seed === next.seed) return;
    const first = setup === null;
    setup = next;
    nameOf = playerNamer(next);
    scoreboard = { ...scoreboard, setup: next };
    if (first && events.size > 0) {
      // Events arrived before the setup, so their rows show ids. Describe them again with names.
      events.update((row) => {
        if (!row.event) return row;
        const d = describeEvent(row.event, nameOf);
        const updated = { ...row, title: d.title, detail: d.detail, emphasis: d.emphasis };
        if (selectedRow?.key === row.key) selectedRow = updated;
        return updated;
      });
      mark("timeline", "inspector");
    }
    mark("scoreboard", "players");
  }

  const store: MatchStore = {
    matchId,

    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    ingest(envelope, receivedAt) {
      if (envelope.match_id !== matchId) return "wrong-match";
      if (envelope.kind !== "event" && envelope.kind !== "positions" && envelope.kind !== "status" && envelope.kind !== "stats") {
        return "ignored";
      }
      if (applied.has(envelope.seq)) return "duplicate";
      applied.add(envelope.seq);

      const live = receivedAt !== null;
      if (live) {
        counters = { ...counters, messages: counters.messages + 1, lastAt: receivedAt };
        arrivals.push(receivedAt);
        lastAt = receivedAt;
        mark("counters");
        if (status === "stale") {
          status = "live";
          notice = { text: notices.connected, tone: "info" };
          mark("connection", "notice");
        }
      }

      // The clock only moves forward (it is the newest play time seen)
      if (envelope.match_ms >= scoreboard.matchMs) {
        scoreboard = { ...scoreboard, matchMs: envelope.match_ms, clock: envelope.clock };
        mark("scoreboard");
      }

      switch (envelope.kind) {
        case "status": {
          const d = envelope.data;
          if (d.setup) applySetup(d.setup);
          scoreboard = { ...scoreboard, phase: d.phase, period: d.period, score: { ...d.score } };
          events.push(statusRow(envelope, receivedAt));
          mark("scoreboard", "timeline", "inspector");
          break;
        }
        case "event": {
          if (live) counters = { ...counters, events: counters.events + 1 };
          events.push(eventRow(envelope, receivedAt));
          mark("timeline", "inspector");
          break;
        }
        case "positions": {
          const frames = envelope.data.frames;
          if (live) counters = { ...counters, frames: counters.frames + frames.length };
          frames.forEach((frame, i) => {
            tracking.push(frameRow(envelope, frame, i, receivedAt));
            if (latestFrame === null || frame.match_ms >= latestFrame.match_ms) latestFrame = frame;
          });
          mark("timeline", "latestFrame", "inspector");
          break;
        }
        case "stats": {
          // Envelope order is send order, so a panel can arrive after a newer one: keep the newest by match_ms.
          // A re-sent panel for the same second replaces the one before it.
          const panel = envelope.data;
          if (latestPanel === null || panel.match_ms >= latestPanel.match_ms) latestPanel = panel;
          if (hasHeavy(panel) && (heavyPanel === null || panel.match_ms >= heavyPanel.match_ms)) heavyPanel = panel;
          mark("stats");
          break;
        }
      }
      envelopeListeners.forEach((listener) => listener(envelope, receivedAt));
      return "applied";
    },

    onEnvelope(listener) {
      envelopeListeners.add(listener);
      return () => {
        envelopeListeners.delete(listener);
      };
    },

    ingestRaw(raw, receivedAt) {
      const result = parseEnvelope(raw);
      if (!result.ok) {
        rejected++;
        mark("connection");
        if (loggedRejections < MAX_LOGGED_REJECTIONS) {
          loggedRejections++;
          onReject(describeRejection(result));
        }
        return "rejected";
      }
      return store.ingest(result.envelope, receivedAt);
    },

    setSetup(next) {
      applySetup(next);
    },

    addRejected(count) {
      if (count <= 0) return;
      rejected += count;
      mark("connection");
    },

    reset() {
      applied = new Set();
      events.clear();
      tracking.clear();
      setup = null;
      nameOf = playerNamer(null);
      scoreboard = emptyScoreboard(matchId);
      counters = emptyCounters();
      arrivals = [];
      latestFrame = null;
      latestPanel = null;
      heavyPanel = null;
      selectedRow = null;
      rejected = 0;
      loggedRejections = 0;
      lastAt = null;
      // Stay frozen if paused: anything that arrives now is newer than the cutoff and stays hidden until resume
      if (paused) cutoff = order;
      mark("connection", "scoreboard", "players", "counters", "timeline", "latestFrame", "stats", "inspector");
      flushNow(true);
    },

    setConnection(next) {
      if (status === next) return;
      status = next;
      mark("connection");
    },

    setNotice(text, tone = "info") {
      if (paused) return;
      if (notice.text === text && notice.tone === tone) return;
      notice = { text, tone };
      mark("notice");
    },

    tick(at = now()) {
      if (status === "live" && lastAt !== null && at - lastAt > STALE_AFTER_MS) {
        status = "stale";
        if (!paused) notice = { text: notices.stale(Math.floor((at - lastAt) / 1000), scoreboard.phase), tone: "warning" };
        mark("connection", "notice");
      }
      // The "last 10 seconds" count falls as time passes even when nothing arrives
      if (arrivals.length > 0 || state.counters.recent > 0) mark("counters");
    },

    setFilter(next) {
      if (filter === next) return;
      filter = next;
      mark("controls", "timeline");
      flushNow(true);
    },

    setPaused(next) {
      if (paused === next) return;
      if (next) {
        flushNow(); // show everything received so far, then freeze
        cutoff = order;
        paused = true;
        notice = { text: notices.paused, tone: "warning" };
      } else {
        paused = false;
        cutoff = null;
        notice = { text: notices.resumed, tone: "info" };
        mark("counters", "timeline", "latestFrame", "stats", "inspector");
      }
      mark("controls", "notice");
      flushNow(true);
    },

    select(key) {
      const row = events.find((r) => r.key === key) ?? tracking.find((r) => r.key === key);
      if (!row) return;
      selectedRow = row;
      mark("inspector");
      flushNow(true);
    },

    followLatest() {
      if (selectedRow === null) return;
      selectedRow = null;
      mark("inspector");
      flushNow(true);
    },

    flush: () => flushNow(),

    destroy() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      listeners.clear();
      envelopeListeners.clear();
    },
  };

  return store;
}
