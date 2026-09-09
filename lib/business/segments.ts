import type { ChurnAssessment } from "@/lib/churn-risk"
import {
  SEGMENT_KEYS,
  SEGMENT_LABELS,
  type AssessedMember,
  type GymMember,
  type SegmentKey,
  type SegmentSummary,
} from "@/lib/business/types"

export const SEGMENT_DESCRIPTIONS: Record<SegmentKey, string> = {
  "new-members":
    "Joined within the last 30 days. Their first six weeks decide whether they stay.",

  "highly-engaged":
    "Training consistently and using the app. The base your retention rests on.",

  "strength-focused":
    "Training for strength or muscle gain. Responds well to programme progression.",

  "weight-loss":
    "Weight-loss goal. Motivation tends to track visible progress, not effort.",

  casual:
    "Attending occasionally. Not yet at risk, but no habit has formed either.",

  "at-risk":
    "Behavioural signals point towards disengagement. Needs attention this week.",

  dormant:
    "No visit in over 30 days. Recovery is possible but the window is closing.",

  "pt-potential":
    "Trains frequently but does not currently use personal training services.",
}

export const SEGMENT_ACTIONS: Record<SegmentKey, string> = {
  "new-members":
    "Book a week-two check-in and confirm their starting programme fits their schedule.",

  "highly-engaged":
    "Invite to a referral or community programme — this group recruits best.",

  "strength-focused":
    "Offer a progression review; stalled lifts are the usual reason this group leaves.",

  "weight-loss":
    "Shift the reported metric away from scale weight towards measurable performance.",

  casual:
    "Offer a low-friction commitment: two fixed sessions per week for four weeks.",

  "at-risk":
    "Send a personalised check-in from a named coach before offering any discount.",

  dormant:
    "Run a seven-day return challenge with a specific booked session, not a generic offer.",

  "pt-potential":
    "Offer a complimentary consultation — frequency is already there, coaching is not.",
}

export function resolveSegments(
  member: GymMember,
  assessment: ChurnAssessment,
): SegmentKey[] {
  const segments: SegmentKey[] = []
  const { signals } = member

  if (member.joinedDaysAgo <= 30) {
    segments.push("new-members")
  }

  if (signals.engagementScore >= 0.7 && signals.sessions30d >= 10) {
    segments.push("highly-engaged")
  }

  if (member.goal === "Strength" || member.goal === "Muscle gain") {
    segments.push("strength-focused")
  }

  if (member.goal === "Weight loss") {
    segments.push("weight-loss")
  }

  if (
    signals.sessions30d > 0 &&
    signals.sessions30d <= 5 &&
    assessment.riskLevel !== "high"
  ) {
    segments.push("casual")
  }

  if (assessment.riskLevel !== "low") {
    segments.push("at-risk")
  }

  if (signals.daysSinceLastVisit >= 30) {
    segments.push("dormant")
  }

  if (signals.sessions30d >= 8 && !member.usesPersonalTraining) {
    segments.push("pt-potential")
  }

  return segments
}

export function summariseSegments(
  members: AssessedMember[],
): SegmentSummary[] {
  const base = members.length || 1

  return SEGMENT_KEYS.map((key) => {
    const matching = members.filter((member) =>
      member.segments.includes(key),
    )

    const averageRisk =
      matching.length > 0
        ? Math.round(
            matching.reduce(
              (total, member) => total + member.assessment.riskScore,
              0,
            ) / matching.length,
          )
        : 0

    return {
      key,
      label: SEGMENT_LABELS[key],
      description: SEGMENT_DESCRIPTIONS[key],
      memberCount: matching.length,
      shareOfBase: Math.round((matching.length / base) * 100),
      averageRisk,

      monthlyValue: matching.reduce(
        (total, member) => total + member.monthlyValue,
        0,
      ),

      recommendedAction: SEGMENT_ACTIONS[key],
    }
  }).sort((a, b) => b.memberCount - a.memberCount)
}

export function isSegmentKey(value: string): value is SegmentKey {
  return (SEGMENT_KEYS as readonly string[]).includes(value)
}
