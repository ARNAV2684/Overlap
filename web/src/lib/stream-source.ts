"use client";

// stream-source.ts — Where the screen's rows come from
//
// Purpose: tell row components whether they show a live stream or a replay from the match archive, so a replayed row
//          never claims to be "Live WebSocket"
// Inputs:  StreamSourceContext (set by ReplayProvider; the live screen leaves the default)
// Outputs: StreamSourceContext, useStreamSource()
// Spec:    web/specs/realtime.md §5.2 (rows say where they came from)

import { createContext, useContext } from "react";

export type StreamSource = "live" | "replay";

export const StreamSourceContext = createContext<StreamSource>("live");

export const useStreamSource = (): StreamSource => useContext(StreamSourceContext);
