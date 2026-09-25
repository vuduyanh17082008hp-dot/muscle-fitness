import { resolveProgressMotivation, type MotivationContext } from "@/lib/motivation"
import { buildQuickInsights, weekStrip, type QuickInsight, type WeekDot } from "@/lib/progress/insights"
import { buildConsistencyLevel, type ConsistencyLevel } from "@/lib/progress/level"
import type { MuscleFocusSnapshot } from "@/lib/progress/muscle-focus"
import { isRecentPr, type PersonalRecord } from "@/lib/progress/personal-records"
import {
  catalogWithUnlocks,
  formatGoal,
  heatmapInsight,
  heatmapWindow,
  journeySentence,
  nextMilestone,
  previousWeekVolumeDelta,
  rhythmNote,
  weeklyRhythm,
  type HeatmapInsight,
  type NextMilestone,
  type RhythmRow,
} from "@/lib/progress/presentation"
import { localDateOfSession } from "@/lib/progress/streak"
import type {
  ConsistencyDay,
  ProgressJourney,
  ProgressMilestone,
  ProgressMilestoneType,
  ProgressSessionRow,
} from "@/lib/progress/types"

export type ProgressMacroRing = {
  label: "Calories" | "Protein" | "Carbs" | "Fat"
  consumed: number
  target: number | null
  unit: string
}

export type ProgressNutritionModel = {
  available: boolean
  unavailable: boolean
  rings: ProgressMacroRing[]
}

export type ProgressBodyModel = {
  weightKg: number | null
  heightCm: number | null
  bmi: number | null
  goal: string | null
}

export type ProgressCatalogItem = {
  type: ProgressMilestoneType
  title: string
  description: string
  threshold: string
  unlocked: ProgressMilestone | null
}

export type ProgressPageModel = {
  localDate: string
  timezone: string
  journey: ProgressJourney
  sentence: string
  next: NextMilestone | null
  heatmapDays: ConsistencyDay[]
  heatmap: HeatmapInsight
  rhythm: RhythmRow[]
  rhythmNote: string | null
  muscle: MuscleFocusSnapshot | null
  catalog: ProgressCatalogItem[]
  nutrition: ProgressNutritionModel
  body: ProgressBodyModel
  motivationContexts: MotivationContext[]
  thenVsNowRange: string | null
  adherenceDelta: number | null
  volumeDeltaPercent: number | null
  weekDots: WeekDot[]
  level: ConsistencyLevel
  insights: QuickInsight[]
  personalRecords: PersonalRecord[]
  restToday: boolean
}

export function buildProgressPageModel(input: {
  journey: ProgressJourney
  sessions: ProgressSessionRow[]
  timezone: string
  localDate: string
  muscle: MuscleFocusSnapshot | null
  nutrition: ProgressNutritionModel
  body: Omit<ProgressBodyModel, "goal"> & { goal: string | null }
  personalRecords?: PersonalRecord[]
}): ProgressPageModel {
  const { journey } = input
  const adherence = journey.thenVsNow.find((item) => item.metricId === "training_adherence")
  const first = journey.weeklySnapshots[0]
  const last = journey.weeklySnapshots[journey.weeklySnapshots.length - 1]
  const todayRhythm = weeklyRhythm({
    sessions: input.sessions,
    timeZone: input.timezone,
    localDate: input.localDate,
    localDateOfSession,
  })
  const restToday = input.sessions.some((session) => {
    const date = localDateOfSession(session, input.timezone)
    return date === input.localDate && session.restDay
  })
  const personalRecords = input.personalRecords ?? []
  const catalog = catalogWithUnlocks(journey.milestones).map((item) => ({
    ...item,
    unlocked: item.unlocked ?? null,
  }))
  if (personalRecords.length > 0) {
    const first = [...personalRecords].sort((a, b) => a.achievedAt.localeCompare(b.achievedAt))[0]
    const prIndex = catalog.findIndex((item) => item.type === "FIRST_VERIFIED_PR")
    if (prIndex >= 0 && first) {
      catalog[prIndex] = {
        ...catalog[prIndex],
        unlocked: {
          milestoneId: "first-verified-pr",
          subjectRef: journey.subjectRef,
          type: "FIRST_VERIFIED_PR",
          achievedAt: first.achievedAt,
          evidenceRefs: [`VERIFIED_LOG:exercise_sets:${first.exerciseId}`],
          displayData: { title: "First verified PR", description: "A new estimated 1RM appeared in your logged sets." },
        },
      }
    }
  }

  return {
    localDate: input.localDate,
    timezone: input.timezone,
    journey,
    sentence: journeySentence(journey, restToday),
    next: nextMilestone(journey),
    heatmapDays: heatmapWindow(journey.consistencyDays, input.localDate),
    heatmap: heatmapInsight(journey.consistencyDays),
    rhythm: todayRhythm,
    rhythmNote: rhythmNote(todayRhythm),
    muscle: input.muscle,
    catalog,
    nutrition: input.nutrition,
    body: {
      ...input.body,
      goal: formatGoal(input.body.goal),
    },
    motivationContexts: resolveProgressMotivation({
      currentStreak: journey.currentStreak,
      milestoneTypes: [
        ...journey.milestones.map((item) => item.type),
        ...(personalRecords.length > 0 ? ["FIRST_VERIFIED_PR"] : []),
      ],
      adherenceImproved: journey.milestones.some((item) => item.type === "ADHERENCE_IMPROVED"),
      restDayCompleted: restToday,
      hasNewPr: isRecentPr(personalRecords, input.localDate),
    }),
    thenVsNowRange:
      first && last && first.weekIndex !== last.weekIndex
        ? `Week ${first.weekIndex} → Week ${last.weekIndex}`
        : null,
    adherenceDelta: adherence?.delta ?? null,
    volumeDeltaPercent: previousWeekVolumeDelta(journey),
    weekDots: weekStrip(journey.consistencyDays, input.localDate),
    level: buildConsistencyLevel({
      days: journey.consistencyDays,
      milestoneCount: catalog.filter((item) => item.unlocked).length,
    }),
    insights: buildQuickInsights({
      days: journey.consistencyDays,
      snapshots: journey.weeklySnapshots,
      sessions: input.sessions,
    }),
    personalRecords,
    restToday,
  }
}

export function bodyMassIndex(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return null
  const meters = heightCm / 100
  return Math.round((weightKg / (meters * meters)) * 10) / 10
}
