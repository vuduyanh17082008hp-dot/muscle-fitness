import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { DashboardProgressSnapshot } from "@/lib/dashboard/progress-snapshot";
import { GlassCard, GlassCardHeader } from "@/components/dashboard/glass/glass-card";

function Sparkline({ values }: { values: Array<number | null> }) {
  const present = values.filter((value): value is number => value !== null);

  if (present.length < 2) {
    return <p className="mt-2 text-[11px] text-mf-glass-text-muted">More history is needed to calculate a trend.</p>;
  }

  const min = Math.min(...present);
  const max = Math.max(...present);
  const range = max - min || 1;
  const stepX = 100 / (values.length - 1);

  const points = values
    .map((value, index) => {
      if (value === null) return null;
      const x = index * stepX;
      const y = 24 - ((value - min) / range) * 24;
      return `${x},${y}`;
    })
    .filter((point): point is string => point !== null)
    .join(" ");

  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="mt-2 h-6 w-full" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--mf-glass-analytics)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MiniTile({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-mf-glass-border bg-white/[0.015] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-mf-glass-text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-mf-glass-text">{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] text-mf-glass-text-muted">{detail}</p> : null}
      {children}
    </div>
  );
}

export function ProgressSnapshotCard({ snapshot }: { snapshot: DashboardProgressSnapshot }) {
  const { trainingAdherence, recoveryTrend, proteinAdherence, weight } = snapshot;

  return (
    <GlassCard data-testid="progress-snapshot-card">
      <GlassCardHeader
        title="Progress Snapshot"
        action={
          <Link
            href="/dashboard/progress"
            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-mf-glass-text-muted transition hover:text-mf-glass-text"
          >
            Details
            <ChevronRight className="size-3" aria-hidden="true" />
          </Link>
        }
      />

      <div className="mt-3 grid flex-1 grid-cols-2 gap-2.5">
        <MiniTile
          label="Training Adherence"
          value={trainingAdherence.percent !== null ? `${trainingAdherence.percent}%` : "—"}
          detail={
            trainingAdherence.sessionsTarget
              ? `${trainingAdherence.sessionsCompleted} of ${trainingAdherence.sessionsTarget} sessions`
              : `${trainingAdherence.sessionsCompleted} sessions / 7d`
          }
        />

        <MiniTile
          label="Recovery Trend"
          value={recoveryTrend.current !== null ? String(recoveryTrend.current) : "—"}
          detail={recoveryTrend.sevenDayAverage !== null ? `7d avg ${recoveryTrend.sevenDayAverage}` : undefined}
        >
          <Sparkline values={recoveryTrend.points.map((point) => point.score)} />
        </MiniTile>

        <MiniTile
          label="Protein Adherence"
          value={proteinAdherence.averagePercent !== null ? `${proteinAdherence.averagePercent}%` : "—"}
          detail={
            proteinAdherence.daysLogged > 0
              ? `${proteinAdherence.daysLogged} of ${proteinAdherence.daysInWindow} days logged`
              : "No logs this week"
          }
        />

        <MiniTile
          label="Weight"
          value={weight.currentKg !== null ? `${weight.currentKg} kg` : "—"}
          detail="Trend needs logged weigh-ins"
        />
      </div>
    </GlassCard>
  );
}
