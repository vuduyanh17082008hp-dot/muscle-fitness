import { createHash } from "node:crypto"

import { addDaysIso } from "@/lib/nutrition/date-utils"
import { detectMilestones } from "@/lib/progress/milestones"
import { buildConsistencyDays, computeStreaks, localDateOfSession } from "@/lib/progress/streak"
import { buildGroundedSummary } from "@/lib/progress/summary"
import { buildThenVsNow } from "@/lib/progress/then-vs-now"
import type {
  BuildProgressJourneyInput,
  ProgressJourney,
  WeeklyProgressSnapshot,
} from "@/lib/progress/types"
import {
  enumerateDates,
  localDateInZone,
  mondayOf,
  sundayOf,
  weekIndexFromOrigin,
  WEEK_START_CONVENTION,
} from "@/lib/progress/week-boundary"

function snapshotId(subjectRef: string, weekStart: string): string {
  return `wk_${createHash("sha256").update(`${subjectRef}:${weekStart}`).digest("hex").slice(0, 16)}`
}

export function buildProgressJourney(input: BuildProgressJourneyInput): ProgressJourney {
  const computedAt = input.now.toISOString()
  const today = localDateInZone(input.now, input.timezone)
  const activityDates = [
    ...input.sessions.map((session) => localDateOfSession(session, input.timezone)),
    ...input.checkins.map((row) => row.date),
    input.plan ? localDateInZone(input.plan.createdAt, input.timezone) : null,
  ].filter((date): date is string => Boolean(date))

  if (activityDates.length === 0) {
    return {
      subjectRef: input.subjectRef,
      currentWeek: 0,
      currentStreak: 0,
      longestStreak: 0,
      currentWeekStats: { plannedSessions: 0, completedSessions: 0 },
      weeklySnapshots: [],
      milestones: [],
      thenVsNow: [],
      summaryEvidence: [],
      consistencyDays: [],
      recentConsistencyDays: [],
      groundedSummary:
        "You've only logged enough data for an early baseline so far. Keep logging your sessions and check-ins and this journey will become more useful over the next few weeks.",
      computedAt,
    }
  }

  const origin = mondayOf(activityDates.reduce((earliest, date) => (date < earliest ? date : earliest)))
  const currentWeekStart = mondayOf(today)
  const days = buildConsistencyDays({
    fromDate: origin,
    toDate: today,
    timeZone: input.timezone,
    sessions: input.sessions,
    checkins: input.checkins,
  })
  const { currentStreak, longestStreak } = computeStreaks(days)

  const weeklySnapshots: WeeklyProgressSnapshot[] = []
  for (
    let weekStart = origin, index = 1;
    weekStart <= currentWeekStart;
    weekStart = addDaysIso(weekStart, 7), index += 1
  ) {
    const periodEnd = sundayOf(weekStart)
    const weekDates = new Set(enumerateDates(weekStart, periodEnd < today ? periodEnd : today))
    const weekSessions = input.sessions.filter((session) => {
      const date = localDateOfSession(session, input.timezone)
      return date !== null && weekDates.has(date)
    })
    const planned = weekSessions.filter((session) => !session.restDay)
    const completed = planned.filter((session) => session.sessionState === "completed")
    const plannedSessions =
      planned.length > 0 ? planned.length : input.plan && index <= input.plan.weeks ? input.plan.daysPerWeek : 0
    const completedSessions = completed.length
    const trainingVolume = completed.reduce((sum, session) => {
      return session.volumeKg !== null && session.volumeKg !== undefined ? sum + session.volumeKg : sum
    }, 0)
    const hasVolume = completed.some((session) => session.volumeKg !== null && session.volumeKg !== undefined)
    const checkins = input.checkins.filter((row) => weekDates.has(row.date))
    const nutrition = input.nutritionDays.filter((row) => weekDates.has(row.date) && row.entryCount > 0)
    const nutritionPercents = nutrition
      .map((row) => row.proteinPercent)
      .filter((value): value is number => value !== null)

    const sourceRefs = [
      ...completed.map((session) => `VERIFIED_LOG:workout_sessions:${session.id}`),
      ...checkins.map((row) => `VERIFIED_LOG:recovery_checkins:${row.date}`),
      ...nutrition.map((row) => `VERIFIED_LOG:food_logs:${row.date}`),
    ]

    weeklySnapshots.push({
      snapshotId: snapshotId(input.subjectRef, weekStart),
      subjectRef: input.subjectRef,
      planVersionRef: input.plan ? `plan:${input.plan.id}:${input.plan.createdAt}` : undefined,
      weekIndex: weekIndexFromOrigin(weekStart, origin),
      periodStart: weekStart,
      periodEnd,
      timezone: input.timezone,
      weekStartConvention: WEEK_START_CONVENTION,
      plannedSessions,
      completedSessions,
      adherence:
        plannedSessions > 0 ? Math.round((completedSessions / plannedSessions) * 100) : undefined,
      trainingVolume: hasVolume ? Math.round(trainingVolume) : undefined,
      recoveryCheckins: checkins.length > 0 ? checkins.length : undefined,
      nutritionAdherence:
        nutritionPercents.length > 0
          ? Math.round(nutritionPercents.reduce((sum, value) => sum + value, 0) / nutritionPercents.length)
          : undefined,
      metricRefs: [],
      milestoneRefs: [],
      sourceRefs,
      computedAt,
    })
  }

  const thenVsNow = buildThenVsNow(weeklySnapshots)
  const milestones = detectMilestones({
    subjectRef: input.subjectRef,
    snapshots: weeklySnapshots,
    days,
    currentStreak,
  })
  const { summary, evidence } = buildGroundedSummary({
    snapshots: weeklySnapshots,
    comparisons: thenVsNow,
    currentStreak,
  })

  const current = weeklySnapshots.at(-1)
  return {
    subjectRef: input.subjectRef,
    currentWeek: current?.weekIndex ?? 0,
    currentStreak,
    longestStreak,
    currentWeekStats: {
      plannedSessions: current?.plannedSessions ?? 0,
      completedSessions: current?.completedSessions ?? 0,
      adherence: current?.adherence,
      trainingVolume: current?.trainingVolume,
    },
    weeklySnapshots,
    milestones,
    thenVsNow,
    summaryEvidence: evidence,
    consistencyDays: days.slice(-84),
    recentConsistencyDays: days.slice(-14),
    groundedSummary: summary,
    computedAt,
  }
}
