import { createHash } from "node:crypto"

import type {
  ConsistencyDay,
  ProgressMilestone,
  ProgressMilestoneType,
  WeeklyProgressSnapshot,
} from "@/lib/progress/types"

const COPY: Record<ProgressMilestoneType, { title: string; description: string }> = {
  FIRST_WEEK_COMPLETE: {
    title: "First week complete",
    description: "You finished the planned sessions in a full week.",
  },
  SEVEN_DAY_STREAK: {
    title: "7-day consistency streak",
    description: "A week of showing up for the plan.",
  },
  FOURTEEN_DAY_STREAK: {
    title: "14-day consistency",
    description: "Two weeks of planned actions completed.",
  },
  THIRTY_DAY_STREAK: {
    title: "30-day consistency",
    description: "A month of showing up for the plan.",
  },
  FOUR_WEEKS_COMPLETE: {
    title: "Four weeks on the board",
    description: "Four weeks with enough logged history to compare.",
  },
  ADHERENCE_IMPROVED: {
    title: "Adherence improved",
    description: "A higher share of planned sessions than your first comparable week.",
  },
  RECOVERY_CONSISTENCY: {
    title: "Recovery check-ins stacking",
    description: "Seven check-ins in seven days.",
  },
  RETURN_AFTER_MISS: {
    title: "Back on the board",
    description: "A miss happened, then you picked the plan back up.",
  },
  FIRST_VERIFIED_PR: {
    title: "First verified PR",
    description: "A new estimated 1RM appeared in your logged sets.",
  },
}

function milestone(
  subjectRef: string,
  type: ProgressMilestoneType,
  achievedAt: string,
  evidenceRefs: string[],
  metricRefs: string[] = [],
): ProgressMilestone {
  return {
    milestoneId: `ms_${createHash("sha256").update(`${subjectRef}:${type}:${achievedAt}`).digest("hex").slice(0, 20)}`,
    subjectRef,
    type,
    achievedAt,
    evidenceRefs,
    metricRefs,
    displayData: COPY[type],
  }
}

export function detectMilestones(input: {
  subjectRef: string
  snapshots: WeeklyProgressSnapshot[]
  days: ConsistencyDay[]
  currentStreak: number
}): ProgressMilestone[] {
  const found: ProgressMilestone[] = []
  const completeWeeks = input.snapshots.filter(
    (week) => week.plannedSessions > 0 && week.completedSessions >= week.plannedSessions,
  )

  const firstComplete = completeWeeks[0]
  if (firstComplete) {
    found.push(
      milestone(
        input.subjectRef,
        "FIRST_WEEK_COMPLETE",
        firstComplete.periodEnd,
        firstComplete.sourceRefs,
        [firstComplete.snapshotId],
      ),
    )
  }

  const lastDay = input.days[input.days.length - 1]
  const streakDate = lastDay?.date ?? input.snapshots.at(-1)?.periodEnd ?? ""
  if (input.currentStreak >= 7) {
    found.push(milestone(input.subjectRef, "SEVEN_DAY_STREAK", streakDate, [`streak:${input.currentStreak}`]))
  }
  if (input.currentStreak >= 14) {
    found.push(milestone(input.subjectRef, "FOURTEEN_DAY_STREAK", streakDate, [`streak:${input.currentStreak}`]))
  }
  if (input.currentStreak >= 30) {
    found.push(milestone(input.subjectRef, "THIRTY_DAY_STREAK", streakDate, [`streak:${input.currentStreak}`]))
  }

  if (input.snapshots.length >= 4) {
    const fourth = input.snapshots[3]
    found.push(
      milestone(input.subjectRef, "FOUR_WEEKS_COMPLETE", fourth.periodEnd, fourth.sourceRefs, [fourth.snapshotId]),
    )
  }

  const firstAdherence = input.snapshots.find((week) => week.adherence !== undefined)
  const latestAdherence = [...input.snapshots].reverse().find((week) => week.adherence !== undefined)
  if (
    firstAdherence &&
    latestAdherence &&
    firstAdherence.snapshotId !== latestAdherence.snapshotId &&
    (latestAdherence.adherence ?? 0) > (firstAdherence.adherence ?? 0)
  ) {
    found.push(
      milestone(
        input.subjectRef,
        "ADHERENCE_IMPROVED",
        latestAdherence.periodEnd,
        [...firstAdherence.sourceRefs, ...latestAdherence.sourceRefs],
        [firstAdherence.snapshotId, latestAdherence.snapshotId],
      ),
    )
  }

  for (let index = 6; index < input.days.length; index += 1) {
    const window = input.days.slice(index - 6, index + 1)
    if (window.filter((day) => day.status === "CHECKIN_COMPLETE" || day.evidenceRefs.some((ref) => ref.includes("recovery_checkins"))).length >= 7) {
      found.push(
        milestone(
          input.subjectRef,
          "RECOVERY_CONSISTENCY",
          window[6].date,
          window.flatMap((day) => day.evidenceRefs),
        ),
      )
      break
    }
  }

  const missIndex = input.days.findIndex((day) => day.status === "MISSED")
  if (missIndex >= 0) {
    const returned = input.days.slice(missIndex + 1).find((day) => day.countsTowardStreak && day.status !== "NO_REQUIREMENT")
    if (returned) {
      found.push(
        milestone(input.subjectRef, "RETURN_AFTER_MISS", returned.date, [
          ...input.days[missIndex].evidenceRefs,
          ...returned.evidenceRefs,
        ]),
      )
    }
  }

  return found
}
