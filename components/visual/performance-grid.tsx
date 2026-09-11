import { MetricReveal } from "@/components/visual/metric-reveal";

export type PerformanceGridStat = {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
};

type PerformanceGridProps = {
  stats: PerformanceGridStat[];
  className?: string;
};

/**
 * Small reusable stat strip for page headers — the "data" half of
 * the dashboard formula (data first, visual second). Numbers count
 * up once on view via MetricReveal.
 */
export function PerformanceGrid({ stats, className = "" }: PerformanceGridProps) {
  if (stats.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${className}`}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            {stat.label}
          </p>
          <p className="mt-1 text-xl font-black text-white">
            <MetricReveal value={stat.value} suffix={stat.suffix} decimals={stat.decimals ?? 0} />
          </p>
        </div>
      ))}
    </div>
  );
}
