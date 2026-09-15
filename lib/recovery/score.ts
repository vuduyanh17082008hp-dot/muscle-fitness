import type {
  RecoveryBaseline,
  RecoveryCheckinInput,
  RecoveryDriver,
  RecoveryScoreResult,
  RecoveryStatus,
} from "@/lib/recovery/types"

/**
 * Deterministic recovery scoring engine.
 *
 * This is the ONLY place a recovery score is calculated. Groq / Dante
 * never invents or adjusts this number — it only explains it.
 */

const WEIGHTS = {
  sleep: 0.3,
  stress: 0.2,
  fatigue: 0.2,
  soreness: 0.15,
  moodReadiness: 0.15,
} as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Accept only finite values inside the documented 1–10 check-in scale. */
function validScale10(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 1 && value <= 10
}

/** Accept only finite sleep duration within a calendar day. */
function validSleepHours(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 && value <= 24
}

/** 1–10 scale where a HIGH value is bad (stress, fatigue, soreness). */
function invertedScale10(value: number) {
  return clamp((11 - value) * 10, 0, 100)
}

/** 1–10 scale where a HIGH value is good (mood, readiness, sleep quality). */
function directScale10(value: number) {
  return clamp(value * 10, 0, 100)
}

function sleepHoursScore(hours: number) {
  if (hours >= 7 && hours <= 9) {
    return 100
  }

  const deviation =
    hours < 7 ? 7 - hours : hours - 9

  return clamp(100 - deviation * 14, 0, 100)
}

export function statusForScore(score: number): RecoveryStatus {
  if (score >= 85) return "ready"
  if (score >= 70) return "good"
  if (score >= 50) return "moderate"
  return "priority"
}

export const RECOVERY_STATUS_LABEL: Record<RecoveryStatus, string> = {
  ready: "Ready",
  good: "Good",
  moderate: "Moderate",
  priority: "Recovery Priority",
}

function buildDrivers(input: RecoveryCheckinInput): RecoveryDriver[] {
  const drivers: RecoveryDriver[] = []

  // ---- Sleep (hours + quality combined) ----
  const sleepParts: number[] = []

  if (validSleepHours(input.sleepHours)) {
    sleepParts.push(sleepHoursScore(input.sleepHours))
  }

  if (validScale10(input.sleepQuality)) {
    sleepParts.push(directScale10(input.sleepQuality))
  }

  drivers.push({
    key: "sleep",
    label: "Sleep",
    score:
      sleepParts.length > 0
        ? Math.round(
            sleepParts.reduce((sum, value) => sum + value, 0) /
              sleepParts.length,
          )
        : 0,
    weight: WEIGHTS.sleep,
    available: sleepParts.length > 0,
  })

  // ---- Stress ----
  drivers.push({
    key: "stress",
    label: "Stress",
    score: validScale10(input.stress)
      ? Math.round(invertedScale10(input.stress))
      : 0,
    weight: WEIGHTS.stress,
    available: validScale10(input.stress),
  })

  // ---- Fatigue ----
  drivers.push({
    key: "fatigue",
    label: "Fatigue",
    score: validScale10(input.fatigue)
      ? Math.round(invertedScale10(input.fatigue))
      : 0,
    weight: WEIGHTS.fatigue,
    available: validScale10(input.fatigue),
  })

  // ---- Soreness ----
  drivers.push({
    key: "soreness",
    label: "Soreness",
    score: validScale10(input.soreness)
      ? Math.round(invertedScale10(input.soreness))
      : 0,
    weight: WEIGHTS.soreness,
    available: validScale10(input.soreness),
  })

  // ---- Mood / readiness combined ----
  const moodReadinessParts: number[] = []

  if (validScale10(input.mood)) {
    moodReadinessParts.push(directScale10(input.mood))
  }

  if (validScale10(input.readiness)) {
    moodReadinessParts.push(directScale10(input.readiness))
  }

  drivers.push({
    key: "moodReadiness",
    label: "Mood & readiness",
    score:
      moodReadinessParts.length > 0
        ? Math.round(
            moodReadinessParts.reduce((sum, value) => sum + value, 0) /
              moodReadinessParts.length,
          )
        : 0,
    weight: WEIGHTS.moodReadiness,
    available: moodReadinessParts.length > 0,
  })

  return drivers
}

function missingInputLabels(input: RecoveryCheckinInput): string[] {
  const missing: string[] = []

  if (!validSleepHours(input.sleepHours) && !validScale10(input.sleepQuality)) {
    missing.push("sleep")
  }

  if (!validScale10(input.stress)) missing.push("stress")
  if (!validScale10(input.fatigue)) missing.push("fatigue")
  if (!validScale10(input.soreness)) missing.push("soreness")

  if (!validScale10(input.mood) && !validScale10(input.readiness)) {
    missing.push("mood/readiness")
  }

  return missing
}

/**
 * Computes today's recovery score (0–100) from whatever inputs are
 * available. Missing categories are excluded and the remaining
 * weights are renormalised — never fabricated.
 */
export function computeRecoveryScore(
  input: RecoveryCheckinInput,
  history: Array<{ score: number | null }> = [],
): RecoveryScoreResult {
  const drivers = buildDrivers(input)
  const availableDrivers = drivers.filter((driver) => driver.available)

  if (availableDrivers.length === 0) {
    return {
      score: null,
      status: null,
      drivers,
      missingInputs: missingInputLabels(input),
      baseline: null,
    }
  }

  const totalWeight = availableDrivers.reduce(
    (sum, driver) => sum + driver.weight,
    0,
  )

  const weightedSum = availableDrivers.reduce(
    (sum, driver) => sum + driver.score * (driver.weight / totalWeight),
    0,
  )

  const score = Math.round(clamp(weightedSum, 0, 100))
  const status = statusForScore(score)

  const baseline = computeBaseline(score, history)

  return {
    score,
    status,
    drivers,
    missingInputs: missingInputLabels(input),
    baseline,
  }
}

function computeBaseline(
  todayScore: number,
  history: Array<{ score: number | null }>,
): RecoveryBaseline | null {
  const scores = history
    .map((entry) => entry.score)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0 && value <= 100)

  if (scores.length < 3) {
    return null
  }

  const averageScore =
    scores.reduce((sum, value) => sum + value, 0) / scores.length

  const deltaFromToday = todayScore - averageScore

  const trend: RecoveryBaseline["trend"] =
    deltaFromToday > 4
      ? "above"
      : deltaFromToday < -4
        ? "below"
        : "similar"

  return {
    averageScore: Math.round(averageScore),
    sampleSize: scores.length,
    deltaFromToday: Math.round(deltaFromToday),
    trend,
  }
}
