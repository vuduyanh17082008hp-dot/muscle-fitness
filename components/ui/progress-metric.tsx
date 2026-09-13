import { cn } from "@/lib/utils";
import { AnimatedProgress } from "@/components/animation/animated-progress";

/**
 * ProgressMetric — the reusable "label + value + progress bar"
 * pattern that was previously re-implemented separately inside
 * MetricCard (dashboard) and PerformanceCard (ui). Both can adopt
 * this directly instead of hand-rolling their own bar markup.
 */
export function ProgressMetric({
  label,
  value,
  unit,
  percent,
  color = "var(--mf-sunset)",
  footnote,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  /** 0-100. */
  percent: number;
  color?: string;
  footnote?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-mf-text-muted">{label}</p>

      <div className="flex items-end gap-1.5">
        <span className="font-heading text-2xl tracking-[0.02em] text-white sm:text-3xl">{value}</span>
        {unit ? <span className="pb-0.5 text-xs font-semibold text-mf-text-muted">{unit}</span> : null}
      </div>

      <AnimatedProgress percent={percent} color={color} />

      {footnote ? <p className="text-[11px] text-mf-text-muted">{footnote}</p> : null}
    </div>
  );
}
