// MetricCard.tsx — One counter
//
// Purpose: a label, a large value and a short hint, as one term and its descriptions inside the MetricsGrid's <dl>
// Inputs:  label, value, hint, className
// Outputs: a div holding <dt> and <dd> (must sit inside a <dl>)
// Spec:    web/specs/screens.md (counters). web/IMPLEMENTATION_PLAN.md Phase 7
//
// Not a live region: the values change several times a second and would flood a screen reader.

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  className?: string;
};

export function MetricCard({ label, value, hint, className }: MetricCardProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <dt className="text-eyebrow uppercase text-ink-muted">{label}</dt>
      <dd className="text-metric numeric break-words">{value}</dd>
      <dd className="text-caption text-ink-muted">{hint}</dd>
    </Card>
  );
}
