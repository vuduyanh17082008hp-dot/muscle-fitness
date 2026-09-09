import type { ChurnAssessment, ChurnSignals } from "@/lib/churn-risk"

export const MEMBER_GOALS = [
  "Weight loss",
  "Muscle gain",
  "Strength",
  "General fitness",
  "Endurance",
] as const

export type MemberGoal = (typeof MEMBER_GOALS)[number]

export const MEMBERSHIP_TYPES = [
  "Monthly",
  "Annual",
  "Class pass",
  "Personal training",
] as const

export type MembershipType = (typeof MEMBERSHIP_TYPES)[number]

export const SEGMENT_KEYS = [
  "new-members",
  "highly-engaged",
  "strength-focused",
  "weight-loss",
  "casual",
  "at-risk",
  "dormant",
  "pt-potential",
] as const

export type SegmentKey = (typeof SEGMENT_KEYS)[number]

export type GymMember = {
  id: string
  name: string
  initials: string
  goal: MemberGoal
  membershipType: MembershipType
  /** Monthly membership value in SGD. */
  monthlyValue: number
  joinedDaysAgo: number
  usesPersonalTraining: boolean
  preferredTime: "Morning" | "Midday" | "Evening"
  signals: ChurnSignals
}

export type AssessedMember = GymMember & {
  assessment: ChurnAssessment
  segments: SegmentKey[]
  lastVisitLabel: string
}

export type SegmentSummary = {
  key: SegmentKey
  label: string
  description: string
  memberCount: number
  shareOfBase: number
  averageRisk: number
  monthlyValue: number
  recommendedAction: string
}

export type EngagementTrendPoint = {
  label: string
  engagementRate: number
  attendance: number
  atRiskMembers: number
}

export type RiskDistribution = {
  low: number
  moderate: number
  high: number
}

export type BusinessMetrics = {
  activeMembers: number
  activeMembersChange: number
  membersAtRisk: number
  membersAtRiskChange: number
  engagementRate: number
  engagementRateChange: number
  retentionForecast: number
  retentionForecastChange: number
  highRiskCount: number
  moderateRiskCount: number
  monthlyRecurringValue: number
  valueAtRisk: number
}

export type CampaignObjective =
  | "retention"
  | "re-engagement"
  | "personal-training"
  | "new-programme"
  | "member-education"

export type CampaignStatus =
  | "draft"
  | "approved"
  | "sent"
  | "completed"

export type CampaignMetrics = {
  sent: number
  opened: number
  clicked: number
  returned: number
  converted: number
}

export type CampaignContent = {
  strategy: string
  emailSubject: string
  emailBody: string
  pushNotification: string
  callToAction: string
  socialCaption?: string
  imagePrompt?: string
}

export type Campaign = {
  id: string
  name: string
  objective: CampaignObjective
  segmentKey: SegmentKey
  status: CampaignStatus
  createdAt: string
  approvedAt: string | null
  approvedBy: string | null
  audienceSize: number
  content: CampaignContent
  metrics: CampaignMetrics | null
  /** True when the copy came from a live model rather than the fallback. */
  aiGenerated: boolean
  source: "seed" | "generated"
}

export type FacilityUsageCell = {
  day: string
  hour: number
  utilisation: number
}

export type StaffingRecommendation = {
  window: string
  detail: string
  severity: "info" | "watch" | "action"
}

export type OperationsIntelligence = {
  heatmap: FacilityUsageCell[]
  peakWindow: string
  peakUtilisation: number
  quietWindow: string
  quietUtilisation: number
  capacityAlerts: StaffingRecommendation[]
  staffingRecommendations: StaffingRecommendation[]
  sustainability: StaffingRecommendation[]
}

export type InsightCategory =
  | "attendance"
  | "retention"
  | "programming"
  | "capacity"
  | "revenue"

export type BusinessInsight = {
  id: string
  category: InsightCategory
  headline: string
  evidence: string
  recommendedAction: string
  confidence: number
  aiGenerated: boolean
}

export type BusinessImpact = {
  membersReEngaged: number
  retentionImprovement: number
  revenueProtected: number
  campaignConversion: number
}

export type AiAuditEntry = {
  id: string
  timestamp: string
  feature: string
  model: string
  action: string
  humanApproval: "required" | "approved" | "not-required"
}

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  "new-members": "New members",
  "highly-engaged": "Highly engaged",
  "strength-focused": "Strength focused",
  "weight-loss": "Weight loss",
  casual: "Casual members",
  "at-risk": "At risk",
  dormant: "Dormant",
  "pt-potential": "Potential PT customers",
}

export const CAMPAIGN_OBJECTIVE_LABELS: Record<
  CampaignObjective,
  string
> = {
  retention: "Retention",
  "re-engagement": "Re-engagement",
  "personal-training": "Personal training",
  "new-programme": "New programme",
  "member-education": "Member education",
}
