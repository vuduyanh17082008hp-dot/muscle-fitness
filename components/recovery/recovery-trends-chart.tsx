"use client";

import { useMemo, useState } from "react";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RecoveryTrendPoint } from "@/lib/recovery/load-recovery-context";
import { cn } from "@/lib/utils";

type MetricKey = "score" | "sleepHours" | "stress" | "fatigue" | "soreness" | "readiness";

const METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: "score", label: "Recovery Score", color: "#fbbf24" },
  { key: "sleepHours", label: "Sleep", color: "#60a5fa" },
  { key: "stress", label: "Stress", color: "#f87171" },
  { key: "fatigue", label: "Fatigue", color: "#fb923c" },
  { key: "soreness", label: "Soreness", color: "#c084fc" },
  { key: "readiness", label: "Readiness", color: "#34d399" },
];

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function RecoveryTrendsChart({
  data,
}: {
  data: RecoveryTrendPoint[];
}) {
  const [range, setRange] = useState<7 | 30>(7);
  const [metric, setMetric] = useState<MetricKey>("score");

  const points = useMemo(() => {
    const sliced = data.slice(-range);
    return sliced.map((point) => ({
      ...point,
      label: formatShortDate(point.date),
    }));
  }, [data, range]);

  const activeMetric = METRICS.find((item) => item.key === metric)!;
  const hasData = points.some((point) => point[metric] !== null);

  return (
    <article className="rounded-3xl border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-text-muted">
            Recovery Trends
          </p>
          <h2 className="mt-1 text-xl font-black text-mf-glass-text">
            Last {range} days
          </h2>
        </div>

        <div className="flex gap-2">
          {([7, 30] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-bold transition",
                range === option
                  ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand"
                  : "border-mf-glass-border text-mf-glass-text-muted hover:border-mf-glass-border-strong",
              )}
            >
              {option}D
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {METRICS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setMetric(item.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11px] font-bold transition",
              metric === item.key
                ? "border-mf-glass-border-strong bg-white/10 text-mf-glass-text"
                : "border-mf-glass-border text-mf-glass-text-muted hover:border-mf-glass-border-strong",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <p className="mt-8 text-sm leading-6 text-mf-glass-text-muted">
          Not enough check-ins yet to show a {activeMetric.label.toLowerCase()}{" "}
          trend. Log a daily check-in to start building this history.
        </p>
      ) : (
        <div className="mt-6 h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 12, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#71717a", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#71717a", fontSize: 11 }}
                width={36}
                domain={metric === "score" ? [0, 100] : undefined}
              />
              <Tooltip
                cursor={{ stroke: "rgba(251,191,36,0.25)", strokeWidth: 1 }}
                contentStyle={{
                  background: "#0b0d10",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  color: "#ffffff",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
              />
              <Line
                type="monotone"
                dataKey={metric}
                stroke={activeMetric.color}
                strokeWidth={3}
                connectNulls
                dot={{ fill: activeMetric.color, stroke: "#111318", strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
