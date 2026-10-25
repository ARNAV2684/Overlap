"use client";

// MatchExperience.tsx — Everything the match screen derives from the stream
//
// Purpose: inside a MatchStreamProvider (live) or ReplayProvider (replay), keep the smooth motion, the match memory,
//          the story director's current story and the viewer's insight feed, and share them with the screen
// Inputs:  the match store from context; the viewer's preferences (a favourite club steers the team stories)
// Outputs: MatchExperienceProvider; useExperience(), useFeed()
// Spec:    web/specs/screens.md §2; web/specs/pitch.md §3–§4; web/specs/realtime.md §4
//
// The 3D stage reads motion and memory directly every animation frame; React only sees the story (twice a second)
// and the feed (when a card arrives or changes).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createBallTrack, type BallTrack } from "@/lib/live/ball-flight";
import { createMatchMemory, type MatchMemory } from "@/lib/live/match-memory";
import { createMotion, type Motion, type MotionSample } from "@/lib/live/motion";
import { createGroupSocket, createInsightFeed, parseInsight, type FeedState, type InsightFeed } from "@/lib/live/insights";
import { directStory, type Story, type StoryKind } from "@/lib/live/story";
import { audienceGroup, effectiveMode, type Mode } from "@/lib/preferences";
import type { Side } from "@/lib/coordinates";
import { useMatchStore, useScoreboard } from "@/lib/store-hooks";
import { useStreamSource, type StreamSource } from "@/lib/stream-source";
import { usePreferences } from "@/providers/PreferencesProvider";

export type View = "broadcast" | "close" | "tactical";

type Experience = {
  matchId: string;
  source: StreamSource;
  motion: Motion;
  /** The ball's tracked path in 3D, smoothed for the pitch (fed the same frames as the motion). */
  ballTrack: BallTrack;
  memory: MatchMemory;
  feed: InsightFeed;
  story: Story | null;
  pinned: StoryKind | null;
  setPinned(kind: StoryKind | null): void;
  view: View;
  setView(view: View): void;
  /** Analyse: the story director's overlays on the pitch. Watch: the clean pitch. */
  analysis: boolean;
  setAnalysis(on: boolean): void;
  /** Marks, labels and the ticker for set pieces and stoppages on the pitch (goals and cards always show). */
  showEvents: boolean;
  setShowEvents(on: boolean): void;
  mode: Mode;
  /**
   * The viewer's favourite club, when it plays in this match: the pitch's team stories follow it and the per-team
   * analysis shows it only. Null without one.
   */
  myClub: Side | null;
  /** The latest interpolated sample, refreshed a few times a second for panels (the stage samples on its own). */
  sampleRef: React.RefObject<MotionSample | null>;
  /** Bumped when the memory changes enough for panels to redraw (about once a second). */
  tick: number;
  /** The playhead's match ms, refreshed twice a second, for what panels may show (replays hide the future). */
  playheadMs: number;
};

const ExperienceContext = createContext<Experience | null>(null);

export function useExperience(): Experience {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used inside a MatchExperienceProvider");
  return value;
}

export function useFeed(): FeedState {
  const { feed } = useExperience();
  return useSyncExternalStore(feed.subscribe, feed.getState, feed.getState);
}

/** A new story replaces the current one only after it has held for this long (wall ms), unless it is a goal story. */
const STORY_HOLD_MS = 4500;

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export function MatchExperienceProvider({ children }: { children: ReactNode }) {
  const store = useMatchStore();
  const source = useStreamSource();
  const { setup } = useScoreboard();
  const [prefs] = usePreferences();
  const [motion] = useState(createMotion);
  const [ballTrack] = useState(createBallTrack);
  const [memory] = useState(createMatchMemory);
  const sampleRef = useRef<MotionSample | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [pinned, setPinned] = useState<StoryKind | null>(null);
  const [view, setView] = useState<View>("broadcast");
  const [showEvents, setShowEvents] = useState(true);
  const [analysis, setAnalysis] = useState(true);
  const [tick, setTick] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);

  // Every envelope feeds the memory; frames feed the motion
  useEffect(() => {
    return store.onEnvelope((envelope) => {
      memory.ingest(envelope);
      if (envelope.kind === "positions") {
        const now = performance.now();
        for (const frame of envelope.data.frames) {
          motion.push(frame, now);
          ballTrack.push(frame);
        }
      }
    });
  }, [store, memory, motion, ballTrack]);

  useEffect(() => {
    if (setup) memory.setSetup(setup);
  }, [setup, memory]);

  const myClub: Side | null =
    setup && prefs.club ? (prefs.club === setup.teams.home.team_id ? "home" : prefs.club === setup.teams.away.team_id ? "away" : null) : null;

  // Twice a second: refresh the sample panels read, and re-direct the story with hysteresis
  const candidate = useRef<{ kind: StoryKind; since: number } | null>(null);
  // The team of a connection card on screen now (set from the feed below): its connections become the story
  const connectionsFor = useRef<Side | null>(null);
  const shownAt = useRef(0);
  useEffect(() => {
    let lastVersion = -1;
    const id = setInterval(() => {
      const sample = motion.sample(performance.now());
      sampleRef.current = sample;
      if (memory.version() !== lastVersion) {
        lastVersion = memory.version();
        setTick((t) => t + 1);
      }
      if (!sample) return;
      setPlayheadMs(Math.floor(sample.matchMs / 1000) * 1000);
      const next = directStory(memory, sample, pinned, myClub, connectionsFor.current);
      const now = performance.now();
      setStory((current) => {
        if (!current || pinned || current.kind === next.kind) {
          candidate.current = null;
          if (!current || current.kind !== next.kind) shownAt.current = now;
          return next;
        }
        // A different story: switch at once for a goal, otherwise when it has held and the current one has had its time
        if ((next.kind === "protect" || next.kind === "connections") && current.kind !== next.kind) {
          shownAt.current = now;
          candidate.current = null;
          return next;
        }
        if (candidate.current?.kind !== next.kind) candidate.current = { kind: next.kind, since: now };
        if (now - candidate.current.since >= 1500 && now - shownAt.current >= STORY_HOLD_MS) {
          shownAt.current = now;
          candidate.current = null;
          return next;
        }
        return current;
      });
    }, 500);
    return () => clearInterval(id);
  }, [motion, memory, pinned, myClub]);

  // The viewer's audience: a fresh feed per group
  const teamIds = setup ? [setup.teams.home.team_id, setup.teams.away.team_id] : [];
  const playerIds = useMemo(
    () => new Set(setup ? [setup.teams.home, setup.teams.away].flatMap((t) => [...t.lineup, ...t.bench].map((p) => p.player_id)) : []),
    [setup],
  );
  const mode = effectiveMode(prefs, teamIds, playerIds);
  const group = audienceGroup(store.matchId, mode, prefs);
  const feed = useMemo(() => {
    void group; // a new group starts a new feed
    return createInsightFeed();
  }, [group]);

  // A connection card on screen draws its team's connections on the pitch while it is up
  useEffect(() => {
    const follow = () => {
      const card = feed.getState().current;
      const teamId = card?.visual?.component === "connections" ? card.visual.highlight?.team_id : undefined;
      connectionsFor.current = !teamId || !setup ? null : teamId === setup.teams.home.team_id ? "home" : teamId === setup.teams.away.team_id ? "away" : null;
    };
    follow();
    return feed.subscribe(follow);
  }, [feed, setup]);

  useEffect(() => {
    const controller = new AbortController();
    const add = (raw: unknown) => {
      const insight = parseInsight(raw, store.matchId);
      if (insight) feed.add(insight);
    };
    const addAll = (body: unknown) => {
      const envelopes = (body as { envelopes?: unknown[] } | null)?.envelopes;
      if (Array.isArray(envelopes)) envelopes.forEach(add);
    };

    if (source === "replay") {
      // Replays show the cards this audience received live, each at its own moment
      fetchJson(`/api/match/${store.matchId}/insights/history?group=${encodeURIComponent(group)}`, controller.signal)
        .then(addAll)
        .catch(() => {});
      return () => controller.abort();
    }

    const query = new URLSearchParams({ mode, lang: prefs.lang });
    if (mode === "club" && prefs.club) query.set("club", prefs.club);
    if (mode === "player" && prefs.player) query.set("player", prefs.player);
    const socket = createGroupSocket({
      groups: [group],
      onMessage: add,
      onJoined: () => {
        fetchJson(`/api/match/${store.matchId}/insights/snapshot?${query}`, controller.signal).then(addAll).catch(() => {});
      },
    });
    socket.start();
    return () => {
      controller.abort();
      socket.stop();
    };
  }, [feed, group, mode, prefs.lang, prefs.club, prefs.player, source, store.matchId]);

  // Schedule cards against the playhead
  useEffect(() => {
    const id = setInterval(() => {
      const s = sampleRef.current;
      if (s) feed.tick(s.matchMs, s.period, performance.now());
    }, 250);
    return () => clearInterval(id);
  }, [feed]);

  const value = useMemo<Experience>(
    () => ({
      matchId: store.matchId,
      source,
      motion,
      ballTrack,
      memory,
      feed,
      story,
      pinned,
      setPinned,
      view,
      setView,
      showEvents,
      setShowEvents,
      analysis,
      setAnalysis,
      mode,
      myClub,
      sampleRef,
      tick,
      playheadMs,
    }),
    [store.matchId, source, motion, ballTrack, memory, feed, story, pinned, view, showEvents, analysis, mode, myClub, tick, playheadMs],
  );
  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}
