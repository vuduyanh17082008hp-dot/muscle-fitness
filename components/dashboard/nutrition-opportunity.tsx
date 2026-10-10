import Link from "next/link";
import { Utensils, ArrowRight, Flame, Beef } from "lucide-react";
import type { NutritionPlan } from "@/lib/nutrition/plan";
import type { DailyMacroTotals } from "@/lib/nutrition/food-log/types";

export type NutritionOpportunityProps = {
  plan: NutritionPlan | null;
  totals: DailyMacroTotals;
};

const CRAVING_SHORTCUTS = [
  { label: "High protein", query: "What are some high-protein meal options to hit my remaining macros?" },
  { label: "Quick & easy", query: "Suggest a fast meal that fits my remaining calories and protein." },
  { label: "Savory dinner", query: "What can I eat for a savory dinner fitting my remaining nutrition?" },
  { label: "Dining out", query: "How should I navigate dining out while hitting today's target?" },
];

export function NutritionOpportunity({ plan, totals }: NutritionOpportunityProps) {
  const targetCalories = plan?.target.calories ?? null;
  const targetProtein = plan?.target.protein ?? null;

  const remainingCalories = targetCalories !== null ? Math.max(0, targetCalories - totals.calories) : null;
  const remainingProtein = targetProtein !== null ? Math.max(0, targetProtein - Math.round(totals.protein)) : null;

  return (
    <article className="rounded-2xl border border-white/10 bg-mf-glass-surface p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Utensils className="size-4 text-emerald-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-mf-glass-text">
            Nutrition Opportunity
          </h3>
        </div>

        <Link
          href="/dashboard/nutrition"
          className="text-xs font-semibold text-mf-glass-brand hover:underline"
        >
          View Food Log →
        </Link>
      </div>

      {/* Remaining Budget vs Totals */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5 text-xs text-mf-glass-text-muted">
            <Flame className="size-3.5 text-amber-400" />
            <span>Calories</span>
          </div>
          <div className="mt-2">
            {remainingCalories !== null ? (
              <>
                <p className="text-xl font-black text-mf-glass-text">
                  {remainingCalories.toLocaleString()}
                </p>
                <p className="text-[11px] text-mf-glass-text-muted">kcal remaining today</p>
              </>
            ) : (
              <>
                <p className="text-xl font-black text-mf-glass-text">
                  {totals.calories.toLocaleString()}
                </p>
                <p className="text-[11px] text-mf-glass-text-muted">kcal logged (no target set)</p>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5 text-xs text-mf-glass-text-muted">
            <Beef className="size-3.5 text-emerald-400" />
            <span>Protein</span>
          </div>
          <div className="mt-2">
            {remainingProtein !== null ? (
              <>
                <p className="text-xl font-black text-mf-glass-text">{remainingProtein}g</p>
                <p className="text-[11px] text-mf-glass-text-muted">protein remaining</p>
              </>
            ) : (
              <>
                <p className="text-xl font-black text-mf-glass-text">{Math.round(totals.protein)}g</p>
                <p className="text-[11px] text-mf-glass-text-muted">protein logged</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Craving / Coach Entry Shortcuts */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
          What sounds good? (Ask Coach)
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {CRAVING_SHORTCUTS.map((shortcut) => (
            <Link
              key={shortcut.label}
              href={`/dashboard/nutrition?query=${encodeURIComponent(shortcut.query)}`}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-mf-glass-text transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <span>{shortcut.label}</span>
              <ArrowRight className="size-3 text-zinc-500" />
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
