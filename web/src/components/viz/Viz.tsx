// Viz.tsx — The analysis visual kit
//
// Purpose: the pieces every analysis visual is built from, so they read as one system: the card (eyebrow, title,
//          headline numbers, filter chips, a comparison toggle), the near-black pitch, the zone grid on a blue ramp,
//          the Fewer → More legend, the stat strip and the side panel (a plain sentence, then a ranked list)
// Inputs:  props
// Outputs: React elements and SVG
// Spec:    web/specs/design-system.md §2.1, §4.1; web/specs/charts.md §1

import type { ReactNode } from "react";

/** Blue ramp step for a 0–1 share of the busiest cell (design-system.md §2.1). */
export const RAMP = ["var(--color-viz-1)", "var(--color-viz-2)", "var(--color-viz-3)", "var(--color-viz-4)", "var(--color-viz-5)"];
export function rampColour(v: number): string {
  if (!(v > 0)) return "transparent";
  return RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
}

export type Kpi = { value: string; label: string; focus?: boolean };

export function VizCard({
  eyebrow,
  title,
  subtitle,
  kpis = [],
  controls,
  children,
  aside,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  kpis?: Kpi[];
  controls?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="viz-card">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="ov-eyebrow text-ink/45">{eyebrow}</p>
          <h3 className="mt-1 text-[19px] font-extrabold leading-tight tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-ink/50">{subtitle}</p>}
        </div>
        {kpis.length > 0 && (
          <dl className="flex gap-5">
            {kpis.map((k) => (
              <div key={k.label} className="text-right">
                <dd className={`font-mono text-[20px] font-bold leading-none tabular ${k.focus ? "text-viz-focus" : ""}`}>{k.value}</dd>
                <dt className="mt-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink/45">{k.label}</dt>
              </div>
            ))}
          </dl>
        )}
      </header>
      {controls && <div className="mt-4 flex flex-wrap items-center justify-between gap-2">{controls}</div>}
      <div className={`mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 ${aside ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(240px,1fr)]" : ""}`}>
        <div className="min-w-0">{children}</div>
        {aside && <aside className="min-w-0">{aside}</aside>}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </section>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`viz-chip ${value === o.id ? "viz-chip-on" : ""}`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 font-mono text-[10.5px] opacity-60">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The two-way switch on the right of a card's controls (a team against the other, or against a baseline). */
export function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string; dot?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="viz-toggle" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={value === o.id ? "viz-toggle-on" : ""}>
          {o.dot && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: o.dot }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The stat strip above a pitch: a few large values with small labels, each cell sized by `share` when given. */
export function StatStrip({ cells }: { cells: { value: string; label: string; share?: number; focus?: boolean }[] }) {
  return (
    <div className="mb-2 flex gap-1.5">
      {cells.map((c) => (
        <div key={c.label} className="viz-cell min-w-[64px]" style={{ flex: `${Math.max(c.share ?? 1, 0.12)} 1 0` }}>
          <p className={`font-mono text-[15px] font-bold tabular ${c.focus ? "text-viz-focus" : ""}`}>{c.value}</p>
          <p className="mt-0.5 text-[11px] text-ink/50">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

/** A near-black pitch, attacking left → right, in metres (viewBox 105 × 68; `half` shows the attacking half). */
/** `footer` adds a strip under the pitch for a PitchLine's label, so the label never covers the bottom row's counts. */
export function VizPitch({
  children,
  half = false,
  label,
  attack = true,
  footer = false,
}: {
  children?: ReactNode;
  half?: boolean;
  label: string;
  attack?: boolean;
  footer?: boolean;
}) {
  const h = footer ? 74.5 : 68;
  return (
    <svg viewBox={half ? `50 0 55 ${h}` : `0 0 105 ${h}`} className={`viz-pitch block w-full ${half ? "mx-auto max-w-[440px]" : ""}`} role="img" aria-label={label}>
      <rect x="0" y="0" width="105" height="68" fill="var(--color-viz-bg)" />
      {children}
      <g fill="none" stroke="var(--color-viz-line)" strokeWidth="0.3" pointerEvents="none">
        <rect x="0.15" y="0.15" width="104.7" height="67.7" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="0" y="13.84" width="16.5" height="40.32" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect x="0" y="24.84" width="5.5" height="18.32" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" />
        <path d="M16.5 26.7 A9.15 9.15 0 0 1 16.5 41.3 M88.5 26.7 A9.15 9.15 0 0 0 88.5 41.3" />
      </g>
      {attack && (
        <text x="103" y={half ? 2.6 : 3.4} textAnchor="end" className="viz-svg-label" style={half ? { fontSize: "1.6px" } : undefined}>
          ATTACK →
        </text>
      )}
    </svg>
  );
}

/**
 * A grid of counts on the pitch: `grid[col][row]` with `cols` along the pitch (from the team's own goal) and `rows`
 * across it (from its left). Cells are coloured on the blue ramp by their share of the busiest cell.
 */
export function ZoneGrid({
  grid,
  showCounts = false,
  selected,
  onSelect,
  format = (v) => String(v),
  colour,
}: {
  grid: readonly (readonly number[])[];
  showCounts?: boolean;
  selected?: string | null;
  onSelect?: (key: string) => void;
  format?: (v: number) => string;
  colour?: (v: number, col: number, row: number) => string;
}) {
  const cols = grid.length;
  const rows = grid[0]?.length ?? 0;
  const cw = 105 / cols;
  const rh = 68 / rows;
  const max = Math.max(1e-9, ...grid.flat());
  return (
    <g>
      {grid.map((col, c) =>
        col.map((v, r) => {
          const key = `${c}:${r}`;
          const fill = colour ? colour(v, c, r) : rampColour(v / max);
          return (
            <g key={key} onClick={onSelect ? () => onSelect(key) : undefined} className={onSelect ? "cursor-pointer" : undefined}>
              <rect x={c * cw + 0.25} y={r * rh + 0.25} width={cw - 0.5} height={rh - 0.5} fill={fill} />
              {selected === key && <rect x={c * cw + 0.25} y={r * rh + 0.25} width={cw - 0.5} height={rh - 0.5} fill="none" stroke="#fff" strokeWidth="0.45" />}
              {showCounts && v > 0 && (
                <text x={c * cw + cw / 2} y={r * rh + rh / 2 + 1.3} textAnchor="middle" className="viz-svg-count">
                  {format(v)}
                </text>
              )}
            </g>
          );
        }),
      )}
    </g>
  );
}

/**
 * A dashed line across the pitch at `xM` metres (the press line, a defensive line), with a pill label in the strip
 * under the pitch: draw it inside a `VizPitch footer`.
 */
export function PitchLine({ xM, label }: { xM: number; label: string }) {
  return (
    <g pointerEvents="none">
      <line x1={xM} y1="0" x2={xM} y2="69.4" stroke="#fff" strokeOpacity="0.85" strokeWidth="0.35" strokeDasharray="1 0.9" />
      <rect x={xM - 10} y="69.4" width="20" height="4.6" rx="2.3" fill="#0a0a0a" stroke="var(--color-viz-line)" strokeWidth="0.25" />
      <text x={xM} y="72.55" textAnchor="middle" className="viz-svg-pill">
        {label}
      </text>
    </g>
  );
}

export function RampLegend({ low = "Fewer", high = "More" }: { low?: string; high?: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-ink/50">
      {low}
      <span className="inline-block h-[5px] w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} />
      {high}
    </div>
  );
}

/** The side panel: a plain-English sentence with the key phrase picked out, then a ranked list. */
export function InsightPanel({
  sentence,
  listTitle,
  items,
  note,
}: {
  sentence: ReactNode;
  listTitle?: string;
  items?: { label: string; value: string; dot?: string }[];
  note?: string;
}) {
  return (
    <div className="viz-panel">
      <p className="text-[14px] leading-relaxed text-ink/80">{sentence}</p>
      {items && items.length > 0 && (
        <>
          {listTitle && <p className="ov-eyebrow mt-5 text-ink/40">{listTitle}</p>}
          <ol className="mt-2 divide-y divide-ink/[0.06]">
            {items.map((it, i) => (
              <li key={`${i}-${it.label}`} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="w-4 font-mono text-[11px] text-ink/40">{i + 1}</span>
                {it.dot && <span className="h-2 w-2 rounded-full" style={{ background: it.dot }} />}
                <span className="min-w-0 flex-1 truncate font-semibold">{it.label}</span>
                <span className="font-mono font-bold tabular">{it.value}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {note && <p className="mt-4 text-[11.5px] leading-relaxed text-ink/40">{note}</p>}
    </div>
  );
}

/** The emphasised phrase inside an InsightPanel sentence. */
export const Em = ({ children }: { children: ReactNode }) => <strong className="font-bold text-viz-focus">{children}</strong>;

export function EmptyViz({ text }: { text: string }) {
  return <p className="flex min-h-[180px] items-center justify-center rounded-[10px] bg-viz-bg text-[13px] text-white/45">{text}</p>;
}
