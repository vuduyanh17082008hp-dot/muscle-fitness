import { Gauge } from "lucide-react";

import { RECOVERY_STATUS_LABEL } from "@/lib/recovery/score";
import type { RecoveryScoreResult } from "@/lib/recovery/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<
  string,
  { ring: string; text: string; chip: string }
> = {
  ready: {
    ring: "stroke-emerald-400",
    text: "text-emerald-300",
    chip: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  },
  good: {
    ring: "stroke-amber-300",
    text: "text-amber-300",
    chip: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  },
  moderate: {
    ring: "stroke-orange-400",
    text: "text-orange-300",
    chip: "border-orange-400/25 bg-orange-400/10 text-orange-300",
  },
  priority: {
    ring: "stroke-rose-400",
    text: "text-rose-300",
    chip: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  },
};

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const status = RECOVERY_STATUS_LABEL[
    score >= 85 ? "ready" : score >= 70 ? "good" : score >= 50 ? "moderate" : "priority"
  ];
  const key =
    score >= 85 ? "ready" : score >= 70 ? "good" : score >= 50 ? "moderate" : "priority";

  return (
    <div className="relative grid size-36 shrink-0 place-items-center sm:size-40">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={STATUS_STYLES[key].ring}
        />
      </svg>

      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-black tracking-[-0.04em] text-white">
          {score}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          / 100 · {status}
        </span>
      </div>
    </div>
  );
}

export function RecoveryScoreCard({
  result,
  recommendation,
}: {
  result: RecoveryScoreResult;
  recommendation: string;
}) {
  const availableDrivers = result.drivers
    .filter((driver) => driver.available)
    .sort((a, b) => a.score - b.score);

  return (
    <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-amber-400" aria-hidden="true" />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            Today&apos;s Recovery Score
          </p>
        </div>

        {result.baseline && (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
              result.baseline.trend === "above"
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                : result.baseline.trend === "below"
                  ? "border-rose-400/25 bg-rose-400/10 text-rose-300"
                  : "border-white/10 bg-white/5 text-zinc-400",
            )}
          >
            {result.baseline.trend === "above"
              ? `+${result.baseline.deltaFromToday} vs your baseline`
              : result.baseline.trend === "below"
                ? `${result.baseline.deltaFromToday} vs your baseline`
                : "In line with your baseline"}
          </span>
        )}
      </div>

      {result.score === null ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm leading-6 text-zinc-400">
          No check-in yet today. Complete the daily recovery check-in below to
          calculate a practical readiness estimate based on the information
          you provide.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing score={result.score} />

          <div className="flex-1 space-y-4">
            <p className="text-sm leading-6 text-zinc-300">{recommendation}</p>

            {availableDrivers.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                  Why this score
                </p>

                <div className="space-y-2">
                  {availableDrivers.map((driver) => (
                    <div key={driver.key} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-zinc-500">
                        {driver.label}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            driver.score >= 70
                              ? "bg-emerald-400"
                              : driver.score >= 50
                                ? "bg-amber-400"
                                : "bg-rose-400",
                          )}
                          style={{ width: `${driver.score}%` }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs font-semibold text-zinc-400">
                        {driver.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 border-t border-white/5 pt-4 text-xs leading-5 text-zinc-600">
        A practical readiness estimate based on the recovery information you
        provide — not a validated medical biomarker.
      </p>
    </article>
  );
}
