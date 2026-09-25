import type { ProgressComparison, ProgressEvidence, WeeklyProgressSnapshot } from "@/lib/progress/types"

export function buildGroundedSummary(input: {
  snapshots: WeeklyProgressSnapshot[]
  comparisons: ProgressComparison[]
  currentStreak: number
}): { summary: string; evidence: ProgressEvidence[] } {
  const evidence: ProgressEvidence[] = []
  if (input.snapshots.length === 0) {
    return {
      summary:
        "You've only logged enough data for an early baseline so far. Keep logging your sessions and check-ins and this journey will become more useful over the next few weeks.",
      evidence: [],
    }
  }

  if (input.snapshots.length === 1) {
    const week = input.snapshots[0]
    evidence.push({
      evidenceId: "baseline-week",
      statement: `Week ${week.weekIndex} is an early baseline.`,
      sourceRefs: week.sourceRefs,
    })
    return {
      summary:
        "You've only logged enough data for an early baseline so far. Keep logging your sessions and check-ins and this journey will become more useful over the next few weeks.",
      evidence,
    }
  }

  const parts: string[] = []
  const adherence = input.comparisons.find((item) => item.metricId === "training_adherence")
  if (adherence && adherence.nowValue > adherence.thenValue) {
    parts.push(
      `You completed a higher share of your planned sessions than in Week ${adherence.thenLabel.replace("Week ", "")}.`,
    )
    evidence.push({
      evidenceId: "adherence-up",
      statement: "Training adherence improved versus the first comparable week.",
      sourceRefs: adherence.evidenceRefs,
    })
  }

  const recovery = input.comparisons.find((item) => item.metricId === "recovery_checkins")
  if (recovery && recovery.nowValue === recovery.thenValue) {
    parts.push("Recovery check-ins stayed stable.")
    evidence.push({
      evidenceId: "recovery-stable",
      statement: "Recovery check-in count matched the first comparable week.",
      sourceRefs: recovery.evidenceRefs,
    })
  } else if (recovery && recovery.nowValue > recovery.thenValue) {
    parts.push("Recovery check-ins increased.")
    evidence.push({
      evidenceId: "recovery-up",
      statement: "More recovery check-ins than the first comparable week.",
      sourceRefs: recovery.evidenceRefs,
    })
  }

  if (input.currentStreak >= 2) {
    parts.push(`Consistency is currently at ${input.currentStreak} days.`)
    evidence.push({
      evidenceId: "streak",
      statement: "Current consistency streak is computed from planned-day completion.",
      sourceRefs: [`streak:${input.currentStreak}`],
    })
  }

  if (parts.length === 0) {
    return {
      summary:
        "We need a little more logged history before we can compare your journey.",
      evidence,
    }
  }

  const lead =
    adherence && adherence.nowValue > adherence.thenValue
      ? "Your biggest improvement in this window has been consistency. "
      : ""

  return {
    summary: `${lead}${parts.join(" ")}`.trim(),
    evidence,
  }
}
