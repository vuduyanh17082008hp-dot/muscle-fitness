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
import { loadCalibrationReview } from "@/lib/nutrition/calibration-data"
import { CalorieCalibrationPanel } from "@/components/nutrition/calorie-calibration-panel"

import { NutritionSettingsForm } from "../nutrition-settings-form"
import { NUTRITION_TABS } from "../tabs"
import { BudgetPlanner } from "@/components/nutrition/budget-planner"
import { NutritionSectionReveal, NutritionResultGlow } from "@/components/nutrition/nutrition-motion"
import { SectionTabs } from "@/components/dashboard/section-tabs"
import { PerformanceCard } from "@/components/ui/performance-card"
import { SecondaryButton } from "@/components/ui/button"

export const dynamic = "force-dynamic"

const RESULT_CARD_MOTION =
  "transition duration-200 hover:-translate-y-0.5 hover:border-white/20 active:scale-[0.995] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"

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
      <p className="text-xs font-black uppercase tracking-[0.12em] text-mf-glass-brand">
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
    redirect("/login?next=/dashboard/nutrition/plan")
  }

  const context = await loadNutritionContext(supabase, user.id)
  const {
    plan,
    estimatedFields,
    overrides,
    weeklyFoodBudgetSgd,
    onboardingGoal,
    trainingVolume,
    calibration,
  } = context

  /* =======================================================
     MISSING PROFILE DATA — Today explains what's missing
  ======================================================= */

  if (!plan) {
    redirect("/dashboard/nutrition")
  }

  const { input, target } = plan

  const budgetPlan = buildBudgetPlan(plan, weeklyFoodBudgetSgd)
  const review = await loadCalibrationReview(supabase, user.id, context)

  const macroEnergy = target.protein * 4 + target.carbs * 4 + target.fat * 9
  const goalPercent = Math.round(plan.goalAdjustmentPercent * 1000) / 10
  const energySteps: Array<{ label: string; value: string; detail: string; origin: string }> = [
    {
      label: "BMR (Mifflin-St Jeor)",
      value: `${plan.bmr} kcal`,
      detail: `${input.sex === "unspecified" ? "sex not set (neutral constant)" : input.sex}, ${input.age} y, ${input.heightCm} cm, ${input.weightKg} kg`,
      origin: "Estimated from your profile",
    },
    {
      label: `Activity: ${ACTIVITY_LEVEL_LABELS[input.activityLevel]}`,
      value: `× ${plan.pal}`,
      detail: "Whole-day activity including training — nothing is added for workouts on top",
      origin: overrides.activityLevel ? "You selected" : "Estimated from training days",
    },
    {
      label: "Estimated maintenance",
      value: `${plan.maintenanceCalories} kcal`,
      detail: `${plan.bmr} × ${plan.pal}`,
      origin: "Estimated",
    },
    {
      label: `Goal: ${NUTRITION_GOAL_LABELS[input.goal]}`,
      value: plan.goalAdjustmentKcal === 0 ? "± 0 kcal" : `${plan.goalAdjustmentKcal > 0 ? "+" : "−"}${Math.abs(plan.goalAdjustmentKcal)} kcal`,
      detail: `${
        goalPercent === 0 ? "No surplus or deficit for maintenance" : `${goalPercent > 0 ? "+" : ""}${goalPercent}% of maintenance`
      }; target rounded to 10 kcal → ${plan.estimatedTargetCalories} kcal`,
      origin: overrides.goal ? "You selected" : "From your onboarding goal",
    },
    ...(plan.calorieAdjustmentKcal !== 0
      ? [{
          label: "Weight-trend calibration",
          value: `${plan.calorieAdjustmentKcal > 0 ? "+" : "−"}${Math.abs(plan.calorieAdjustmentKcal)} kcal`,
          detail: "A change you accepted after reviewing your weight trend",
          origin: "Calibrated from your data",
        }]
      : []),
    {
      label: `Training style: ${TRAINING_MODE_LABELS[input.trainingMode]}`,
      value: "0 kcal",
      detail: "Changes macro split and meal timing only",
      origin: overrides.trainingMode ? "You selected" : "Estimated",
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-10 overflow-x-clip pb-16">
      <SectionTabs tabs={NUTRITION_TABS} />

      {/* ===================================================
          HEADER
      =================================================== */}

      <header id="plan" className="scroll-mt-24 overflow-hidden rounded-[24px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-7 sm:p-9">
        <span className="inline-grid size-14 place-items-center rounded-2xl border border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand">
          <Utensils className="size-6" />
        </span>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-mf-glass-brand">
          Nutrition Intelligence
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-mf-glass-text sm:text-4xl">
          Your Nutrition Plan
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">
          Built from your stored profile and training style — adjust
          the settings below any time your training changes.
        </p>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.12em] text-mf-glass-text-muted">
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
          <p className="mb-4 text-xs font-black uppercase tracking-[0.12em] text-mf-glass-text-muted">
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
            onboardingGoal={onboardingGoal}
            trainingVolume={trainingVolume}
          />
        </div>
      </header>

      {/* ===================================================
          ENERGY MODEL
      =================================================== */}

      <NutritionSectionReveal>
      <section>
        <SectionHeading
          eyebrow="Energy Model"
          title="Daily energy and macros"
          description={
            plan.calorieAdjustmentKcal !== 0
              ? "Your estimate, adjusted by a weight-trend calibration you accepted — see Calibration below."
              : "Your starting target is an estimate, not a guaranteed number — see Calibration below."
          }
        />

        <NutritionResultGlow>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PerformanceCard glass variant="nutrition" title="Calories" metric={{ value: target.calories }} className={RESULT_CARD_MOTION} />
          <PerformanceCard glass variant="nutrition" title="Protein" metric={{ value: target.protein, unit: "g" }} className={RESULT_CARD_MOTION} />
          <PerformanceCard glass variant="nutrition" title="Carbohydrates" metric={{ value: target.carbs, unit: "g" }} className={RESULT_CARD_MOTION} />
          <PerformanceCard glass variant="nutrition" title="Fat" metric={{ value: target.fat, unit: "g" }} className={RESULT_CARD_MOTION} />
        </div>
        </NutritionResultGlow>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <PerformanceCard glass title="BMR (Mifflin-St Jeor)" metric={{ value: plan.bmr, unit: "kcal" }} />
          <PerformanceCard glass title="PAL multiplier" metric={{ value: plan.pal.toFixed(3) }} />
          <PerformanceCard glass title="Estimated maintenance" metric={{ value: plan.maintenanceCalories, unit: "kcal" }} />
        </div>

        <div className="mt-4 overflow-hidden rounded-[16px] border border-mf-glass-border">
          <p className="border-b border-mf-glass-border bg-white/[0.02] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-mf-glass-text-muted">
            Why {target.calories} kcal
          </p>
          <ol className="divide-y divide-white/5">
            {energySteps.map((step) => (
              <li key={step.label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-mf-glass-text">{step.label}</p>
                  <p className="text-xs leading-5 text-mf-glass-text-muted">
                    {step.detail} · <span className="text-mf-glass-text-secondary">{step.origin}</span>
                  </p>
                </div>
                <p className="font-semibold tabular-nums text-mf-glass-text sm:text-right">{step.value}</p>
              </li>
            ))}
            <li className="grid gap-1 bg-white/[0.02] px-4 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4">
              <div className="min-w-0">
                <p className="font-bold text-mf-glass-text">Daily target</p>
                <p className="text-xs leading-5 text-mf-glass-text-muted">
                  Macros: {target.protein} g × 4 + {target.carbs} g × 4 + {target.fat} g × 9 = {macroEnergy} kcal
                  (carbs fill what protein and fat leave; ± a few kcal is gram rounding)
                </p>
              </div>
              <p className="font-black tabular-nums text-mf-glass-brand sm:text-right">{target.calories} kcal</p>
            </li>
          </ol>
        </div>

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
      </NutritionSectionReveal>

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

      <NutritionSectionReveal>
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
              className="min-w-0 rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-6 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 active:scale-[0.995] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
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
                    <tr className="border-b border-mf-glass-border text-left text-xs uppercase tracking-[0.14em] text-mf-glass-text-muted">
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
                            <span className="ml-1.5 text-xs font-semibold uppercase tracking-wide text-mf-glass-text-muted">
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
      </NutritionSectionReveal>

      {/* ===================================================
          CALIBRATION
      =================================================== */}

      <section className="rounded-[24px] border border-mf-glass-border bg-mf-glass-surface p-6 sm:p-8">
        <PanelHeader
          icon={Activity}
          tone="emerald"
          eyebrow="Calibration"
          title="Calibrate after 1–2 weeks"
        />

        <CalorieCalibrationPanel
          available={calibration.available}
          readFailed={review.readFailed}
          today={review.today}
          todayWeightKg={review.todayWeightKg}
          result={review.result}
          currentTargetCalories={target.calories}
          estimatedTargetCalories={plan.estimatedTargetCalories}
          adjustmentKcal={plan.calorieAdjustmentKcal}
        />

        <ol className="mt-6 space-y-3">
          {plan.calibrationNotes.map((note, index) => (
            <li
              key={note}
              className="flex items-start gap-3 text-sm leading-6 text-mf-glass-text-secondary"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold text-mf-glass-text-secondary">
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
