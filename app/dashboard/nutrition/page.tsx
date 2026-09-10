import Link from "next/link"
import { redirect } from "next/navigation"

import {
  Activity,
  AlertTriangle,
  Flame,
  HeartPulse,
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

import { NutritionSettingsForm } from "./nutrition-settings-form"

export const dynamic = "force-dynamic"

/* =========================================================
   SMALL PRESENTATION HELPERS
========================================================= */

function StatTile({
  label,
  value,
  suffix,
  accent = false,
}: {
  label: string
  value: string | number
  suffix?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-amber-400/25 bg-amber-400/8"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-3 text-3xl font-black ${
          accent ? "text-amber-300" : "text-white"
        }`}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-base font-semibold text-zinc-500">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  )
}

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
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-500">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>

      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          {description}
        </p>
      ) : null}
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

  const { plan, estimatedFields, missingRequiredFields } =
    await loadNutritionContext(supabase, user.id)

  /* =======================================================
     MISSING PROFILE DATA — DO NOT FABRICATE A PLAN
  ======================================================= */

  if (!plan) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-8">
          <span className="inline-grid size-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <Utensils className="size-6" />
          </span>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
            Nutrition Intelligence
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Your Nutrition Plan
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
            We could not build a nutrition plan yet because some
            required profile information is missing:{" "}
            <span className="text-zinc-200">
              {missingRequiredFields.join(", ")}
            </span>
            .
          </p>

          <Link
            href="/onboarding?edit=1"
            className="mt-6 inline-flex rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Complete your profile
          </Link>
        </header>
      </div>
    )
  }

  const { input, target } = plan

  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-16">
      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-7 sm:p-9">
        <span className="inline-grid size-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <Utensils className="size-6" />
        </span>

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          Nutrition Intelligence
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Your Nutrition Plan
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Built from your stored profile and training style — adjust
          the settings below any time your training changes.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3.5 py-1.5 text-xs font-semibold text-amber-200">
            {TRAINING_MODE_LABELS[input.trainingMode]}
          </span>

          <span className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-zinc-300">
            {ACTIVITY_LEVEL_LABELS[input.activityLevel]}
          </span>

          <span className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-zinc-300">
            {NUTRITION_GOAL_LABELS[input.goal]}
          </span>
        </div>

        <div className="mt-7 border-t border-white/10 pt-6">
          <NutritionSettingsForm
            trainingMode={input.trainingMode}
            activityLevel={input.activityLevel}
            goalOverride={input.goal}
          />
        </div>

        {estimatedFields.length > 0 ? (
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-zinc-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            Estimated: {estimatedFields.join(" · ")}
          </p>
        ) : null}
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
          <StatTile label="Calories" value={target.calories} accent />
          <StatTile label="Protein" value={target.protein} suffix="g" />
          <StatTile label="Carbohydrates" value={target.carbs} suffix="g" />
          <StatTile label="Fat" value={target.fat} suffix="g" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatTile label="BMR (Mifflin-St Jeor)" value={plan.bmr} suffix="kcal" />
          <StatTile
            label="PAL multiplier"
            value={plan.pal.toFixed(3)}
          />
          <StatTile
            label="Estimated maintenance"
            value={plan.maintenanceCalories}
            suffix="kcal"
          />
        </div>

        <p className="mt-3 text-xs leading-5 text-zinc-600">
          Goal adjustment applied:{" "}
          {plan.goalAdjustmentPercent === 0
            ? "none (maintenance)"
            : `${plan.goalAdjustmentPercent > 0 ? "+" : ""}${Math.round(
                plan.goalAdjustmentPercent * 100,
              )}% starting maintenance estimate`}
          .
        </p>

        <div id="macros" className="mt-6 scroll-mt-24">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
            Macro Targets — relative to bodyweight
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Protein / kg"
              value={target.proteinPerKg}
              suffix="g/kg"
            />
            <StatTile
              label="Carbs / kg"
              value={target.carbsPerKg}
              suffix="g/kg"
            />
            <StatTile label="Fat / kg" value={target.fatPerKg} suffix="g/kg" />
          </div>
        </div>
      </section>

      {/* ===================================================
          TRAINING-SPECIFIC NUTRITION
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <Target className="size-5" />
          </span>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">
              Training-Specific Nutrition
            </p>
            <h2 className="text-xl font-bold text-white">
              {TRAINING_MODE_LABELS[input.trainingMode]}
            </h2>
          </div>
        </div>

        <ul className="space-y-3">
          {plan.trainingNotes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-3 text-sm leading-6 text-zinc-300"
            >
              <TrendingUp className="mt-0.5 size-4 shrink-0 text-amber-400" />
              {note}
            </li>
          ))}
        </ul>
      </section>

      {/* ===================================================
          GRAM-BASED MEAL PLAN
      =================================================== */}

      <section>
        <SectionHeading
          eyebrow="Gram-Based Meal Plan"
          title={`${plan.meals.length} meals for ${TRAINING_MODE_LABELS[input.trainingMode]}`}
          description="Portions are scaled toward your targets and rounded to realistic serving sizes, so totals will be close to — not exactly — your daily targets."
        />

        <div className="grid gap-5 lg:grid-cols-2">
          {plan.meals.map((meal) => (
            <article
              key={meal.id}
              className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{meal.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    {meal.purpose}
                  </p>
                </div>

                <Flame className="mt-1 size-4 shrink-0 text-amber-400" />
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[280px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                      <th className="pb-2 font-semibold">Food</th>
                      <th className="pb-2 pl-3 text-right font-semibold">
                        Grams
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {meal.ingredients.map((ingredient) => (
                      <tr
                        key={ingredient.foodId}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="py-2 text-zinc-200">
                          {ingredient.name}
                        </td>
                        <td className="py-2 pl-3 text-right font-semibold text-white">
                          {ingredient.grams} g
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-4 text-xs font-semibold text-zinc-400">
                <span className="text-amber-300">
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
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-zinc-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            Adjusted for your allergies/exclusions — substituted or
            removed: {plan.excludedIngredientNames.join(", ")}.
          </p>
        ) : null}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs leading-6 text-zinc-500 sm:flex sm:items-center sm:justify-between">
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

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <Activity className="size-5" />
          </span>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">
              Calibration
            </p>
            <h2 className="text-xl font-bold text-white">
              The calculator is the starting point — your trend is the truth.
            </h2>
          </div>
        </div>

        <ol className="space-y-3">
          {plan.calibrationNotes.map((note, index) => (
            <li
              key={note}
              className="flex items-start gap-3 text-sm leading-6 text-zinc-300"
            >
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-bold text-zinc-300">
                {index + 1}
              </span>
              {note}
            </li>
          ))}
        </ol>
      </section>

      {/* ===================================================
          HEALTH NOTE
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-400">
            <HeartPulse className="size-5" />
          </span>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
              Health Note
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              {plan.healthNote}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
