import "server-only";

import { z } from "zod";

import {
  groq,
  GROQ_MODEL,
} from "@/lib/ai/client";

import { parseAIJson } from "@/lib/ai/json";

import {
  CAMPAIGN_GENERATION_PROMPT,
  MUSCLE_AI_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";


export const campaignSchema = z.object({
  name: z.string().min(1).max(120),

  strategy: z
    .string()
    .min(1)
    .max(800),

  emailSubject: z
    .string()
    .min(1)
    .max(150),

  emailBody: z
    .string()
    .min(1)
    .max(2500),

  pushNotification: z
    .string()
    .min(1)
    .max(250),

  cta: z
    .string()
    .min(1)
    .max(80),

  socialCaption: z
    .string()
    .min(1)
    .max(800),

  visualPrompt: z
    .string()
    .min(1)
    .max(1000),
});


export type GeneratedCampaign =
  z.infer<typeof campaignSchema>;


export interface CampaignGenerationInput {
  objective: string;

  segmentName: string;

  segmentDescription: string;

  memberCount?: number;

  additionalContext?: string;
}


export async function generateCampaign(
  input: CampaignGenerationInput
): Promise<{
  campaign: GeneratedCampaign;
  provider: "groq";
  model: string;
}> {
  const completion =
    await groq.chat.completions.create({
      model: GROQ_MODEL,

      temperature: 0.5,

      messages: [
        {
          role: "system",
          content:
            MUSCLE_AI_SYSTEM_PROMPT,
        },

        {
          role: "user",
          content: `${CAMPAIGN_GENERATION_PROMPT}

CAMPAIGN INPUT:

${JSON.stringify(
  input,
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
      "Groq returned an empty campaign."
    );
  }

  const campaign = parseAIJson(
    content,
    campaignSchema
  );

  return {
    campaign,
    provider: "groq",
    model: GROQ_MODEL,
  };
}