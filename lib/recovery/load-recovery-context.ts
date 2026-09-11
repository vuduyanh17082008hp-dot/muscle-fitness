import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { computeRecoveryScore } from "@/lib/recovery/score"
import { computeTrainingLoad, type RecentSessionRow } from "@/lib/recovery/training-load"
import type {
  RecoveryCheckinInput,
  RecoveryCheckinRow,
  RecoveryScoreResult,
  TrainingLoadSummary,
} from "@/lib/recovery/types"

export type RecoveryTrendPoint = {
  date: string
  score: number | null
  sleepHours: number | null
  stress: number | null
  fatigue: number | null
  soreness: number | null
  readiness: number | null
}

export type RecoveryAverages = {
  score: number | null
  sleepHours: number | null
  stress: number | null
  fatigue: number | null
  soreness: number | null
  readiness: number | null
  sampleSize: number
}

export type RecoveryContext = {
  today: RecoveryCheckinRow | null
  todayScoreResult: RecoveryScoreResult
  trend30Days: RecoveryTrendPoint[]
  averages7Days: RecoveryAverages
  averages30Days: RecoveryAverages
  trainingLoad: TrainingLoadSummary
}

function toCheckinInput(row: RecoveryCheckinRow | null): RecoveryCheckinInput {
  return {
    sleepHours: row?.sleep_hours ?? null,
    sleepQuality: row?.sleep_quality ?? null,
    stress: row?.stress ?? null,
    fatigue: row?.fatigue ?? null,
    soreness: row?.soreness ?? null,
    mood: row?.mood ?? null,
    readiness: row?.readiness ?? null,
    restingHr: row?.resting_hr ?? null,
    steps: row?.steps ?? null,
    painIllness: row?.pain_illness ?? "no",
    notes: row?.notes ?? null,
  }
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null)

  if (present.length === 0) return null

  return (
    Math.round(
      (present.reduce((sum, value) => sum + value, 0) / present.length) * 10,
    ) / 10
  )
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function loadRecoveryContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<RecoveryContext> {
  const [checkinsResponse, sessionsResponse] = await Promise.all([
    supabase
      .from("recovery_checkins")
      .select(
        "id, user_id, checkin_date, sleep_hours, sleep_quality, stress, fatigue, soreness, mood, readiness, resting_hr, steps, pain_illness, notes, recovery_score, score_breakdown, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("checkin_date", { ascending: false })
      .limit(30),

    supabase
      .from("workout_sessions")
      .select("completed_at, session_rpe, total_volume_kg")
      .eq("user_id", userId)
      .eq("session_state", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ])

  if (checkinsResponse.error) {
    console.warn(
      "[RECOVERY] Unable to load recovery_checkins:",
      checkinsResponse.error.message,
    )
  }

  if (sessionsResponse.error) {
    console.warn(
      "[RECOVERY] Unable to load workout_sessions for training load:",
      sessionsResponse.error.message,
    )
  }

  const checkins: RecoveryCheckinRow[] =
    (checkinsResponse.data as RecoveryCheckinRow[] | null) ?? []

  const sessions: RecentSessionRow[] =
    (sessionsResponse.data as RecentSessionRow[] | null) ?? []

  const today =
    checkins.find((row) => row.checkin_date === todayIso()) ?? null

  const history = checkins
    .filter((row) => row.checkin_date !== todayIso())
    .map((row) => ({ score: row.recovery_score }))

  const todayScoreResult = computeRecoveryScore(
    toCheckinInput(today),
    history,
  )

  const trend30Days: RecoveryTrendPoint[] = [...checkins]
    .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date))
    .map((row) => ({
      date: row.checkin_date,
      score:
        row.checkin_date === today?.checkin_date
          ? todayScoreResult.score
          : row.recovery_score,
      sleepHours: row.sleep_hours,
      stress: row.stress,
      fatigue: row.fatigue,
      soreness: row.soreness,
      readiness: row.readiness,
    }))

  const last7 = trend30Days.slice(-7)

  const averages7Days: RecoveryAverages = {
    score: average(last7.map((row) => row.score)),
    sleepHours: average(last7.map((row) => row.sleepHours)),
    stress: average(last7.map((row) => row.stress)),
    fatigue: average(last7.map((row) => row.fatigue)),
    soreness: average(last7.map((row) => row.soreness)),
    readiness: average(last7.map((row) => row.readiness)),
    sampleSize: last7.length,
  }

  const averages30Days: RecoveryAverages = {
    score: average(trend30Days.map((row) => row.score)),
    sleepHours: average(trend30Days.map((row) => row.sleepHours)),
    stress: average(trend30Days.map((row) => row.stress)),
    fatigue: average(trend30Days.map((row) => row.fatigue)),
    soreness: average(trend30Days.map((row) => row.soreness)),
    readiness: average(trend30Days.map((row) => row.readiness)),
    sampleSize: trend30Days.length,
  }

  const trainingLoad = computeTrainingLoad(sessions, todayScoreResult.score)

  return {
    today,
    todayScoreResult,
    trend30Days,
    averages7Days,
    averages30Days,
    trainingLoad,
  }
}
