"use client";

// ReplayProvider.tsx — Replay session
//
// Purpose: own one replay: create its store and player, start the player on mount and stop it on unmount, and give
//          the screen the store (the live screen's panels read it unchanged), the player and the "replay" row source
// Inputs:  matchId (SYN-NNNN), children, client? (for tests; defaults to this app's replay route)
// Outputs: ReplayProvider; useReplayPlayer() and useReplayState() for the replay controls, header and intro
// Spec:    web/specs/realtime.md §5.2. Plan: plans/active/PLAN_web_replay.md
//
// Like MatchStreamProvider: a different matchId gets a fresh store and player (the inner component is keyed by
// match). Creating them has no side effects; start() runs in the effect, and StrictMode's second run is harmless
// because start() begins a new generation and stop() ends the old one.

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { replayClient, type ReplayClient } from "@/lib/replay-client";
import { createReplayPlayer, replayNotices, type ReplayPlayer, type ReplayState } from "@/lib/replay-player";
import { createMatchStore, type MatchStore } from "@/lib/store";
import { MatchStoreContext } from "@/lib/store-hooks";
import { StreamSourceContext } from "@/lib/stream-source";

const ReplayPlayerContext = createContext<ReplayPlayer | null>(null);

/** The player, for its actions. Throws outside a ReplayProvider. */
export function useReplayPlayer(): ReplayPlayer {
  const player = useContext(ReplayPlayerContext);
  if (!player) throw new Error("useReplayPlayer must be used inside a ReplayProvider");
  return player;
}

/** The player's state: status, speed, playhead, manifest. */
export function useReplayState(): ReplayState {
  const player = useReplayPlayer();
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

type ReplayProviderProps = {
  matchId: string;
  children: ReactNode;
  client?: ReplayClient;
};

export function ReplayProvider({ matchId, children, client }: ReplayProviderProps) {
  return (
    <ReplaySession key={matchId} matchId={matchId} client={client}>
      {children}
    </ReplaySession>
  );
}

/** Exported only so tests can give it a player of their own. */
export function ReplayContexts({ store, player, children }: { store: MatchStore; player: ReplayPlayer; children: ReactNode }) {
  return (
    <MatchStoreContext.Provider value={store}>
      <ReplayPlayerContext.Provider value={player}>
        <StreamSourceContext.Provider value="replay">{children}</StreamSourceContext.Provider>
      </ReplayPlayerContext.Provider>
    </MatchStoreContext.Provider>
  );
}

function ReplaySession({ matchId, client, children }: ReplayProviderProps) {
  const [store] = useState(() => {
    // The first render (and the server's) says what the player will say when it starts, as the fallback does
    const created = createMatchStore(matchId);
    created.setNotice(replayNotices.loading);
    created.flush();
    return created;
  });
  const [player] = useState(() => createReplayPlayer(store, client ?? replayClient, matchId));

  useEffect(() => {
    player.start();
    return () => {
      player.stop();
      store.destroy();
    };
  }, [player, store]);

  return (
    <ReplayContexts store={store} player={player}>
      {children}
    </ReplayContexts>
  );
}
