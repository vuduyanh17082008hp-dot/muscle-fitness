import "server-only";

import { z } from "zod";

import {
  groq,
  GROQ_MODEL,
} from "@/lib/ai/client";

import { parseAIJson } from "@/lib/ai/json";

import {
  BUSINESS_INSIGHTS_PROMPT,
  MUSCLE_AI_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";


const insightSchema = z.object({
  category: z.enum([
    "retention",
    "engagement",
    "marketing",
    "operations",
  ]),

  title: z
    .string()
    .min(1)
    .max(150),

  evidence: z
    .string()
    .min(1)
    .max(700),

  recommendation: z
    .string()
    .min(1)
    .max(700),

  confidence: z
    .number()
    .min(0)
    .max(100),
});


export const businessInsightResponseSchema =
  z.object({
    executiveSummary: z
      .string()
      .min(1)
      .max(1000),

    insights:
      z.array(insightSchema).max(5),
  });


export type BusinessInsightResponse =
  z.infer<
    typeof businessInsightResponseSchema
  >;


export async function generateBusinessInsights(
  data: Record<string, unknown>
) {
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
          content: `${BUSINESS_INSIGHTS_PROMPT}

AGGREGATE BUSINESS DATA:

${JSON.stringify(
  data,
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
      "Groq returned empty business insights."
    );
  }

  return {
    ...parseAIJson(
      content,
      businessInsightResponseSchema
    ),

    provider: "groq" as const,

    model: GROQ_MODEL,
  };
}