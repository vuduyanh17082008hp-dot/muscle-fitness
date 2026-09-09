/**
 * Transparent behavioural churn-risk scoring.
 *
 * This is deliberately NOT a trained machine-learning model. It is a
 * weighted, inspectable heuristic over observed member behaviour, so a
 * manager can always see exactly why a member scored the way they did.
 *
 * Generative AI is layered on top of this score (explanation, recommended
 * actions, campaign copy) — it never produces the score itself. That split
 * keeps the number consistent and auditable while still giving managers a
 * readable interpretation.
 */

export const CHURN_RISK_WEIGHTS = {
  inactivity: 0.35,
  sessionDecline: 0.25,
  adherence: 0.2,
  engagement: 0.15,
  progress: 0.05,
} as const

export type ChurnFactorKey = keyof typeof CHURN_RISK_WEIGHTS

export type RiskLevel = "low" | "moderate" | "high"

/**
 * Behavioural signals only. Deliberately excludes names, contact details
 * and other personal data so the same payload can be sent to an AI model
 * without over-sharing member information.
 */
export type ChurnSignals = {
  daysSinceLastVisit: number
  sessions30d: number
  sessionsPrevious30d: number
  workoutAdherence: number
  previousWorkoutAdherence: number
  engagementScore: number
  previousEngagementScore: number
  hasRecentProgressSignal: boolean
}

export type ChurnFactor = {
  key: ChurnFactorKey
  label: string
  detail: string
  /** 0–1, where 1 is the worst possible reading for this factor. */
  severity: number
  weight: number
  /** Points this factor contributed to the final 0–100 score. */
  contribution: number
}

export type ChurnAssessment = {
  riskScore: number
  riskLevel: RiskLevel
  factors: ChurnFactor[]
  /** Highest-contribution factors first, useful for summaries. */
  topFactors: ChurnFactor[]
}

/** Days of absence at which inactivity is treated as maximally severe. */
const INACTIVITY_CEILING_DAYS = 21

/** Absences below this are normal rest, not a warning sign. */
const INACTIVITY_FLOOR_DAYS = 3

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }

  return Math.min(Math.max(value, 0), 1)
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals

  return Math.round(value * factor) / factor
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function describeDecline(
  current: number,
  previous: number,
): string {
  if (previous <= 0) {
    return "no prior baseline"
  }

  const change = (current - previous) / previous

  if (change >= 0.05) {
    return `increased ${formatPercent(Math.abs(change))}`
  }

  if (change <= -0.05) {
    return `decreased ${formatPercent(Math.abs(change))}`
  }

  return "roughly unchanged"
}

function inactivitySeverity(days: number): number {
  if (days <= INACTIVITY_FLOOR_DAYS) {
    return 0
  }

  return clamp01(
    (days - INACTIVITY_FLOOR_DAYS) /
      (INACTIVITY_CEILING_DAYS - INACTIVITY_FLOOR_DAYS),
  )
}

function sessionDeclineSeverity(
  current: number,
  previous: number,
): number {
  if (previous <= 0) {
    /*
     * No baseline to compare against. A member with no sessions in either
     * period is still a concern; one who has started training is not.
     */
    return current > 0 ? 0 : 0.8
  }

  return clamp01((previous - current) / previous)
}

export function scoreChurnRisk(
  signals: ChurnSignals,
): ChurnAssessment {
  const severities: Record<ChurnFactorKey, number> = {
    inactivity: inactivitySeverity(signals.daysSinceLastVisit),

    sessionDecline: sessionDeclineSeverity(
      signals.sessions30d,
      signals.sessionsPrevious30d,
    ),

    adherence: clamp01(1 - signals.workoutAdherence),
    engagement: clamp01(1 - signals.engagementScore),
    progress: signals.hasRecentProgressSignal ? 0 : 1,
  }

  const details: Record<ChurnFactorKey, string> = {
    inactivity: `${signals.daysSinceLastVisit} days since last visit`,

    sessionDecline: `${signals.sessions30d} sessions in 30 days vs ${
      signals.sessionsPrevious30d
    } previously (${describeDecline(
      signals.sessions30d,
      signals.sessionsPrevious30d,
    )})`,

    adherence: `Workout adherence ${formatPercent(
      signals.workoutAdherence,
    )} (${describeDecline(
      signals.workoutAdherence,
      signals.previousWorkoutAdherence,
    )})`,

    engagement: `App engagement ${formatPercent(
      signals.engagementScore,
    )} (${describeDecline(
      signals.engagementScore,
      signals.previousEngagementScore,
    )})`,

    progress: signals.hasRecentProgressSignal
      ? "Logged a recent progress signal"
      : "No recent progress signal logged",
  }

  const labels: Record<ChurnFactorKey, string> = {
    inactivity: "Inactivity",
    sessionDecline: "Session decline",
    adherence: "Workout adherence",
    engagement: "App engagement",
    progress: "Progress signal",
  }

  const factors: ChurnFactor[] = (
    Object.keys(CHURN_RISK_WEIGHTS) as ChurnFactorKey[]
  ).map((key) => {
    const weight = CHURN_RISK_WEIGHTS[key]
    const severity = severities[key]

    return {
      key,
      label: labels[key],
      detail: details[key],
      severity: roundTo(severity, 3),
      weight,
      contribution: roundTo(severity * weight * 100, 1),
    }
  })

  const riskScore = Math.round(
    factors.reduce(
      (total, factor) => total + factor.severity * factor.weight * 100,
      0,
    ),
  )

  return {
    riskScore,
    riskLevel: toRiskLevel(riskScore),
    factors,

    topFactors: [...factors]
      .sort((a, b) => b.contribution - a.contribution)
      .filter((factor) => factor.contribution > 0)
      .slice(0, 3),
  }
}

export function toRiskLevel(riskScore: number): RiskLevel {
  if (riskScore >= 65) {
    return "high"
  }

  if (riskScore >= 35) {
    return "moderate"
  }

  return "low"
}

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  high: "High risk",
}

export const RISK_LEVEL_RANGE: Record<RiskLevel, string> = {
  low: "0–34",
  moderate: "35–64",
  high: "65–100",
}
