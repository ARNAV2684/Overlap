"use client";

// AppHeader.tsx — Page header
//
// Purpose: the top bar: the Overlap logo, "/ Live stream", and the live connection badge
// Inputs:  AppHeader: the connection status from the nearest MatchStreamProvider (useConnection())
//          AppHeaderView: status, statusLabel?, section? (for pages and previews without a store, and the replay screen)
// Outputs: a <header> (the page's banner landmark when it sits outside <main>)
// Spec:    web/specs/screens.md (live match screen layout). web/IMPLEMENTATION_PLAN.md Phase 6
//
// The badge is role="status" (StatusBadge), so connection changes are announced politely.

import { Logo } from "@/components/ui/Logo";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { ConnectionStatus } from "@/lib/store";
import { useConnection } from "@/lib/store-hooks";

type AppHeaderViewProps = {
  status: ConnectionStatus;
  /** Replaces the badge's default word. */
  statusLabel?: string;
  /** The page's name after the logo (default "Live stream"; "Replay" on the replay screen). */
  section?: string;
  className?: string;
};

export function AppHeaderView({ status, statusLabel, section = "Live stream", className }: AppHeaderViewProps) {
  return (
    <header
      className={cn(
        "flex h-[70px] shrink-0 items-center justify-between gap-3 border-b border-line min-[680px]:h-22",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Smaller mark on phones so the brand and the badge fit side by side at 375 px */}
        <Logo size="sm" className="min-[680px]:hidden" />
        <Logo className="hidden min-[680px]:inline-flex" />
        <span className="hidden items-center gap-3 text-body text-ink-muted sm:inline-flex">
          <span aria-hidden="true" className="font-light text-line-strong">
            /
          </span>
          {section}
        </span>
      </div>
      <StatusBadge status={status} label={statusLabel} className="shrink-0" />
    </header>
  );
}

/** The header wired to the live connection. Must sit inside a MatchStreamProvider. */
export function AppHeader({ className }: { className?: string }) {
  const { status } = useConnection();
  return <AppHeaderView status={status} className={className} />;
}
