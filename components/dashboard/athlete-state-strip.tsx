import Link from "next/link";
import { HeartPulse, Flame, Beef, Scale } from "lucide-react";

export type AthleteStateStripProps = {
  recoveryScore: number | null;
  recoveryStatus: string | null;
  caloriesConsumed: number;
  caloriesTarget: number | null;
  proteinConsumed: number;
  proteinTarget: number | null;
  weightKg: number | null;
};

export function AthleteStateStrip({
  recoveryScore,
  recoveryStatus,
  caloriesConsumed,
  caloriesTarget,
  proteinConsumed,
  proteinTarget,
  weightKg,
}: AthleteStateStripProps) {
  return (
    <section
      aria-label="Current athlete state summary"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:gap-3"
    >
      {/* 1. Recovery State */}
      <Link
        href="/dashboard/recovery"
        className="group flex flex-col justify-between rounded-xl border border-white/10 bg-mf-glass-surface/80 p-3 transition hover:border-white/20 hover:bg-mf-glass-surface"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-mf-glass-text-muted">Recovery</span>
          <HeartPulse className="size-3.5 text-mf-glass-dante" />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          {recoveryScore !== null ? (
            <>
              <span className="text-lg font-black text-mf-glass-text">{recoveryScore}</span>
              <span className="text-[10px] text-mf-glass-text-muted">/100</span>
              {recoveryStatus ? (
                <span className="ml-auto text-[10px] font-bold uppercase text-mf-glass-dante">
                  {recoveryStatus}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-xs font-semibold text-mf-glass-text-muted">Check in</span>
          )}
        </div>
      </Link>

      {/* 2. Fuel / Calories */}
      <Link
        href="/dashboard/nutrition"
        className="group flex flex-col justify-between rounded-xl border border-white/10 bg-mf-glass-surface/80 p-3 transition hover:border-white/20 hover:bg-mf-glass-surface"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-mf-glass-text-muted">Fuel</span>
          <Flame className="size-3.5 text-amber-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-lg font-black text-mf-glass-text">
            {caloriesConsumed.toLocaleString()}
          </span>
          {caloriesTarget ? (
            <span className="text-[10px] text-mf-glass-text-muted">
              / {caloriesTarget.toLocaleString()} kcal
            </span>
          ) : (
            <span className="text-[10px] text-mf-glass-text-muted">kcal</span>
          )}
        </div>
      </Link>

      {/* 3. Protein */}
      <Link
        href="/dashboard/nutrition"
        className="group flex flex-col justify-between rounded-xl border border-white/10 bg-mf-glass-surface/80 p-3 transition hover:border-white/20 hover:bg-mf-glass-surface"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-mf-glass-text-muted">Protein</span>
          <Beef className="size-3.5 text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-lg font-black text-mf-glass-text">{Math.round(proteinConsumed)}</span>
          {proteinTarget ? (
            <span className="text-[10px] text-mf-glass-text-muted">/ {proteinTarget}g</span>
          ) : (
            <span className="text-[10px] text-mf-glass-text-muted">g</span>
          )}
        </div>
      </Link>

      {/* 4. Weight / Body State */}
      <Link
        href="/dashboard/progress"
        className="group flex flex-col justify-between rounded-xl border border-white/10 bg-mf-glass-surface/80 p-3 transition hover:border-white/20 hover:bg-mf-glass-surface"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-mf-glass-text-muted">Weight</span>
          <Scale className="size-3.5 text-mf-glass-analytics" />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          {weightKg !== null ? (
            <>
              <span className="text-lg font-black text-mf-glass-text">{weightKg}</span>
              <span className="text-[10px] text-mf-glass-text-muted">kg</span>
            </>
          ) : (
            <span className="text-xs font-semibold text-mf-glass-text-muted">Log weight</span>
          )}
        </div>
      </Link>
    </section>
  );
}
