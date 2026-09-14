import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { RECOVERY_STATUS_LABEL } from "@/lib/recovery/score";
import type { RecoveryCheckinRow, RecoveryScoreResult } from "@/lib/recovery/types";
import { GlassCard, GlassCardHeader, GlassDivider } from "@/components/dashboard/glass/glass-card";

export type ReadinessCardProps = {
  scoreResult: RecoveryScoreResult;
  todayCheckin: RecoveryCheckinRow | null;
  /** True when the Recovery Engine failed to load — a distinct state from "no check-in yet". */
  error?: boolean;
};

const STATUS_ARC_COLOR: Record<string, string> = {
  ready: "var(--mf-glass-brand)",
  good: "var(--mf-glass-brand)",
  moderate: "var(--mf-glass-warning)",
  priority: "var(--mf-glass-danger)",
};

function qualitativeLabel(score: number): "Good" | "Moderate" | "Low" {
  if (score >= 70) return "Good";
  if (score >= 50) return "Moderate";
  return "Low";
}

function formatSleep(hours: number | null): string | null {
  if (hours === null) return null;
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return minutes > 0 ? `${wholeHours}h ${minutes}m` : `${wholeHours}h`;
}

export function ReadinessCard({ scoreResult, todayCheckin, error = false }: ReadinessCardProps) {
  if (error) {
    return (
      <GlassCard data-testid="readiness-card">
        <GlassCardHeader title="Readiness" />
        <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-mf-glass-text-muted">Readiness data couldn&apos;t be loaded.</p>
        </div>
      </GlassCard>
    );
  }

  if (scoreResult.score === null) {
    return (
      <GlassCard data-testid="readiness-card">
        <GlassCardHeader title="Readiness" />

        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-mf-glass-text-muted">No check-in yet.</p>
          <Link
            href="/dashboard/recovery"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-mf-glass-brand px-4 text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            Check In
          </Link>
        </div>
      </GlassCard>
    );
  }

  const score = scoreResult.score;
  const status = scoreResult.status ?? "moderate";
  const statusLabel = RECOVERY_STATUS_LABEL[status];
  const arcColor = STATUS_ARC_COLOR[status] ?? "var(--mf-glass-brand)";

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  const signals = scoreResult.drivers.filter(
    (driver) => driver.available && (driver.key === "sleep" || driver.key === "soreness" || driver.key === "stress"),
  );

  const orderedSignals = ["sleep", "soreness", "stress"]
    .map((key) => signals.find((driver) => driver.key === key))
    .filter((driver): driver is NonNullable<typeof driver> => Boolean(driver));

  return (
    <GlassCard data-testid="readiness-card">
      <GlassCardHeader
        title="Readiness"
        action={
          <Link
            href="/dashboard/recovery"
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-mf-glass-text-muted transition hover:text-mf-glass-text"
          >
            {`Why ${score}?`}
            <ChevronRight className="size-3" aria-hidden="true" />
          </Link>
        }
      />

      <div className="mt-3 flex flex-1 flex-col items-center justify-center">
        <div
          className="relative grid size-28 place-items-center"
          role="img"
          aria-label={`Readiness ${score} out of 100, ${statusLabel}`}
        >
          <svg viewBox="0 0 96 96" className="size-28 -rotate-90 motion-safe:[&_circle:nth-child(2)]:[transition:stroke-dashoffset_0.7s_ease-out]">
            <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke={arcColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-3xl font-bold tabular-nums text-mf-glass-text">{score}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-mf-glass-text-muted">
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      {orderedSignals.length > 0 ? (
        <>
          <GlassDivider />
          <dl className="space-y-2.5">
            {orderedSignals.map((driver) => {
              const displayValue =
                driver.key === "sleep"
                  ? formatSleep(todayCheckin?.sleep_hours ?? null)
                  : driver.key === "soreness"
                    ? todayCheckin?.soreness !== null && todayCheckin?.soreness !== undefined
                      ? `${todayCheckin.soreness} / 10`
                      : null
                    : driver.key === "stress"
                      ? todayCheckin?.stress !== null && todayCheckin?.stress !== undefined
                        ? `${todayCheckin.stress} / 10`
                        : null
                      : null;

              return (
                <div key={driver.key} className="flex items-center justify-between text-xs">
                  <dt className="text-mf-glass-text-muted">{driver.label}</dt>
                  <dd className="flex items-center gap-2 font-semibold text-mf-glass-text">
                    {displayValue ?? "—"}
                    <span className="text-mf-glass-text-muted">{qualitativeLabel(driver.score)}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      ) : null}
    </GlassCard>
  );
}
