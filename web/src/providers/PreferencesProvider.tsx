"use client";

// PreferencesProvider.tsx — Viewer preferences
//
// Purpose: hold the viewer's mode, language, favourite club and followed player for the whole app, and remember
//          them in this browser
// Inputs:  children
// Outputs: PreferencesProvider; usePreferences() → [preferences, update]
// Spec:    web/specs/screens.md §3
//
// A tiny external store: the server and the first client render use the defaults, then the saved choice is read
// once. localStorage is only a convenience: when it is blocked the app simply starts from the defaults.

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from "@/lib/preferences";

const KEY = "ov-prefs";

let current: Preferences | null = null;
const listeners = new Set<() => void>();

function read(): Preferences {
  if (current) return current;
  try {
    const saved = localStorage.getItem(KEY);
    current = saved ? parsePreferences(JSON.parse(saved)) : DEFAULT_PREFERENCES;
  } catch {
    current = DEFAULT_PREFERENCES;
  }
  return current;
}

function write(next: Preferences) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // not saved; the choice still applies to this page
  }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

type Update = (change: Partial<Preferences>) => void;
const PreferencesContext = createContext<readonly [Preferences, Update]>([DEFAULT_PREFERENCES, () => {}]);

export function usePreferences(): readonly [Preferences, Update] {
  return useContext(PreferencesContext);
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const prefs = useSyncExternalStore(subscribe, read, () => DEFAULT_PREFERENCES);
  const update = useCallback<Update>((change) => write(parsePreferences({ ...read(), ...change })), []);
  const value = useMemo(() => [prefs, update] as const, [prefs, update]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
