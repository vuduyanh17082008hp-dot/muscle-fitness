export type PainIllness = "no" | "minor" | "yes"

export type RecoveryCheckinInput = {
  sleepHours: number | null
  sleepQuality: number | null
  stress: number | null
  fatigue: number | null
  soreness: number | null
  mood: number | null
  readiness: number | null
  restingHr: number | null
  steps: number | null
  painIllness: PainIllness
  notes: string | null
}

export type RecoveryStatus =
  | "ready"
  | "good"
  | "moderate"
  | "priority"

export type RecoveryDriver = {
  key: "sleep" | "stress" | "fatigue" | "soreness" | "moodReadiness"
  label: string
  score: number
  weight: number
  available: boolean
}

export type RecoveryBaseline = {
  averageScore: number
  sampleSize: number
  deltaFromToday: number
  trend: "above" | "below" | "similar"
}

export type RecoveryScoreResult = {
  score: number | null
  status: RecoveryStatus | null
  drivers: RecoveryDriver[]
  missingInputs: string[]
  baseline: RecoveryBaseline | null
}

export type RecoveryCheckinRow = {
  id: string
  user_id: string
  checkin_date: string
  sleep_hours: number | null
  sleep_quality: number | null
  stress: number | null
  fatigue: number | null
  soreness: number | null
  mood: number | null
  readiness: number | null
  resting_hr: number | null
  steps: number | null
  pain_illness: PainIllness
  notes: string | null
  recovery_score: number | null
  score_breakdown: RecoveryDriver[] | null
  created_at: string
  updated_at: string
}

export type TrainingLoadState = "green" | "amber" | "red"

export type TrainingLoadSummary = {
  state: TrainingLoadState
  reason: string
  sessionsLast7Days: number
  restDaysLast7Days: number
  averageSessionRpe: number | null
  totalVolumeKgLast7Days: number | null
  lastSessionDaysAgo: number | null
}
