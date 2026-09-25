export type ConsistencyDayStatus =
  | "TRAINING_COMPLETE"
  | "RECOVERY_COMPLETE"
  | "CHECKIN_COMPLETE"
  | "MISSED"
  | "NO_REQUIREMENT"

export type ConsistencyDay = {
  date: string
  status: ConsistencyDayStatus
  countsTowardStreak: boolean
  evidenceRefs: string[]
}

export type WeeklyProgressSnapshot = {
  snapshotId: string
  subjectRef: string
  planVersionRef?: string
  weekIndex: number
  periodStart: string
  periodEnd: string
  timezone: string
  weekStartConvention: "monday"
  plannedSessions: number
  completedSessions: number
  adherence?: number
  trainingVolume?: number
  recoveryCheckins?: number
  nutritionAdherence?: number
  metricRefs: string[]
  milestoneRefs: string[]
  sourceRefs: string[]
  computedAt: string
}

export type ProgressMilestoneType =
  | "FIRST_WEEK_COMPLETE"
  | "SEVEN_DAY_STREAK"
  | "FOURTEEN_DAY_STREAK"
  | "THIRTY_DAY_STREAK"
  | "FOUR_WEEKS_COMPLETE"
  | "ADHERENCE_IMPROVED"
  | "RECOVERY_CONSISTENCY"
  | "RETURN_AFTER_MISS"
  | "FIRST_VERIFIED_PR"

export type ProgressMilestone = {
  milestoneId: string
  subjectRef: string
  type: ProgressMilestoneType
  achievedAt: string
  evidenceRefs: string[]
  metricRefs?: string[]
  displayData: {
    title: string
    description?: string
  }
}

export type ProgressComparison = {
  metricId: string
  label: string
  thenLabel: string
  nowLabel: string
  thenValue: number
  nowValue: number
  unit?: string
  delta?: number
  deltaKind?: "points" | "absolute" | "percent"
  series?: number[]
  evidenceRefs: string[]
}

export type ProgressEvidence = {
  evidenceId: string
  statement: string
  sourceRefs: string[]
}

export type ProgressJourney = {
  subjectRef: string
  currentWeek: number
  currentStreak: number
  longestStreak: number
  currentWeekStats: {
    plannedSessions: number
    completedSessions: number
    adherence?: number
    trainingVolume?: number
  }
  weeklySnapshots: WeeklyProgressSnapshot[]
  milestones: ProgressMilestone[]
  thenVsNow: ProgressComparison[]
  summaryEvidence: ProgressEvidence[]
  consistencyDays: ConsistencyDay[]
  recentConsistencyDays: ConsistencyDay[]
  groundedSummary: string
  computedAt: string
}

export type ProgressSessionRow = {
  id: string
  scheduledFor: string | null
  completedAt: string | null
  sessionState: string
  restDay: boolean
  name?: string | null
  focus?: string | null
  volumeKg?: number | null
  durationMinutes?: number | null
}

export type ProgressCheckinRow = {
  date: string
  score: number | null
}

export type ProgressNutritionRow = {
  date: string
  entryCount: number
  proteinPercent: number | null
}

export type ProgressPlanContext = {
  id: string
  createdAt: string
  daysPerWeek: number
  weeks: number
  name: string | null
}

export type BuildProgressJourneyInput = {
  subjectRef: string
  timezone: string
  now: Date
  plan: ProgressPlanContext | null
  sessions: ProgressSessionRow[]
  checkins: ProgressCheckinRow[]
  nutritionDays: ProgressNutritionRow[]
}
