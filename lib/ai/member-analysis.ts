import "server-only";

import { z } from "zod";

import {
  calculateChurnRisk,
  type MemberRiskSignals,
} from "@/lib/churn-risk";

import {
  groq,
  GROQ_MODEL,
} from "@/lib/ai/client";

import { parseAIJson } from "@/lib/ai/json";

import {
  MEMBER_ANALYSIS_PROMPT,
  MUSCLE_AI_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";


const actionSchema = z.object({
  title: z.string().min(1).max(120),

  description: z
    .string()
    .min(1)
    .max(500),

  priority: z.enum([
    "high",
    "medium",
    "low",
  ]),
});


export const memberAnalysisSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(600),

  reasoning: z
    .string()
    .min(1)
    .max(1200),

  recommendedActions:
    z.array(actionSchema).min(1).max(4),

  confidence: z
    .number()
    .min(0)
    .max(100),
});


export type MemberAnalysis =
  z.infer<typeof memberAnalysisSchema>;


function createFallbackAnalysis(
  riskLevel: "low" | "moderate" | "high"
): MemberAnalysis {
  if (riskLevel === "high") {
    return {
      summary:
        "Several behavioural signals indicate a meaningful risk of disengagement.",

      reasoning:
        "Recent activity, training consistency and engagement signals have weakened. The risk score is produced by the transparent behavioural scoring engine rather than by the language model.",

      recommendedActions: [
        {
          title: "Personal check-in",
          description:
            "Contact the member with a supportive check-in and ask whether their current programme still matches their goals.",
          priority: "high",
        },

        {
          title: "Review training plan",
          description:
            "Offer a short programme review to reduce friction and help the member rebuild training consistency.",
          priority: "medium",
        },
      ],

      confidence: 70,
    };
  }

  if (riskLevel === "moderate") {
    return {
      summary:
        "The member shows some signs of declining engagement.",

      reasoning:
        "The behavioural score indicates moderate risk. Continued observation and a light-touch engagement action may help prevent further decline.",

      recommendedActions: [
        {
          title: "Friendly check-in",
          description:
            "Send a low-pressure message encouraging the member to continue their routine.",
          priority: "medium",
        },
      ],

      confidence: 65,
    };
  }

  return {
    summary:
      "Current behavioural signals indicate relatively stable engagement.",

    reasoning:
      "Attendance, adherence and engagement do not currently show strong signs of churn risk.",

    recommendedActions: [
      {
        title: "Maintain engagement",
        description:
          "Continue the current member experience and monitor for meaningful behavioural changes.",
        priority: "low",
      },
    ],

    confidence: 65,
  };
}


export async function analyseMember(
  signals: MemberRiskSignals
) {
  const risk =
    calculateChurnRisk(signals);

  const userPayload = {
    deterministicRiskScore:
      risk.riskScore,

    deterministicRiskLevel:
      risk.riskLevel,

    factors: risk.factors,

    behaviouralSignals: signals,
  };

  try {
    const completion =
      await groq.chat.completions.create({
        model: GROQ_MODEL,

        temperature: 0.2,

        messages: [
          {
            role: "system",
            content:
              MUSCLE_AI_SYSTEM_PROMPT,
          },

          {
            role: "user",
            content: `${MEMBER_ANALYSIS_PROMPT}

INPUT:
${JSON.stringify(
  userPayload,
  null,
  2
)}`,
          },
        ],
      });

    const content =
      completion.choices[0]?.message
        ?.content;

    if (!content) {
      throw new Error(
        "Groq returned an empty response."
      );
    }

    const ai = parseAIJson(
      content,
      memberAnalysisSchema
    );

    return {
      ...risk,

      ai,

      model: GROQ_MODEL,

      provider: "groq" as const,

      generatedByAI: true,
    };
  } catch (error) {
    console.error(
      "Groq member analysis failed:",
      error
    );

    return {
      ...risk,

      ai: createFallbackAnalysis(
        risk.riskLevel
      ),

      model: GROQ_MODEL,

      provider: "groq" as const,

      generatedByAI: false,
    };
  }
}