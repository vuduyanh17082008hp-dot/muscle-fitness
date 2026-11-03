import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { ProposalDetails } from "@/lib/dante-core/chat-stream-protocol"
import { currentTrainingHold } from "@/lib/dante-core/server/training-hold-guard"
import { loadCalibrationReview } from "@/lib/nutrition/calibration-data"
import { loadNutritionContext, type NutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { buildNutritionPlan, MAX_CALIBRATION_ADJUSTMENT_KCAL, MIN_TARGET_CALORIES, type MacroTarget } from "@/lib/nutrition/plan"
import { describeWeek, perWeek, planScheduleChange, type ScheduleChange, type ScheduleDay } from "@/lib/training/schedule-change"

/**
 * MF-S1 H2: the ONE place a schedule or calorie-target proposal is built. The chat turn calls it to propose, and the
 * tools call it again for Modify, so a modified value passes exactly the same reads and gates. Every read is the user's
 * own RLS client; nothing here writes.
 */

type Lang = "en" | "vi"

/* ---------------------------------------------------------------- training schedule */

export type ScheduleArgs = {
  planId: string
  planName: string
  beforeDaysPerWeek: number
  daysPerWeek: number
  temporary: boolean
  days: ScheduleChange["days"]
  language: Lang
}

export type ScheduleBuild =
  | { status: "PROPOSAL"; args: ScheduleArgs; change: ScheduleChange; summary: string }
  | { status: "NO_PLAN" }
  | { status: "NO_TRAINING_DAYS" }
  | { status: "UNAVAILABLE" }
  | { status: "UNCHANGED"; change: ScheduleChange; planName: string }
  | { status: "HOLD"; hold: "recovery" | "unverified"; planName: string; beforeDaysPerWeek: number }

export async function buildScheduleProposal(input: {
  supabase: SupabaseClient
  userId: string
  now: Date
  daysPerWeek: number
  weekdays: number[] | null
  temporary: boolean
  language: Lang
}): Promise<ScheduleBuild> {
  const { supabase, userId, language } = input
  const { data: plan, error } = await supabase
    .from("workout_plans")
    .select("id, name, days_per_week")
    .eq("client_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { status: "UNAVAILABLE" }
  if (!plan) return { status: "NO_PLAN" }
  const { data: rows, error: daysError } = await supabase
    .from("workout_days")
    .select("id, name, day_order, scheduled_weekday, rest_day, workout_exercises(id)")
    .eq("workout_plan_id", plan.id)
  if (daysError || !rows) return { status: "UNAVAILABLE" }
  const trainingDays: ScheduleDay[] = (rows as Array<{ id: string; name: string | null; day_order: number; scheduled_weekday: number | null; rest_day: boolean | null; workout_exercises: Array<{ id: string }> | null }>)
    .filter((row) => row.rest_day !== true && (row.workout_exercises?.length ?? 0) > 0)
    .map((row) => ({ dayId: row.id, name: row.name ?? "Workout", dayOrder: row.day_order, weekday: row.scheduled_weekday }))
  if (trainingDays.length === 0) return { status: "NO_TRAINING_DAYS" }

  const planName = (plan.name as string | null) ?? "Workout plan"
  const beforeDaysPerWeek = Number(plan.days_per_week) || trainingDays.length
  const change = planScheduleChange({ trainingDays, currentDaysPerWeek: beforeDaysPerWeek, daysPerWeek: input.daysPerWeek, weekdays: input.weekdays })
  if (change.unchanged) return { status: "UNCHANGED", change, planName }

  // More training days per week adds training: never proposed while a pain/illness hold (or an unverified check) stands.
  if (input.daysPerWeek > beforeDaysPerWeek) {
    const hold = await currentTrainingHold(supabase, userId, input.now)
    if (hold) return { status: "HOLD", hold, planName, beforeDaysPerWeek }
  }

  const vi = language === "vi"
  const week = describeWeek(change.days.map((day) => ({ name: day.name, weekday: day.after })), language)
  return {
    status: "PROPOSAL",
    change,
    args: { planId: plan.id as string, planName, beforeDaysPerWeek, daysPerWeek: input.daysPerWeek, temporary: input.temporary, days: change.days, language },
    summary: vi ? `Đổi kế hoạch ${planName} sang ${input.daysPerWeek} buổi/tuần (${week})` : `Change ${planName} to ${perWeek(input.daysPerWeek, "en")} (${week})`,
  }
}

export function describeScheduleProposal(args: ScheduleArgs): ProposalDetails {
  const vi = args.language === "vi"
  const before = describeWeek(args.days.map((day) => ({ name: day.name, weekday: day.before })), args.language)
  const after = describeWeek(args.days.map((day) => ({ name: day.name, weekday: day.after })), args.language)
  const workouts = args.days.length
  const rotation = args.days.every((day) => day.after === null)
  const uncertainty: string[] = []
  if (rotation && workouts > args.daysPerWeek) {
    uncertainty.push(vi
      ? `Kế hoạch có ${workouts} buổi khác nhau, nên một vòng đầy đủ mất khoảng ${Math.ceil(workouts / args.daysPerWeek)} tuần và mỗi nhóm cơ được tập thưa hơn. Bài tập trong từng buổi giữ nguyên.`
      : `Your plan has ${workouts} different workouts, so a full cycle takes about ${Math.ceil(workouts / args.daysPerWeek)} weeks and each muscle is trained less often. The exercises in each workout are unchanged.`)
  } else if (rotation) {
    uncertainty.push(vi ? `Kế hoạch có ${workouts} buổi, nên sẽ được lặp lại theo vòng.` : `Your plan has ${workouts} workouts, so they repeat in rotation.`)
  }
  if (args.temporary) uncertainty.push(vi ? "Bạn nói đây là tạm thời — Dante sẽ không tự đổi lại, hãy nhắn khi lịch của bạn thay đổi." : "You said this is temporary — Dante won't switch it back on its own; tell me when your schedule changes again.")
  return {
    title: vi ? "Đổi lịch tập" : "Change training schedule",
    reason: vi ? `Bạn nói giờ bạn chỉ tập được ${args.daysPerWeek} buổi/tuần.` : `You said you can train ${args.daysPerWeek} day${args.daysPerWeek === 1 ? "" : "s"} a week.`,
    target: vi ? `Kế hoạch tập · ${args.planName}` : `Workout plan · ${args.planName}`,
    current: `${perWeek(args.beforeDaysPerWeek, args.language, true)} · ${before}`,
    proposed: `${perWeek(args.daysPerWeek, args.language, true)} · ${after}`,
    uncertainty: uncertainty.join(" ") || null,
    href: "/dashboard/workouts",
    hrefLabel: vi ? "Xem kế hoạch tập" : "View workout plan",
    modify: { label: vi ? "Số buổi mỗi tuần" : "Days per week", unit: vi ? "buổi" : "days", value: args.daysPerWeek, min: 1, max: 7, step: 1 },
  }
}

/* ---------------------------------------------------------------- calorie target */

export type CalorieArgs = {
  expectedTargetKcal: number
  expectedAdjustmentKcal: number
  nextAdjustmentKcal: number
  proposedTargetKcal: number
  before: Pick<MacroTarget, "calories" | "protein" | "carbs" | "fat">
  after: Pick<MacroTarget, "calories" | "protein" | "carbs" | "fat">
  reason: string
  uncertainty: string | null
  language: Lang
}

export type CalorieBuild =
  | { status: "PROPOSAL"; args: CalorieArgs; summary: string; context: NutritionContext; limitNote: string | null }
  | { status: "UNCHANGED"; context: NutritionContext; limitNote: string | null }
  | { status: "NO_PLAN" }
  | { status: "UNAVAILABLE" }

const macros = (target: MacroTarget) => ({ calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat })

/** The engine decides the resulting target (floor and ±1000 cap included) — this only picks the adjustment to try. */
export async function buildCalorieProposal(input: {
  supabase: SupabaseClient
  userId: string
  /** The kcal the user asked for: an absolute daily target. */
  targetKcal: number
  reason: string
  uncertainty: string | null
  language: Lang
  context?: NutritionContext
}): Promise<CalorieBuild> {
  let context: NutritionContext
  try {
    context = input.context ?? (await loadNutritionContext(input.supabase, input.userId))
  } catch {
    return { status: "UNAVAILABLE" }
  }
  const plan = context.plan
  if (!plan) return { status: "NO_PLAN" }
  if (!context.calibration.available || context.unavailable?.includes("preferences")) return { status: "UNAVAILABLE" }

  const vi = input.language === "vi"
  const current = plan.calorieAdjustmentKcal
  const wanted = Math.round(input.targetKcal / 10) * 10
  const raw = current + (wanted - plan.target.calories)
  const next = Math.max(-MAX_CALIBRATION_ADJUSTMENT_KCAL, Math.min(MAX_CALIBRATION_ADJUSTMENT_KCAL, raw))
  const after = buildNutritionPlan({ ...plan.input, calorieAdjustmentKcal: next }).target
  let limitNote: string | null = null
  if (after.calories !== wanted) {
    limitNote = wanted < MIN_TARGET_CALORIES || after.calories === MIN_TARGET_CALORIES
      ? vi ? `${MIN_TARGET_CALORIES} kcal là mức mục tiêu thấp nhất ứng dụng đặt, nên mức thấp nhất mình đề xuất được là ${after.calories} kcal.` : `${MIN_TARGET_CALORIES} kcal is the lowest target the app sets, so the lowest I can propose is ${after.calories} kcal.`
      : vi ? `Ứng dụng chỉ cho lệch tối đa ±${MAX_CALIBRATION_ADJUSTMENT_KCAL} kcal so với ước tính (${plan.estimatedTargetCalories} kcal), nên mức gần nhất là ${after.calories} kcal.` : `The app allows at most ±${MAX_CALIBRATION_ADJUSTMENT_KCAL} kcal from your estimate (${plan.estimatedTargetCalories} kcal), so the closest I can propose is ${after.calories} kcal.`
  }
  if (after.calories === plan.target.calories) return { status: "UNCHANGED", context, limitNote }

  const delta = after.calories - plan.target.calories
  return {
    status: "PROPOSAL",
    context,
    limitNote,
    args: {
      expectedTargetKcal: plan.target.calories,
      expectedAdjustmentKcal: current,
      nextAdjustmentKcal: next,
      proposedTargetKcal: after.calories,
      before: macros(plan.target),
      after: macros(after),
      reason: input.reason,
      uncertainty: input.uncertainty,
      language: input.language,
    },
    summary: vi
      ? `Đổi mục tiêu calo hằng ngày từ ${plan.target.calories} sang ${after.calories} kcal (${delta > 0 ? "+" : ""}${delta})`
      : `Change your daily calorie target from ${plan.target.calories} to ${after.calories} kcal (${delta > 0 ? "+" : ""}${delta})`,
  }
}

export function describeCalorieProposal(args: CalorieArgs): ProposalDetails {
  const vi = args.language === "vi"
  const fmt = (m: CalorieArgs["before"]) => `${m.calories} kcal · P ${m.protein} g · C ${m.carbs} g · F ${m.fat} g`
  return {
    title: vi ? "Đổi mục tiêu calo hằng ngày" : "Change daily calorie target",
    reason: args.reason,
    target: vi ? "Kế hoạch dinh dưỡng · mục tiêu hằng ngày" : "Nutrition plan · daily target",
    current: fmt(args.before),
    proposed: fmt(args.after),
    uncertainty: args.uncertainty,
    href: "/dashboard/nutrition/plan",
    hrefLabel: vi ? "Xem kế hoạch dinh dưỡng" : "View nutrition plan",
    modify: {
      label: vi ? "Mục tiêu hằng ngày" : "Daily target",
      unit: "kcal",
      value: args.proposedTargetKcal,
      min: Math.max(MIN_TARGET_CALORIES, args.expectedTargetKcal - args.expectedAdjustmentKcal - MAX_CALIBRATION_ADJUSTMENT_KCAL),
      max: args.expectedTargetKcal - args.expectedAdjustmentKcal + MAX_CALIBRATION_ADJUSTMENT_KCAL,
      step: 10,
    },
  }
}

/** Calibration review read for a "should I change my calories?" ask — null when the read failed (never a guess). */
export async function readCalibration(supabase: SupabaseClient, userId: string, context: NutritionContext) {
  if (!context.plan || !context.calibration.available) return null
  const review = await loadCalibrationReview(supabase, userId, context).catch(() => null)
  return review && !review.readFailed ? review.result : null
}
