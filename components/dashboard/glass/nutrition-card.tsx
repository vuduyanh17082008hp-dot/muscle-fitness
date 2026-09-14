import Link from "next/link";

import type { MacroTarget } from "@/lib/nutrition/plan";
import { compareToTargets } from "@/lib/nutrition/food-log/totals";
import type { DailyMacroTotals } from "@/lib/nutrition/food-log/types";
import { GlassCard, GlassCardHeader, GlassDivider } from "@/components/dashboard/glass/glass-card";

export type NutritionCardProps = {
  target: MacroTarget | null;
  totals: DailyMacroTotals;
  error?: boolean;
};

function MacroRow({ label, consumed, target }: { label: string; consumed: number; target: number }) {
  const percent = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-mf-glass-text-muted">{label}</span>
        <span className="font-semibold text-mf-glass-text">
          {consumed} / {target}
          {label !== "Calories" ? "g" : ""}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-white/25" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function NutritionCard({ target, totals, error = false }: NutritionCardProps) {
  if (error) {
    return (
      <GlassCard data-testid="nutrition-card">
        <GlassCardHeader title="Nutrition" />
        <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-mf-glass-text-muted">Nutrition data couldn&apos;t be loaded.</p>
        </div>
      </GlassCard>
    );
  }

  if (!target) {
    return (
      <GlassCard data-testid="nutrition-card">
        <GlassCardHeader title="Nutrition" />

        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-mf-glass-text-muted">Nutrition target not configured.</p>
          <Link
            href="/dashboard/nutrition"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-mf-glass-brand px-4 text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            Set Up Nutrition
          </Link>
        </div>
      </GlassCard>
    );
  }

  const comparison = compareToTargets(totals, target);
  const proteinPercent =
    comparison.protein.target > 0
      ? Math.min(100, Math.round((comparison.protein.consumed / comparison.protein.target) * 100))
      : 0;
  const proteinRemaining = Math.max(0, Math.round(comparison.protein.remaining));
  const hasLogged = totals.calories > 0 || totals.protein > 0;

  return (
    <GlassCard data-testid="nutrition-card">
      <GlassCardHeader title="Nutrition" />

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-mf-glass-text-muted">Protein</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-mf-glass-text">
          {Math.round(comparison.protein.consumed)}
          <span className="text-base font-semibold text-mf-glass-text-muted"> / {Math.round(comparison.protein.target)} g</span>
        </p>
        <p className="mt-0.5 text-xs text-mf-glass-text-muted">
          {hasLogged ? (proteinRemaining > 0 ? `${proteinRemaining}g remaining` : "Target reached") : "Nothing logged yet."}
        </p>

        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-mf-glass-brand"
            style={{ width: `${proteinPercent}%` }}
          />
        </div>
      </div>

      <GlassDivider />

      <div className="space-y-2.5">
        <MacroRow label="Calories" consumed={Math.round(comparison.calories.consumed)} target={Math.round(comparison.calories.target)} />
        <MacroRow label="Carbs" consumed={Math.round(comparison.carbs.consumed)} target={Math.round(comparison.carbs.target)} />
        <MacroRow label="Fat" consumed={Math.round(comparison.fat.consumed)} target={Math.round(comparison.fat.target)} />
      </div>

      <Link
        href="/dashboard/nutrition"
        className="mt-4 flex h-10 w-full items-center justify-center rounded-xl border border-mf-glass-border bg-white/[0.02] text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary transition hover:border-mf-glass-border-strong hover:text-mf-glass-text"
      >
        Log Food
      </Link>
    </GlassCard>
  );
}
