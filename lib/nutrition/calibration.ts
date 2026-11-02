/**
 * WEIGHT-TREND CALORIE CALIBRATION
 *
 * Pure and deterministic. Compares two consecutive 7-day windows of
 * logged bodyweight against the direction the current goal implies and
 * returns at most a PROPOSAL — it never changes a target. Applying a
 * proposal is an explicit user action (app/dashboard/nutrition/actions.ts),
 * which re-runs this function server-side before writing.
 *
 * Deliberately conservative:
 * - ≥ 4 weigh-ins in EACH week, or no recommendation at all.
 * - The week-to-week change must clear the goal's band on both the mean
 *   AND the median, so one odd weigh-in can't trigger a change.
 * - 250 kcal/day by default; 500 only for a large, sustained deviation,
 *   and never for a fat-loss reduction.
 * - Logged intake that explains the trend (eating well over / under the
 *   target) blocks a proposal: the fix is adherence, not the target.
 * - Never proposes below max(1200 kcal, estimated BMR) and never beyond
 *   ±1000 kcal of total accepted calibration.
 */

import { addDaysIso } from "@/lib/nutrition/date-utils"
import {
  MAX_CALIBRATION_ADJUSTMENT_KCAL,
  MIN_TARGET_CALORIES,
  type NutritionGoal,
} from "@/lib/nutrition/plan"

export type WeightReading = { date: string; weightKg: number }
export type IntakeDay = { date: string; calories: number }

export type CalibrationWindow = { from: string; to: string; readings: number; averageKg: number | null }

export type CalibrationTrend = {
  previous: CalibrationWindow
  recent: CalibrationWindow
  weeklyChangeKg: number
  weeklyChangePercent: number
}

export type IntakeSummary = { loggedDays: number; windowDays: number; averageCalories: number | null }

export type CalibrationResult =
  | { status: "insufficient_data"; message: string; trend: CalibrationTrend | null; intake: IntakeSummary }
  | { status: "maintain"; message: string; trend: CalibrationTrend; intake: IntakeSummary }
  | { status: "intake_mismatch"; message: string; trend: CalibrationTrend; intake: IntakeSummary }
  | { status: "limit"; message: string; trend: CalibrationTrend; intake: IntakeSummary }
  | {
      status: "propose"
      message: string
      trend: CalibrationTrend
      intake: IntakeSummary
      currentTargetCalories: number
      proposedTargetCalories: number
      deltaKcal: number
      /** Null when intake logging was enough to back the proposal. */
      uncertainty: string | null
    }

export type CalibrationInput = {
  goal: NutritionGoal
  /** User's local calendar date. */
  today: string
  currentTargetCalories: number
  currentAdjustmentKcal: number
  bmr: number
  weights: WeightReading[]
  intake: IntakeDay[]
  /** Local date of the last accept/keep/reset; readings on or before it are ignored. */
  reviewedOn: string | null
}

export const MIN_READINGS_PER_WEEK = 4
const MIN_INTAKE_DAYS = 7
const INTAKE_TOLERANCE = 0.1
const STEP_KCAL = 250
const LARGE_STEP_KCAL = 500
/** Distance past the band (in %/week) that counts as a large deviation. */
const LARGE_DEVIATION_PERCENT = 0.5
const MIN_USEFUL_CHANGE_KCAL = 100

/**
 * Acceptable week-over-week change, % of bodyweight per week.
 * Maintenance ±0.5 %; fat loss 0.25–1.0 % down (the −15 % plan);
 * lean bulk 0.1–0.5 % up (the +7.5 % plan).
 */
export const GOAL_TREND_BANDS: Record<NutritionGoal, { low: number; high: number }> = {
  maintenance: { low: -0.5, high: 0.5 },
  fat_loss: { low: -1.0, high: -0.25 },
  lean_bulk: { low: 0.1, high: 0.5 },
}

const round1 = (value: number) => Math.round(value * 10) / 10
const round2 = (value: number) => Math.round(value * 100) / 100

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function describeChange(trend: CalibrationTrend): string {
  const kg = trend.weeklyChangeKg
  const direction = kg > 0 ? "up" : kg < 0 ? "down" : "unchanged"
  return `Your 7-day average weight went from ${trend.previous.averageKg} kg (${trend.previous.from} – ${trend.previous.to}) to ${trend.recent.averageKg} kg (${trend.recent.from} – ${trend.recent.to}): ${direction}${kg === 0 ? "" : ` ${Math.abs(kg)} kg (${Math.abs(trend.weeklyChangePercent)}% of bodyweight)`} in a week.`
}

const GOAL_PHRASE: Record<NutritionGoal, string> = {
  maintenance: "your maintenance goal",
  fat_loss: "your fat-loss goal",
  lean_bulk: "your lean-bulk goal",
}

export function evaluateCalorieCalibration(input: CalibrationInput): CalibrationResult {
  const recentFrom = addDaysIso(input.today, -6)
  const previousFrom = addDaysIso(input.today, -13)
  const previousTo = addDaysIso(input.today, -7)

  const usable = input.weights.filter(
    (reading) =>
      Number.isFinite(reading.weightKg) &&
      reading.weightKg > 0 &&
      reading.date >= previousFrom &&
      reading.date <= input.today &&
      (input.reviewedOn === null || reading.date > input.reviewedOn),
  )
  const previousValues = usable.filter((r) => r.date <= previousTo).map((r) => r.weightKg)
  const recentValues = usable.filter((r) => r.date >= recentFrom).map((r) => r.weightKg)

  const intakeDays = input.intake.filter(
    (day) => day.date >= previousFrom && day.date <= input.today && day.calories > 0,
  )
  const intake: IntakeSummary = {
    loggedDays: intakeDays.length,
    windowDays: 14,
    averageCalories: intakeDays.length ? Math.round(mean(intakeDays.map((d) => d.calories))) : null,
  }

  const windowOf = (from: string, to: string, values: number[]): CalibrationWindow => ({
    from,
    to,
    readings: values.length,
    averageKg: values.length ? round1(mean(values)) : null,
  })

  if (previousValues.length < MIN_READINGS_PER_WEEK || recentValues.length < MIN_READINGS_PER_WEEK) {
    const since = input.reviewedOn ? ` since your last review (${input.reviewedOn})` : ""
    return {
      status: "insufficient_data",
      message: `Not enough weigh-ins yet${since}: a review needs at least ${MIN_READINGS_PER_WEEK} in each of the last two weeks (you have ${previousValues.length} and ${recentValues.length}). Keep tracking — no change is suggested.`,
      trend: null,
      intake,
    }
  }

  const previousMean = mean(previousValues)
  const changeKg = mean(recentValues) - previousMean
  const changePercent = (changeKg / previousMean) * 100
  const medianPercent = ((median(recentValues) - median(previousValues)) / median(previousValues)) * 100

  const trend: CalibrationTrend = {
    previous: windowOf(previousFrom, previousTo, previousValues),
    recent: windowOf(recentFrom, input.today, recentValues),
    weeklyChangeKg: round2(changeKg),
    weeklyChangePercent: round2(changePercent),
  }

  const band = GOAL_TREND_BANDS[input.goal]
  const meanDirection = changePercent > band.high ? -1 : changePercent < band.low ? 1 : 0
  const medianDirection = medianPercent > band.high ? -1 : medianPercent < band.low ? 1 : 0
  const goal = GOAL_PHRASE[input.goal]

  if (meanDirection === 0) {
    return {
      status: "maintain",
      message: `${describeChange(trend)} That is within the expected range for ${goal} — keep your current target.`,
      trend,
      intake,
    }
  }

  if (medianDirection !== meanDirection) {
    return {
      status: "maintain",
      message: `${describeChange(trend)} Most of that change comes from one or two readings, so it isn't a consistent trend yet — keep your current target and review again next week.`,
      trend,
      intake,
    }
  }

  const direction = meanDirection
  const distance = direction < 0 ? changePercent - band.high : band.low - changePercent
  const reductionOnFatLoss = input.goal === "fat_loss" && direction < 0
  const step = distance >= LARGE_DEVIATION_PERCENT && !reductionOnFatLoss ? LARGE_STEP_KCAL : STEP_KCAL

  // Logged intake that explains the trend: the target isn't the problem.
  if (intake.loggedDays >= MIN_INTAKE_DAYS && intake.averageCalories !== null) {
    const over = intake.averageCalories > input.currentTargetCalories * (1 + INTAKE_TOLERANCE)
    const under = intake.averageCalories < input.currentTargetCalories * (1 - INTAKE_TOLERANCE)
    if ((direction < 0 && over) || (direction > 0 && under)) {
      return {
        status: "intake_mismatch",
        message: `${describeChange(trend)} Your logged intake averaged ${intake.averageCalories} kcal on ${intake.loggedDays} days, ${over ? "above" : "below"} your ${input.currentTargetCalories} kcal target — the trend likely reflects intake, not the target. Keep the target, aim to eat closer to it, and review the next trend.`,
        trend,
        intake,
      }
    }
  }

  if (reductionOnFatLoss && intake.loggedDays < MIN_INTAKE_DAYS) {
    return {
      status: "insufficient_data",
      message: `${describeChange(trend)} You are not losing at the planned rate, but intake was logged on only ${intake.loggedDays} of 14 days. Log what you eat on at least ${MIN_INTAKE_DAYS} days before a lower target is suggested — the target may be fine and intake higher than planned.`,
      trend,
      intake,
    }
  }

  // Safety bounds: never below max(1200, BMR); total calibration within ±1000.
  const floor = Math.ceil(Math.max(MIN_TARGET_CALORIES, input.bmr) / 10) * 10
  let proposed = input.currentTargetCalories + direction * step
  if (direction < 0) proposed = Math.max(proposed, floor)
  const adjustmentAfter = input.currentAdjustmentKcal + (proposed - input.currentTargetCalories)
  if (Math.abs(adjustmentAfter) > MAX_CALIBRATION_ADJUSTMENT_KCAL) {
    proposed = input.currentTargetCalories + (Math.sign(adjustmentAfter) * MAX_CALIBRATION_ADJUSTMENT_KCAL - input.currentAdjustmentKcal)
  }
  const delta = proposed - input.currentTargetCalories

  if (Math.abs(delta) < MIN_USEFUL_CHANGE_KCAL) {
    return {
      status: "limit",
      message: `${describeChange(trend)} A further ${direction < 0 ? "reduction" : "increase"} would go past the limits this app suggests on its own (not below your estimated BMR, at most ±${MAX_CALIBRATION_ADJUSTMENT_KCAL} kcal from the estimate). Consider reviewing your settings or speaking with a qualified professional.`,
      trend,
      intake,
    }
  }

  const reason =
    direction < 0
      ? input.goal === "fat_loss"
        ? `slower loss than planned for ${goal}`
        : `${input.goal === "lean_bulk" ? "faster gain" : "a rise"} beyond the range expected for ${goal}`
      : input.goal === "fat_loss"
        ? `faster loss than planned for ${goal}`
        : `${input.goal === "lean_bulk" ? "slower gain" : "a drop"} beyond the range expected for ${goal}`

  return {
    status: "propose",
    message: `${describeChange(trend)} That is ${reason}. Consider ${delta < 0 ? "reducing" : "increasing"} your daily target by ${Math.abs(delta)} kcal and reviewing the next trend.`,
    trend,
    intake,
    currentTargetCalories: input.currentTargetCalories,
    proposedTargetCalories: proposed,
    deltaKcal: delta,
    uncertainty:
      intake.loggedDays >= MIN_INTAKE_DAYS
        ? null
        : `Intake was logged on only ${intake.loggedDays} of 14 days, so it isn't confirmed whether the trend comes from the target or from eating more or less than planned.`,
  }
}
