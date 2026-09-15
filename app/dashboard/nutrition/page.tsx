import Link from "next/link"
import { redirect } from "next/navigation"

import type { LucideIcon } from "lucide-react"
import {
  Activity,
  AlertTriangle,
  Database,
  Flame,
  HeartPulse,
  ShoppingCart,
  Target,
  TrendingUp,
  Utensils,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import {
  ACTIVITY_LEVEL_LABELS,
  NUTRITION_GOAL_LABELS,
  TRAINING_MODE_LABELS,
} from "@/lib/nutrition/plan"
import {
  engineActivityToDbOverride,
  engineTrainingModeToDbOverride,
} from "@/lib/nutrition/profile-mapping"
import { buildBudgetPlan } from "@/lib/nutrition/budget"
import { loadFoodLogForDate, resolveLocalToday } from "@/lib/nutrition/food-log/load-food-log-context"

import { NutritionSettingsForm } from "./nutrition-settings-form"
import { BudgetPlanner } from "@/components/nutrition/budget-planner"
import { NutritionTracker } from "@/components/nutrition/nutrition-tracker"
import { SectionTabs } from "@/components/dashboard/section-tabs"
import { PerformanceCard } from "@/components/ui/performance-card"
import { PrimaryButton, SecondaryButton } from "@/components/ui/button"

export const dynamic = "force-dynamic"

const NUTRITION_TABS = [
  { label: "Today", href: "/dashboard/nutrition#today" },
  { label: "Plan", href: "/dashboard/nutrition#plan" },
  { label: "Macros", href: "/dashboard/nutrition#macros" },
  { label: "Insights", href: "/dashboard/ai-coach" },
]

/* =========================================================
   SMALL PRESENTATION HELPERS
========================================================= */

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-5">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-mf-glass-brand">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-2xl font-black text-mf-glass-text">{title}</h2>

      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">
          {description}
        </p>
      ) : null}
    </div>
  )
}

const PANEL_ICON_TONE = {
  amber: { chip: "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand", eyebrow: "text-mf-glass-brand" },
  emerald: { chip: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300", eyebrow: "text-emerald-400" },
  neutral: { chip: "border-mf-glass-border bg-white/5 text-mf-glass-text-muted", eyebrow: "text-mf-glass-text-muted" },
} as const

/**
 * Consolidates a repeated icon-chip + eyebrow + title header pattern
 * that previously duplicated the same markup across four sections
 * (Training-Specific Nutrition, Calibration, Data Sources, Health
 * Note) — one shared, consistently-styled panel header instead of
 * four hand-rolled ones.
 */
function PanelHeader({
  icon: Icon,
  tone = "amber",
  eyebrow,
  title,
}: {
  icon: LucideIcon
  tone?: keyof typeof PANEL_ICON_TONE
  eyebrow: string
  title?: string
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl border ${PANEL_ICON_TONE[tone].chip}`}
      >
        <Icon className="size-5" />
      </span>

      <div>
        <p className={`text-xs font-black uppercase tracking-[0.2em] ${PANEL_ICON_TONE[tone].eyebrow}`}>
          {eyebrow}
        </p>
        {title ? <h2 className="text-xl font-bold text-mf-glass-text">{title}</h2> : null}
      </div>
    </div>
  )
}

/* =========================================================
   PAGE
========================================================= */

export default async function NutritionPlanPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/dashboard/nutrition")
  }

  const {
    plan,
    estimatedFields,
    missingRequiredFields,
    overrides,
    weeklyFoodBudgetSgd,
  } = await loadNutritionContext(supabase, user.id)

  /* =======================================================
     MISSING PROFILE DATA — DO NOT FABRICATE A PLAN
  ======================================================= */

  if (!plan) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-[24px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-8">
          <span className="inline-grid size-14 place-items-center rounded-2xl border border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand">
            <Utensils className="size-6" />
          </span>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-mf-glass-brand">
            Nutrition Intelligence
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-mf-glass-text sm:text-4xl">
            Your Nutrition Plan
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-mf-glass-text-muted">
            We could not build a nutrition plan yet because some
            required profile information is missing:{" "}
            <span className="text-mf-glass-text-secondary">
              {missingRequiredFields.join(", ")}
            </span>
            .
          </p>

          <PrimaryButton asChild className="mt-6 w-fit">
            <Link href="/onboarding?edit=1">Complete your profile</Link>
          </PrimaryButton>
        </header>
      </div>
    )
  }

  const { input, target } = plan

  const budgetPlan = buildBudgetPlan(plan, weeklyFoodBudgetSgd)
  const localDate = await resolveLocalToday(supabase, user.id)
  const foodLog = await loadFoodLogForDate(supabase, user.id, localDate)

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-16">
      <SectionTabs tabs={NUTRITION_TABS} />

      {/* ===================================================
          TRACK FOOD — daily consumed macros + logging
      =================================================== */}

      <div id="today" className="scroll-mt-24">
        <NutritionTracker
          initialEntries={foodLog.entries}
          initialDate={localDate}
          target={{
            calories: target.calories,
            protein: target.protein,
            carbs: target.carbs,
            fat: target.fat,
          }}
        />
      </div>

      {/* ===================================================
          HEADER
      =================================================== */}

      <header id="plan" className="scroll-mt-24 overflow-hidden rounded-[24px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-7 sm:p-9">
        <span className="inline-grid size-14 place-items-center rounded-2xl border border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand">
          <Utensils className="size-6" />
        </span>

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-mf-glass-brand">
          Nutrition Intelligence
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-mf-glass-text sm:text-4xl">
          Your Nutrition Plan
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">
          Built from your stored profile and training style — adjust
          the settings below any time your training changes.
        </p>

        <p className="mt-6 text-[11px] font-black uppercase tracking-[0.22em] text-mf-glass-text-muted">
          Current Plan
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-mf-glass-brand-border bg-mf-glass-brand-soft px-3.5 py-1.5 text-xs font-semibold text-mf-glass-brand">
            {TRAINING_MODE_LABELS[input.trainingMode]}
          </span>

          <span className="rounded-full border border-mf-glass-border bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-mf-glass-text-secondary">
            {ACTIVITY_LEVEL_LABELS[input.activityLevel]}
          </span>

          <span className="rounded-full border border-mf-glass-border bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-mf-glass-text-secondary">
            {NUTRITION_GOAL_LABELS[input.goal]}
          </span>
        </div>

        {estimatedFields.length > 0 ? (
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-mf-glass-text-muted">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-mf-glass-warning" />
            Estimated: {estimatedFields.join(" · ")}
          </p>
        ) : null}

        <div className="mt-7 border-t border-mf-glass-border pt-6">
          <p className="mb-4 text-[11px] font-black uppercase tracking-[0.22em] text-mf-glass-text-muted">
            Adjust Your Plan
          </p>

          <NutritionSettingsForm
            trainingModeOverride={
              overrides.trainingMode ??
              engineTrainingModeToDbOverride(input.trainingMode)
            }
            activityLevelOverride={
              overrides.activityLevel ??
              engineActivityToDbOverride(input.activityLevel)
            }
            goalOverride={overrides.goal ?? "auto"}
          />
        </div>
      </header>

      {/* ===================================================
          ENERGY MODEL
      =================================================== */}

      <section>
        <SectionHeading
          eyebrow="Energy Model"
          title="Daily energy and macros"
          description="This is a starting maintenance estimate, not a guaranteed number — see Calibration below."
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PerformanceCard glass variant="nutrition" title="Calories" metric={{ value: target.calories }} />
          <PerformanceCard glass variant="nutrition" title="Protein" metric={{ value: target.protein, unit: "g" }} />
          <PerformanceCard glass variant="nutrition" title="Carbohydrates" metric={{ value: target.carbs, unit: "g" }} />
          <PerformanceCard glass variant="nutrition" title="Fat" metric={{ value: target.fat, unit: "g" }} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <PerformanceCard glass title="BMR (Mifflin-St Jeor)" metric={{ value: plan.bmr, unit: "kcal" }} />
          <PerformanceCard glass title="PAL multiplier" metric={{ value: plan.pal.toFixed(3) }} />
          <PerformanceCard glass title="Estimated maintenance" metric={{ value: plan.maintenanceCalories, unit: "kcal" }} />
        </div>

        <p className="mt-3 text-xs leading-5 text-mf-glass-text-muted">
          Goal adjustment applied:{" "}
          {plan.goalAdjustmentPercent === 0
            ? "none (maintenance)"
            : `${plan.goalAdjustmentPercent > 0 ? "+" : ""}${Math.round(
                plan.goalAdjustmentPercent * 100,
              )}% starting maintenance estimate`}
          .
        </p>

        <div id="macros" className="mt-6 scroll-mt-24">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-mf-glass-text-muted">
            Macro Targets — relative to bodyweight
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <PerformanceCard glass title="Protein / kg" metric={{ value: target.proteinPerKg, unit: "g/kg" }} />
            <PerformanceCard glass title="Carbs / kg" metric={{ value: target.carbsPerKg, unit: "g/kg" }} />
            <PerformanceCard glass title="Fat / kg" metric={{ value: target.fatPerKg, unit: "g/kg" }} />
          </div>
        </div>
      </section>

      {/* ===================================================
          TRAINING-SPECIFIC NUTRITION
      =================================================== */}

      <section className="rounded-[24px] border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
        <PanelHeader
          icon={Target}
          eyebrow="Training-Specific Nutrition"
          title={TRAINING_MODE_LABELS[input.trainingMode]}
        />

        <ul className="space-y-3">
          {plan.trainingNotes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-3 text-sm leading-6 text-mf-glass-text-secondary"
            >
              <TrendingUp className="mt-0.5 size-4 shrink-0 text-mf-glass-brand" />
              {note}
            </li>
          ))}
        </ul>
      </section>

      {/* ===================================================
          BUDGET-AWARE PLANNER
      =================================================== */}

      <BudgetPlanner
        initialBudget={weeklyFoodBudgetSgd}
        initialResult={budgetPlan}
        proteinTarget={target.protein}
        calorieTarget={target.calories}
      />

      {/* ===================================================
          GRAM-BASED MEAL PLAN
      =================================================== */}

      <section>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="Gram-Based Meal Plan"
            title={`${plan.meals.length} meals for ${TRAINING_MODE_LABELS[input.trainingMode]}`}
            description="Portions are scaled toward your targets and rounded to realistic serving sizes, so totals will be close to — not exactly — your daily targets."
          />

          <SecondaryButton asChild className="shrink-0">
            <Link href="/dashboard/nutrition/shopping-list">
              <ShoppingCart className="size-4" />
              Generate Shopping List
            </Link>
          </SecondaryButton>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {plan.meals.map((meal) => (
            <article
              key={meal.id}
              className="rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-mf-glass-text">{meal.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-mf-glass-text-muted">
                    {meal.purpose}
                  </p>
                </div>

                <Flame className="mt-1 size-4 shrink-0 text-mf-glass-brand" />
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[280px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-mf-glass-border text-left text-[11px] uppercase tracking-[0.14em] text-mf-glass-text-muted">
                      <th className="pb-2 font-semibold">Food</th>
                      <th className="pb-2 pl-3 text-right font-semibold">
                        Grams
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {meal.ingredients.map((ingredient) => (
                      <tr
                        key={`${meal.id}-${ingredient.foodId}`}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="py-2 text-mf-glass-text-secondary">
                          {ingredient.name}
                        </td>
                        <td className="py-2 pl-3 text-right font-semibold text-mf-glass-text">
                          {ingredient.grams} g
                          {ingredient.measurementBasis !== "as-served" ? (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-mf-glass-text-muted">
                              {ingredient.measurementBasis}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mf-glass-border pt-4 text-xs font-semibold text-mf-glass-text-secondary">
                <span className="text-mf-glass-brand">
                  {meal.totals.calories} kcal
                </span>
                <span>P {meal.totals.protein} g</span>
                <span>C {meal.totals.carbs} g</span>
                <span>F {meal.totals.fat} g</span>
              </div>
            </article>
          ))}
        </div>

        {plan.excludedIngredientNames.length > 0 ? (
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-mf-glass-text-muted">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-mf-glass-warning" />
            Adjusted for your allergies/exclusions — substituted or
            removed: {plan.excludedIngredientNames.join(", ")}.
          </p>
        ) : null}

        <div className="mt-4 rounded-[16px] border border-mf-glass-border bg-white/[0.02] p-5 text-xs leading-6 text-mf-glass-text-muted sm:flex sm:items-center sm:justify-between">
          <p>
            Daily plan totals (from actual portions above): {plan.mealTotals.calories} kcal
            · P {plan.mealTotals.protein} g · C {plan.mealTotals.carbs} g · F{" "}
            {plan.mealTotals.fat} g
          </p>
        </div>
      </section>

      {/* ===================================================
          CALIBRATION
      =================================================== */}

      <section className="rounded-[24px] border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
        <PanelHeader
          icon={Activity}
          tone="emerald"
          eyebrow="Calibration"
          title="The calculator is the starting point — your trend is the truth."
        />

        <ol className="space-y-3">
          {plan.calibrationNotes.map((note, index) => (
            <li
              key={note}
              className="flex items-start gap-3 text-sm leading-6 text-mf-glass-text-secondary"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-mf-glass-text-secondary">
                {index + 1}
              </span>
              {note}
            </li>
          ))}
        </ol>
      </section>

      {/* ===================================================
          NUTRITION DATA SOURCES
      =================================================== */}

      <section className="rounded-[24px] border border-mf-glass-border bg-white/[0.02] p-6 sm:p-8">
        <PanelHeader icon={Database} tone="neutral" eyebrow="Nutrition Data Sources" />

        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-bold text-mf-glass-text-secondary">
              USDA FoodData Central
            </dt>
            <dd className="mt-1 text-xs leading-5 text-mf-glass-text-muted">
              Primary source for whole and raw foods (Foundation and SR
              Legacy data). Public domain, U.S. Department of Agriculture.
            </dd>
          </div>

          <div>
            <dt className="text-sm font-bold text-mf-glass-text-secondary">
              Open Food Facts
            </dt>
            <dd className="mt-1 text-xs leading-5 text-mf-glass-text-muted">
              Used for packaged and branded food products. Community
              database under the Open Database License (ODbL).
            </dd>
          </div>

          <div>
            <dt className="text-sm font-bold text-mf-glass-text-secondary">
              Local fallback
            </dt>
            <dd className="mt-1 text-xs leading-5 text-mf-glass-text-muted">
              A small curated table used only when external sources are
              unavailable or unconfigured.
            </dd>
          </div>
        </dl>

        <p className="mt-5 text-xs leading-5 text-mf-glass-text-muted">
          Nutrition values are estimates and can vary by brand,
          preparation, cooking method and database record. Ingredient
          weights above are shown on the weight basis actually used
          (raw, cooked or as-served) — see docs/NUTRITION_DATA_SOURCES.md
          for the full source research.
        </p>
      </section>

      {/* ===================================================
          HEALTH NOTE
      =================================================== */}

      <section className="rounded-[24px] border border-mf-glass-border bg-white/[0.02] p-6 sm:p-8">
        <PanelHeader icon={HeartPulse} tone="neutral" eyebrow="Health Note" />

        <p className="max-w-2xl text-sm leading-6 text-mf-glass-text-muted">{plan.healthNote}</p>
      </section>
    </div>
  )
}
