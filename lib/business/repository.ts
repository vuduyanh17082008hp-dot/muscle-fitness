import "server-only"

import { cache } from "react"

import {
  getDemoCampaigns,
  getDemoEngagementTrend,
  getDemoFacilityUsage,
  getDemoMembers,
} from "@/lib/business/demo-data"
import { resolveSegments } from "@/lib/business/segments"
import type {
  AssessedMember,
  BusinessImpact,
  BusinessInsight,
  BusinessMetrics,
  Campaign,
  EngagementTrendPoint,
  FacilityUsageCell,
  GymMember,
  RiskDistribution,
} from "@/lib/business/types"
import { scoreChurnRisk } from "@/lib/churn-risk"

export type BusinessDataSource = "demo" | "supabase"

function describeLastVisit(days: number): string {
  if (days <= 0) {
    return "Today"
  }

  if (days === 1) {
    return "Yesterday"
  }

  if (days < 7) {
    return `${days} days ago`
  }

  if (days < 14) {
    return "Last week"
  }

  if (days < 60) {
    return `${Math.round(days / 7)} weeks ago`
  }

  return `${Math.round(days / 30)} months ago`
}

export function assessMember(member: GymMember): AssessedMember {
  const assessment = scoreChurnRisk(member.signals)

  return {
    ...member,
    assessment,
    segments: resolveSegments(member, assessment),
    lastVisitLabel: describeLastVisit(member.signals.daysSinceLastVisit),
  }
}

/**
 * Members currently come from the deterministic synthetic dataset.
 *
 * The real integration point is here: when the `gym_members` table from
 * `supabase/migrations/*_muscle_ai_business.sql` is populated for an
 * organisation, read it and map rows onto `GymMember` before assessing.
 * Everything downstream (scoring, segmentation, AI, campaigns) is already
 * source-agnostic.
 */
export const getMembers = cache(
  async (): Promise<{
    members: AssessedMember[]
    source: BusinessDataSource
  }> => {
    const members = getDemoMembers().map(assessMember)

    return {
      members: members.sort(
        (a, b) => b.assessment.riskScore - a.assessment.riskScore,
      ),
      source: "demo",
    }
  },
)

export const getMemberById = cache(
  async (id: string): Promise<AssessedMember | null> => {
    const { members } = await getMembers()

    return members.find((member) => member.id === id) ?? null
  },
)

export function buildRiskDistribution(
  members: AssessedMember[],
): RiskDistribution {
  return members.reduce<RiskDistribution>(
    (totals, member) => {
      totals[member.assessment.riskLevel] += 1

      return totals
    },
    { low: 0, moderate: 0, high: 0 },
  )
}

export function buildMetrics(
  members: AssessedMember[],
  trend: EngagementTrendPoint[],
): BusinessMetrics {
  const distribution = buildRiskDistribution(members)

  const activeMembers = members.filter(
    (member) => member.signals.daysSinceLastVisit <= 30,
  ).length

  const engagementRate = Math.round(
    (members.reduce(
      (total, member) => total + member.signals.engagementScore,
      0,
    ) /
      (members.length || 1)) *
      100,
  )

  const previousEngagementRate = Math.round(
    (members.reduce(
      (total, member) => total + member.signals.previousEngagementScore,
      0,
    ) /
      (members.length || 1)) *
      100,
  )

  const monthlyRecurringValue = members.reduce(
    (total, member) => total + member.monthlyValue,
    0,
  )

  const valueAtRisk = members
    .filter((member) => member.assessment.riskLevel !== "low")
    .reduce((total, member) => total + member.monthlyValue, 0)

  /*
   * Retention forecast is the share of the base not currently carrying a
   * high-risk score. It is a projection from present behaviour, not a
   * measured historical outcome.
   */
  const retentionForecast = Math.round(
    ((members.length - distribution.high) / (members.length || 1)) * 100,
  )

  const firstTrendPoint = trend[0]
  const lastTrendPoint = trend[trend.length - 1]

  const atRiskChange =
    firstTrendPoint && lastTrendPoint
      ? lastTrendPoint.atRiskMembers - firstTrendPoint.atRiskMembers
      : 0

  return {
    activeMembers,
    activeMembersChange: Math.round(members.length * 0.04),
    membersAtRisk: distribution.high + distribution.moderate,
    membersAtRiskChange: atRiskChange,
    engagementRate,
    engagementRateChange: engagementRate - previousEngagementRate,
    retentionForecast,
    retentionForecastChange: -Math.max(
      Math.round(distribution.high / 4),
      1,
    ),
    highRiskCount: distribution.high,
    moderateRiskCount: distribution.moderate,
    monthlyRecurringValue,
    valueAtRisk,
  }
}

export function buildFallbackInsights(
  members: AssessedMember[],
  trend: EngagementTrendPoint[],
  usage: FacilityUsageCell[],
): BusinessInsight[] {
  const insights: BusinessInsight[] = []

  const recent = trend.slice(-2)

  if (recent.length === 2) {
    const [previous, current] = recent
    const change =
      ((current.attendance - previous.attendance) /
        (previous.attendance || 1)) *
      100

    insights.push({
      id: "insight-attendance",
      category: "attendance",

      headline:
        change < 0
          ? `Member attendance decreased ${Math.abs(
              Math.round(change),
            )}% this week.`
          : `Member attendance increased ${Math.round(
              change,
            )}% this week.`,

      evidence: `${current.attendance} visits this week against ${previous.attendance} last week, across ${members.length} members.`,

      recommendedAction:
        change < 0
          ? "Review the high-risk list before the weekend; attendance dips lead risk scores by about two weeks."
          : "Protect the gain — confirm evening class capacity holds for next week.",

      confidence: 0.86,
      aiGenerated: false,
    })
  }

  const strengthMembers = members.filter((member) =>
    member.segments.includes("strength-focused"),
  )

  const otherMembers = members.filter(
    (member) => !member.segments.includes("strength-focused"),
  )

  if (strengthMembers.length > 0 && otherMembers.length > 0) {
    const strengthEngagement =
      strengthMembers.reduce(
        (total, member) => total + member.signals.engagementScore,
        0,
      ) / strengthMembers.length

    const otherEngagement =
      otherMembers.reduce(
        (total, member) => total + member.signals.engagementScore,
        0,
      ) / otherMembers.length

    const delta = Math.round(
      (strengthEngagement - otherEngagement) * 100,
    )

    insights.push({
      id: "insight-programming",
      category: "programming",

      headline:
        delta >= 0
          ? `Strength-programme members show ${delta} points higher engagement.`
          : `Strength-programme members show ${Math.abs(
              delta,
            )} points lower engagement.`,

      evidence: `${strengthMembers.length} strength-focused members average ${Math.round(
        strengthEngagement * 100,
      )}% engagement against ${Math.round(
        otherEngagement * 100,
      )}% for the rest of the base.`,

      recommendedAction:
        delta >= 0
          ? "Offer a structured strength block to casual members whose attendance has flattened."
          : "Audit strength programming — progression may have stalled for this group.",

      confidence: 0.79,
      aiGenerated: false,
    })
  }

  const eveningCells = usage.filter(
    (cell) => cell.hour >= 18 && cell.hour <= 20,
  )

  if (eveningCells.length > 0) {
    const peak = Math.max(
      ...eveningCells.map((cell) => cell.utilisation),
    )

    insights.push({
      id: "insight-capacity",
      category: "capacity",
      headline: `Evening utilisation is approaching capacity at ${peak}%.`,

      evidence: `Highest observed evening occupancy is ${peak}% across the 18:00–20:00 window over the last seven days.`,

      recommendedAction:
        "Shift a share of evening demand into the quiet midday window before adding floor capacity.",

      confidence: 0.83,
      aiGenerated: false,
    })
  }

  return insights
}

export function buildBusinessImpact(
  campaigns: Campaign[],
  members: AssessedMember[],
): BusinessImpact {
  const completed = campaigns.filter(
    (campaign) => campaign.metrics !== null,
  )

  const totals = completed.reduce(
    (accumulator, campaign) => {
      const metrics = campaign.metrics

      if (!metrics) {
        return accumulator
      }

      return {
        sent: accumulator.sent + metrics.sent,
        returned: accumulator.returned + metrics.returned,
        converted: accumulator.converted + metrics.converted,
      }
    },
    { sent: 0, returned: 0, converted: 0 },
  )

  const averageValue =
    members.reduce((total, member) => total + member.monthlyValue, 0) /
    (members.length || 1)

  return {
    membersReEngaged: totals.returned,

    retentionImprovement:
      totals.sent > 0
        ? Math.round((totals.returned / totals.sent) * 100)
        : 0,

    /* Twelve months of membership value for members who returned. */
    revenueProtected: Math.round(totals.returned * averageValue * 12),

    campaignConversion:
      totals.sent > 0
        ? Math.round((totals.converted / totals.sent) * 100)
        : 0,
  }
}

export const getEngagementTrend = cache(
  async (): Promise<EngagementTrendPoint[]> => getDemoEngagementTrend(),
)

export const getFacilityUsage = cache(
  async (): Promise<FacilityUsageCell[]> => getDemoFacilityUsage(),
)

export const getSeedCampaigns = cache(
  async (): Promise<Campaign[]> => getDemoCampaigns(),
)
