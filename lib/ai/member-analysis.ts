import "server-only"

import { z } from "zod"

import { recordAiAudit } from "@/lib/ai/audit-log"
import { getGroqModel, runGroqJson } from "@/lib/ai/client"
import { parseJsonWithSchema } from "@/lib/ai/json"
import { MEMBER_ANALYSIS_SYSTEM_PROMPT } from "@/lib/ai/prompts"
import type { AssessedMember, CampaignObjective } from "@/lib/business/types"
import type { ChurnAssessment } from "@/lib/churn-risk"

export const memberAnalysisSchema = z.object({
  explanation: z.string().min(20).max(1200),

  recommendedActions: z
    .array(
      z.object({
        title: z.string().min(3).max(120),
        detail: z.string().min(10).max(400),
        priority: z.enum(["high", "medium", "low"]),
      }),
    )
    .min(1)
    .max(5),

  suggestedCampaignObjective: z.enum([
    "retention",
    "re-engagement",
    "personal-training",
    "new-programme",
    "member-education",
  ]),

  confidence: z.number().min(0).max(1),
})

export type MemberAnalysis = z.infer<typeof memberAnalysisSchema> & {
  aiGenerated: boolean
  model: string
  /** Present when the model call failed and the fallback was used. */
  fallbackReason?: string
}

/**
 * Behavioural payload only.
 *
 * Names, contact details, dates of birth and any other identifying
 * information are deliberately excluded so member identity is never sent
 * to the model.
 */
function toModelPayload(
  member: AssessedMember,
  assessment: ChurnAssessment,
): string {
  return JSON.stringify(
    {
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,

      factors: assessment.factors.map((factor) => ({
        factor: factor.label,
        detail: factor.detail,
        contributionPoints: factor.contribution,
      })),

      behaviour: {
        daysSinceLastVisit: member.signals.daysSinceLastVisit,
        sessions30d: member.signals.sessions30d,
        sessionsPrevious30d: member.signals.sessionsPrevious30d,
        workoutAdherence: member.signals.workoutAdherence,
        engagementScore: member.signals.engagementScore,
        hasRecentProgressSignal: member.signals.hasRecentProgressSignal,
      },

      context: {
        goal: member.goal,
        membershipType: member.membershipType,
        tenureDays: member.joinedDaysAgo,
        usesPersonalTraining: member.usesPersonalTraining,
      },
    },
    null,
    2,
  )
}

function suggestObjective(
  member: AssessedMember,
): CampaignObjective {
  if (member.signals.daysSinceLastVisit >= 30) {
    return "re-engagement"
  }

  if (member.joinedDaysAgo <= 30) {
    return "retention"
  }

  if (member.signals.sessions30d >= 8 && !member.usesPersonalTraining) {
    return "personal-training"
  }

  if (member.assessment.riskLevel === "high") {
    return "re-engagement"
  }

  return "retention"
}

/**
 * Deterministic explanation used when Groq is unavailable. It is built
 * from the same factors the model would have seen, and the UI labels it
 * as rule-based rather than AI-generated.
 */
export function buildFallbackMemberAnalysis(
  member: AssessedMember,
  fallbackReason: string,
): MemberAnalysis {
  const { assessment } = member

  const leadFactors = assessment.topFactors
    .map((factor) => factor.detail.toLowerCase())
    .join("; ")

  const explanation =
    assessment.riskLevel === "low"
      ? `This member is training consistently and shows no disengagement signals. The strongest reading is ${
          assessment.topFactors[0]?.detail.toLowerCase() ??
          "steady attendance"
        }.`
      : `Risk is driven mainly by ${leadFactors}. Together these signals describe a member whose training habit is losing structure rather than one who has decided to leave, which is why the next contact matters more than the offer attached to it.`

  const actions: MemberAnalysis["recommendedActions"] =
    assessment.riskLevel === "low"
      ? [
          {
            title: "Keep the current programme running",
            detail:
              "No intervention needed. Consider inviting this member to a referral or community programme.",
            priority: "low",
          },
        ]
      : [
          {
            title: "Send a personalised check-in",
            detail:
              "A named coach, not a generic broadcast. Reference their goal and ask what changed in their week.",
            priority: "high",
          },
          {
            title: "Offer a complimentary coaching consultation",
            detail:
              "Twenty minutes to review the programme against their current schedule and remove whatever is blocking attendance.",
            priority: "high",
          },
          {
            title: "Adjust the training programme",
            detail:
              "Reduce required sessions per week so the plan matches the time they actually have, rather than the plan they signed up to.",
            priority: "medium",
          },
          {
            title: "Invite to a seven-day re-engagement challenge",
            detail:
              "A short, finite commitment with one booked session is easier to accept than an open-ended return.",
            priority: "medium",
          },
        ]

  return {
    explanation,
    recommendedActions: actions,
    suggestedCampaignObjective: suggestObjective(member),
    confidence: 0.62,
    aiGenerated: false,
    model: getGroqModel(),
    fallbackReason,
  }
}

export async function generateMemberAnalysis(
  member: AssessedMember,
): Promise<MemberAnalysis> {
  const result = await runGroqJson({
    system: MEMBER_ANALYSIS_SYSTEM_PROMPT,
    user: toModelPayload(member, member.assessment),
    temperature: 0.35,
    maxTokens: 900,
  })

  if (!result.ok) {
    return buildFallbackMemberAnalysis(
      member,
      result.error ?? "Groq request failed.",
    )
  }

  const parsed = parseJsonWithSchema(result.content, memberAnalysisSchema)

  if (!parsed.ok) {
    return buildFallbackMemberAnalysis(
      member,
      `Model output rejected by validation (${parsed.error}).`,
    )
  }

  recordAiAudit({
    feature: "member-analysis",
    model: `${result.model} (Groq)`,
    action: `Explained churn risk factors for member ${member.id}`,
    humanApproval: "not-required",
  })

  return {
    ...parsed.data,
    aiGenerated: true,
    model: result.model,
  }
}
