import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { addDaysIso } from "@/lib/nutrition/date-utils"
import { evaluateCalorieCalibration, type CalibrationResult, type WeightReading } from "@/lib/nutrition/calibration"
import type { NutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { localDateTimeParts, resolveUserTimeZone } from "@/lib/training/load-today-session"

export type CalibrationReview = {
  today: string
  /** Null when there is no plan, or a weight/intake read failed (never a guess from partial data). */
  result: CalibrationResult | null
  todayWeightKg: number | null
  readFailed: boolean
}

/**
 * The ONE loader for a calibration review: the Plan page renders it and
 * the accept action re-runs it, so a proposal can only be applied if the
 * server, from the same rows, would still make it.
 */
export async function loadCalibrationReview(
  supabase: SupabaseClient,
  userId: string,
  context: Pick<NutritionContext, "plan" | "calibration">,
): Promise<CalibrationReview> {
  const timeZone = await resolveUserTimeZone(supabase, userId)
  const today = localDateTimeParts(new Date(), timeZone).localDate
  const from = addDaysIso(today, -13)

  const [weights, intake] = await Promise.all([
    supabase
      .from("body_weight_entries")
      .select("logged_on, weight_kg")
      .eq("user_id", userId)
      .gte("logged_on", from)
      .lte("logged_on", today),
    supabase
      .from("food_logs")
      .select("log_date, calories")
      .eq("user_id", userId)
      .gte("log_date", from)
      .lte("log_date", today),
  ])

  const readFailed = Boolean(weights.error || intake.error)
  if (readFailed) {
    console.warn("[NUTRITION] calibration read failed:", weights.error?.message ?? intake.error?.message)
  }

  const readings: WeightReading[] = ((weights.data ?? []) as Array<{ logged_on: string; weight_kg: number | string }>).map(
    (row) => ({ date: row.logged_on, weightKg: Number(row.weight_kg) }),
  )
  const todayWeightKg = readings.find((r) => r.date === today)?.weightKg ?? null

  const perDay = new Map<string, number>()
  for (const row of (intake.data ?? []) as Array<{ log_date: string; calories: number | string }>) {
    perDay.set(row.log_date, (perDay.get(row.log_date) ?? 0) + Number(row.calories))
  }

  const plan = context.plan
  const reviewedAt = context.calibration.reviewedAt
  const result =
    plan && !readFailed
      ? evaluateCalorieCalibration({
          goal: plan.input.goal,
          today,
          currentTargetCalories: plan.target.calories,
          currentAdjustmentKcal: plan.calorieAdjustmentKcal,
          bmr: plan.bmr,
          weights: readings,
          intake: [...perDay].map(([date, calories]) => ({ date, calories })),
          reviewedOn: reviewedAt ? localDateTimeParts(new Date(reviewedAt), timeZone).localDate : null,
        })
      : null

  return { today, result, todayWeightKg, readFailed }
}
