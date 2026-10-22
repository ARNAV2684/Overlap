"use client";

// TopNav.tsx — Top navigation
//
// Purpose: the wordmark, the page links and the light/dark switch, on every page
// Inputs:  none (reads the path)
// Outputs: UI
// Spec:    web/specs/screens.md §1

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";

const LINKS = [
  { href: "/", label: "Live" },
  { href: "/matches", label: "Matches" },
  { href: "/how-it-works", label: "How it works" },
] as const;

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      <span className="text-accent">over</span>
      <span className="text-ink/90">lap</span>
    </span>
  );
}

// The theme lives on <html class="dark">; this reads it as an external store
const subscribeTheme = (listener: () => void) => {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const isDark = () => document.documentElement.classList.contains("dark");

function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => true);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ov-theme", next ? "dark" : "light");
    } catch {
      // not remembered; the switch still applies now
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-9 w-9 place-items-center rounded-full border border-ink/10 bg-ink/[0.03] text-ink/60 transition-colors hover:text-ink"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** The path is request data, so it is read inside Suspense; the fallback is the same bar with nothing marked. */
export function TopNav() {
  return (
    <Suspense fallback={<NavBar path={null} />}>
      <NavWithPath />
    </Suspense>
  );
}

function NavWithPath() {
  return <NavBar path={usePathname()} />;
}

function NavBar({ path }: { path: string | null }) {
  const active = (href: string) =>
    path !== null && (href === "/" ? path === "/" || path.startsWith("/match/") : path.startsWith(href));
  return (
    <header className="sticky top-0 z-30 border-b border-ink/[0.06] bg-canvas/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:gap-6 sm:px-6" aria-label="Main">
        <Link href="/" className="text-[19px] sm:text-[21px]" aria-label="Overlap home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3 sm:gap-5">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active(link.href) ? "page" : undefined}
              className={`whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-[1px] transition-colors sm:text-[11px] sm:tracking-[1.4px] ${
                active(link.href) ? "text-ink" : "text-ink/40 hover:text-ink/75"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
