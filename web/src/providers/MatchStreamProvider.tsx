"use client";

// MatchStreamProvider.tsx — Live match provider
//
// Purpose: owns one match's live data: creates its store, connects the socket to it for as long as the component is
//          mounted, and hands the store to everything below through context (read it with the hooks in
//          src/lib/store-hooks.ts)
// Inputs:  matchId, children
// Outputs: a context provider. Renders nothing of its own
// Spec:    web/specs/realtime.md §1. web/IMPLEMENTATION_PLAN.md Phase 5.3
//
// Mounting connects, unmounting disconnects (the socket closes, every timer stops). A different matchId gets a fresh
// store and a fresh connection, because the outer component keys the inner one by match. Creating a store has no side
// effects, so it is fine that React may create it twice in development. In development React also starts, stops and
// starts the effect again on mount; the socket is built for that (see src/lib/socket.ts).

import { useEffect, useState, type ReactNode } from "react";
import { createMatchSocket } from "@/lib/socket";
import { createMatchStore } from "@/lib/store";
import { MatchStoreContext } from "@/lib/store-hooks";

type MatchStreamProviderProps = {
  matchId: string;
  children: ReactNode;
};

export function MatchStreamProvider({ matchId, children }: MatchStreamProviderProps) {
  // key: a new match is a new store and a new connection, never a reused one
  return (
    <ConnectedMatch key={matchId} matchId={matchId}>
      {children}
    </ConnectedMatch>
  );
}

function ConnectedMatch({ matchId, children }: MatchStreamProviderProps) {
  const [store] = useState(() => createMatchStore(matchId));

  useEffect(() => {
    const socket = createMatchSocket(store);
    socket.start();
    return () => {
      socket.stop();
      store.destroy();
    };
  }, [store]);

  return <MatchStoreContext.Provider value={store}>{children}</MatchStoreContext.Provider>;
}
