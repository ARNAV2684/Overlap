// page.tsx — Dev kitchen sink (development only)
//
// Purpose: show every colour token, text class and UI primitive in one place for review and screenshots
// Inputs:  none
// Outputs: a page in development; a 404 in production
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardChip } from "@/components/ui/CardChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Kbd } from "@/components/ui/Kbd";
import { LiveDot } from "@/components/ui/LiveDot";
import { Logo } from "@/components/ui/Logo";
import { Panel } from "@/components/ui/Panel";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge, type ConnectionStatus } from "@/components/ui/StatusBadge";
import { Tag } from "@/components/ui/Tag";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { SegmentedDemo } from "./SegmentedDemo";

const statuses: ConnectionStatus[] = ["connecting", "live", "stale", "reconnecting", "finished"];

// Class names are written out in full so Tailwind can see them.
const greys = [
  ["50", "bg-greys-50"],
  ["100", "bg-greys-100"],
  ["200", "bg-greys-200"],
  ["300", "bg-greys-300"],
  ["400", "bg-greys-400"],
  ["500", "bg-greys-500"],
  ["600", "bg-greys-600"],
  ["700", "bg-greys-700"],
  ["800", "bg-greys-800"],
  ["900", "bg-greys-900"],
  ["950", "bg-greys-950"],
] as const;

const oranges = [
  ["50", "bg-orange-50"],
  ["100", "bg-orange-100"],
  ["200", "bg-orange-200"],
  ["300", "bg-orange-300"],
  ["400", "bg-orange-400"],
  ["500", "bg-orange-500"],
  ["600", "bg-orange-600"],
  ["700", "bg-orange-700"],
  ["800", "bg-orange-800"],
  ["900", "bg-orange-900"],
  ["950", "bg-orange-950"],
] as const;

const blues = [
  ["50", "bg-blue-50"],
  ["100", "bg-blue-100"],
  ["200", "bg-blue-200"],
  ["300", "bg-blue-300"],
  ["400", "bg-blue-400"],
  ["500", "bg-blue-500"],
  ["600", "bg-blue-600"],
  ["700", "bg-blue-700"],
  ["800", "bg-blue-800"],
  ["900", "bg-blue-900"],
  ["950", "bg-blue-950"],
] as const;

const semantic = [
  ["bg", "bg-bg"],
  ["surface", "bg-surface"],
  ["surface-raised", "bg-surface-raised"],
  ["line", "bg-line"],
  ["line-strong", "bg-line-strong"],
  ["ink", "bg-ink"],
  ["ink-muted", "bg-ink-muted"],
  ["primary", "bg-primary"],
  ["primary-hover", "bg-primary-hover"],
  ["accent-text", "bg-accent-text"],
  ["secondary", "bg-secondary"],
  ["secondary-text", "bg-secondary-text"],
  ["secondary-soft", "bg-secondary-soft"],
  ["team-home", "bg-team-home"],
  ["team-away", "bg-team-away"],
  ["card-yellow", "bg-card-yellow"],
  ["card-yellow-soft", "bg-card-yellow-soft"],
  ["card-red", "bg-card-red"],
  ["card-red-soft", "bg-card-red-soft"],
  ["card-red-text", "bg-card-red-text"],
  ["pitch-surface", "bg-pitch-surface"],
  ["pitch-stripe", "bg-pitch-stripe"],
  ["pitch-line", "bg-pitch-line"],
  ["pitch-marker-edge", "bg-pitch-marker-edge"],
] as const;

const textClasses = [
  ["text-display", "text-display", "32 px"],
  ["text-score", "text-score numeric", "44 px"],
  ["text-metric", "text-metric numeric", "28 px"],
  ["text-title", "text-title", "22 px"],
  ["text-heading", "text-heading", "15 px"],
  ["text-body", "text-body", "14 px"],
  ["text-body-sm", "text-body-sm", "13 px"],
  ["text-caption", "text-caption", "12 px"],
  ["text-eyebrow", "text-eyebrow uppercase", "11 px"],
  ["text-label", "text-label", "11 px"],
  ["text-clock", "text-clock font-mono numeric", "22 px"],
  ["text-code", "text-code font-mono", "12 px"],
] as const;

function Swatches({ title, items }: { title: string; items: readonly (readonly [string, string])[] }) {
  return (
    <div>
      <Eyebrow as="h3" className="mb-3">
        {title}
      </Eyebrow>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3">
        {items.map(([name, cls]) => (
          <li key={name}>
            <div className={`h-12 rounded-control border border-line-strong ${cls}`} />
            <p className="mt-1.5 text-label text-ink-muted">{name}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="border-b border-line pb-2 text-title text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-8">
      <header className="space-y-2">
        <Logo />
        <h1 className="text-display text-ink">UI kitchen sink</h1>
        <p className="text-caption text-ink-muted">
          Development only. Shows every token and primitive; this page returns 404 in production.
        </p>
      </header>

      <Section title="Colour tokens">
        <Swatches title="Greys" items={greys} />
        <Swatches title="Orange (primary)" items={oranges} />
        <Swatches title="Blue (secondary)" items={blues} />
        <Swatches title="Semantic, card and pitch colours" items={semantic} />
      </Section>

      <Section title="Text classes">
        <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
          {textClasses.map(([name, cls, size]) => (
            <li key={name} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3">
              <span className={`${cls} text-ink`}>
                {name === "text-score" ? "1 : 0" : name === "text-clock" ? "62:14" : "Watch the data move"}
              </span>
              <span className="text-code text-ink-muted">
                {name} · {size}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Radii">
        <div className="flex flex-wrap gap-4">
          {[
            ["rounded-card", "rounded-card"],
            ["rounded-panel", "rounded-panel"],
            ["rounded-control", "rounded-control"],
            ["rounded-pill", "rounded-pill"],
          ].map(([name, cls]) => (
            <div key={name} className={`flex h-16 w-28 items-center justify-center border border-line-strong bg-surface text-label text-ink-muted ${cls}`}>
              {name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Logo, Eyebrow, LiveDot, Tag">
        <div className="flex flex-wrap items-center gap-8">
          <Logo size="sm" />
          <Logo />
          <Logo showWordmark={false} />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <Eyebrow>Local match observatory</Eyebrow>
          <Eyebrow as="span" className="text-accent-text">
            Live
          </Eyebrow>
          <span className="inline-flex items-center gap-2 text-body text-ink">
            <LiveDot /> still dot
          </span>
          <span className="inline-flex items-center gap-2 text-body text-ink">
            <LiveDot pulsing /> pulsing dot
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tag>NBR</Tag>
          <Tag tone="home">NBR</Tag>
          <Tag tone="away">HBA</Tag>
        </div>
      </Section>

      <Section title="Panel, PanelHeader, Card">
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel aria-labelledby="demo-panel-title">
            <PanelHeader
              id="demo-panel-title"
              title="Event timeline"
              titleAdornment={<LiveDot pulsing />}
              subtitle="Newest received first · select a row to inspect its data"
            />
            <div className="p-5 text-body text-ink">Panel body</div>
          </Panel>
          <Panel>
            <PanelHeader title="Live positions" subtitle="Latest received tracking frame" action={<Tag>62:14.200</Tag>} />
            <EmptyState title="Waiting for your first message…" hint="Start the mock stream to see data here." />
          </Panel>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <Eyebrow>Messages received</Eyebrow>
            <p className="mt-2 text-metric numeric text-ink">1,284</p>
            <p className="text-caption text-ink-muted">Since this connection</p>
          </Card>
          <Card>
            <Eyebrow>Live match events</Eyebrow>
            <p className="mt-2 text-metric numeric text-ink">456</p>
            <p className="text-caption text-ink-muted">Passes, shots, fouls and more</p>
          </Card>
        </div>
      </Section>

      <Section title="Button">
        <p className="text-caption text-ink-muted">
          Hover and focus are live: hover a button, or press <Kbd>Tab</Kbd> to see the focus ring.
        </p>
        {(["primary", "secondary", "ghost"] as const).map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            <span className="w-20 text-code text-ink-muted">{variant}</span>
            <Button variant={variant}>Default</Button>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading>
              Loading
            </Button>
          </div>
        ))}
      </Section>

      <Section title="SegmentedControl and a toggle button">
        <p className="text-caption text-ink-muted">
          Tab into a group, then use <Kbd>←</Kbd> <Kbd>→</Kbd> (or <Kbd>↑</Kbd> <Kbd>↓</Kbd>), <Kbd>Home</Kbd> and{" "}
          <Kbd>End</Kbd>. Only the selected option is a Tab stop.
        </p>
        <SegmentedDemo />
      </Section>

      <Section title="StatusBadge">
        <div className="flex flex-wrap items-center gap-3">
          {statuses.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title="CardChip and Kbd">
        <div className="flex flex-wrap items-center gap-4">
          <CardChip card="yellow" />
          <CardChip card="second_yellow" />
          <CardChip card="red" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
          <Kbd>Tab</Kbd> <Kbd>Enter</Kbd> <Kbd>Space</Kbd> <Kbd>Esc</Kbd>
        </div>
      </Section>

      <Section title="Skeleton, VisuallyHidden">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-pill" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <p className="text-body text-ink">
          Goal
          <VisuallyHidden> (this text is only read by screen readers)</VisuallyHidden>
        </p>
      </Section>
    </main>
  );
}
