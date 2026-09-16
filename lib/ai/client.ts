import "server-only";

/**
 * Shared OpenAI chat helper for non-Dante business features
 * (member analysis, campaign generation, business insights).
 *
 * Dante chat/tool-calling uses lib/dante-core/openai/client.ts directly.
 */

import { getOpenAiApiKey, OPENAI_CHAT_BASE_URL } from "@/lib/dante-core/openai/config";

export const OPENAI_MODEL =
  process.env.DANTE_OPENAI_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-4o-mini";

/** @deprecated Use OPENAI_MODEL */
export const GROQ_MODEL = OPENAI_MODEL;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatCompletionResult = {
  choices: Array<{ message?: { content?: string | null } }>;
};

export async function createOpenAiChatCompletion(input: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatCompletionResult> {
  const apiKey = getOpenAiApiKey();

  const response = await fetch(`${OPENAI_CHAT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? OPENAI_MODEL,
      messages: input.messages,
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 2048,
    }),
  });

  const data = (await response.json()) as ChatCompletionResult & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(data.error?.message ?? `OpenAI returned HTTP ${response.status}.`);
  }

  return data;
}

/** @deprecated Groq SDK shim — routes to OpenAI. */
export const groq = {
  chat: {
    completions: {
      create: createOpenAiChatCompletion,
    },
  },
};
