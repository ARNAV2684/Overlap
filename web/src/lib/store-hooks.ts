"use client";

// store-hooks.ts — Store hooks
//
// Purpose: let components read one slice of the match store each, so a component re-renders only when its own data
//          changes. Also holds the context the provider (components/live/MatchStreamProvider) fills
// Inputs:  the store from the nearest MatchStoreContext
// Outputs: useMatchStore(), useConnection(), useScoreboard(), useCounters(), useTimelineRows(), useLatestFrame(),
//          useSelectedRow(), useStats(), useNotice(), useControls(), usePlayers()
// Spec:    web/specs/realtime.md §2
//
// Every slice keeps the same object until its content changes (see store.ts), so the selectors below return
// stable references and useSyncExternalStore does not loop or re-render needlessly.

import { createContext, useContext, useSyncExternalStore } from "react";
import type {
  Controls,
  ConnectionState,
  Counters,
  Inspector,
  MatchStore,
  Notice,
  PlayerInfo,
  Scoreboard,
  Stats,
  StoreState,
  Timeline,
} from "@/lib/store";
import type { TrackingFrame } from "@/lib/contracts";

export const MatchStoreContext = createContext<MatchStore | null>(null);

/** The store, for actions such as setPaused() and setFilter(). Throws outside a MatchStreamProvider. */
export function useMatchStore(): MatchStore {
  const store = useContext(MatchStoreContext);
  if (!store) throw new Error("useMatchStore must be used inside a MatchStreamProvider");
  return store;
}

/** Subscribes to one slice. `select` must return the slice itself (not a new object), or it re-renders every time. */
export function useStoreSelector<T>(select: (state: StoreState) => T): T {
  const store = useMatchStore();
  const read = () => select(store.getState());
  // The server renders the initial, empty state; the browser then takes over with the live one
  return useSyncExternalStore(store.subscribe, read, read);
}

// ---- live slices: always up to date, even while the feed is paused
export const useConnection = (): ConnectionState => useStoreSelector((s) => s.connection);
export const useScoreboard = (): Scoreboard => useStoreSelector((s) => s.scoreboard);
export const useControls = (): Controls => useStoreSelector((s) => s.controls);
export const useNotice = (): Notice => useStoreSelector((s) => s.notice);
export const usePlayers = (): ReadonlyMap<string, PlayerInfo> => useStoreSelector((s) => s.players);

// ---- display slices: frozen while the feed is paused, caught up on resume
export const useCounters = (): Counters => useStoreSelector((s) => s.counters);
export const useTimelineRows = (): Timeline => useStoreSelector((s) => s.timeline);
export const useLatestFrame = (): TrackingFrame | null => useStoreSelector((s) => s.latestFrame);
export const useSelectedRow = (): Inspector => useStoreSelector((s) => s.inspector);
export const useStats = (): Stats => useStoreSelector((s) => s.stats);
