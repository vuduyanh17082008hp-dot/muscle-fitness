import "server-only";

/**
 * Unified OpenAI chat client for Dante Core.
 *
 * Covers:
 * - single-shot explanations (explain.ts, daily-intelligence.ts)
 * - agent tool-calling (tools/orchestrate.ts)
 * - streaming chat (/api/chatbot)
 *
 * Uses fetch against the OpenAI-compatible chat completions API —
 * no Groq/Gemini runtime dependency.
 */

import {
  getDanteOpenAiModels,
  getOpenAiApiKey,
  OPENAI_CHAT_BASE_URL,
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_STREAM_TIMEOUT_MS,
} from "@/lib/dante-core/openai/config";
import { maxCompletionTokens } from "@/lib/dante-core/openai/prompt-budget";

export type LlmResult = {
  reply: string;
  model: string;
};

export type OpenAiChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

export type OpenAiToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type OpenAiToolCall = { id: string; name: string; arguments: unknown };

export type OpenAiAgentTurnResult =
  | { type: "tool_calls"; toolCalls: OpenAiToolCall[] }
  | { type: "final"; reply: string };

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    };
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
};

function parseToolCallArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function callOpenAiChatCompletion(
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const apiKey = getOpenAiApiKey();
  if (signal) {
    return fetch(`${OPENAI_CHAT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, ...body }),
      signal,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${OPENAI_CHAT_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, ...body }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function callModel(model: string, prompt: string): Promise<LlmResult | null> {
  const response = await callOpenAiChatCompletion(
    model,
    {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.35,
      max_tokens: maxCompletionTokens({ inputText: prompt, preferredCap: 1536 }),
    },
    OPENAI_REQUEST_TIMEOUT_MS,
  );

  const data = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("OpenAI rejected OPENAI_API_KEY.");
    }

    throw new Error(`${model}: ${data.error?.message ?? `OpenAI returned HTTP ${response.status}.`}`);
  }

  const reply = data.choices?.[0]?.message?.content?.trim();
  return reply ? { reply, model } : null;
}

export async function callOpenAiWithFallback(prompt: string): Promise<LlmResult | null> {
  const models = getDanteOpenAiModels();
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = await callModel(model, prompt);
      if (result) return result;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.includes("rejected OPENAI_API_KEY")) {
        throw error;
      }
    }
  }

  if (lastError) {
    console.error("[DANTE CORE LLM] all OpenAI models failed", lastError);
  }

  return null;
}

async function callOpenAiAgentTurnOnModel(
  model: string,
  messages: OpenAiChatMessage[],
  tools: OpenAiToolSpec[],
): Promise<OpenAiAgentTurnResult | null> {
  const inputText = messages
    .map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")))
    .join("\n");

  const response = await callOpenAiChatCompletion(
    model,
    {
      messages,
      temperature: 0.2,
      max_tokens: maxCompletionTokens({ inputText, preferredCap: 1024 }),
      tools: tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
      tool_choice: "auto",
    },
    OPENAI_REQUEST_TIMEOUT_MS,
  );

  const data = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("OpenAI rejected OPENAI_API_KEY.");
    }

    throw new Error(`${model}: ${data.error?.message ?? `OpenAI returned HTTP ${response.status}.`}`);
  }

  const message = data.choices?.[0]?.message;

  if (message?.tool_calls && message.tool_calls.length > 0) {
    return {
      type: "tool_calls",
      toolCalls: message.tool_calls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseToolCallArguments(call.function.arguments),
      })),
    };
  }

  const reply = message?.content?.trim();
  return reply ? { type: "final", reply } : null;
}

export async function callOpenAiAgentTurn(
  messages: OpenAiChatMessage[],
  tools: OpenAiToolSpec[],
): Promise<OpenAiAgentTurnResult> {
  const models = getDanteOpenAiModels();
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = await callOpenAiAgentTurnOnModel(model, messages, tools);
      if (result) return result;

      lastError = new Error(`${model} returned neither content nor a tool call.`);
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.includes("rejected OPENAI_API_KEY")) {
        throw error;
      }
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "All Dante OpenAI models failed to produce a response.");
}

export type DanteStreamEvent = { kind: "delta"; text: string } | { kind: "model"; model: string };

async function* streamOpenAiModel(
  model: string,
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const response = await callOpenAiChatCompletion(
    model,
    {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.45,
      max_tokens: maxCompletionTokens({ inputText: prompt, preferredCap: 2048 }),
      stream: true,
    },
    OPENAI_STREAM_TIMEOUT_MS,
    signal,
  );

  if (!response.ok || !response.body) {
    let message = `OpenAI returned HTTP ${response.status}.`;

    try {
      const errorBody = (await response.json()) as ChatCompletionResponse;
      message = errorBody.error?.message ?? message;
    } catch {
      // keep generic message
    }

    if (response.status === 401) {
      throw new Error("OpenAI rejected OPENAI_API_KEY. Update OPENAI_API_KEY in .env.local.");
    }

    throw new Error(`${model}: ${message}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;

        try {
          const chunk = JSON.parse(payload) as ChatCompletionResponse;
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed SSE line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamDanteReply(
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<DanteStreamEvent, void, unknown> {
  const models = getDanteOpenAiModels();
  let lastError: Error | null = null;

  for (const model of models) {
    let emittedAny = false;

    try {
      console.log(`[DANTE] Trying ${model}`);

      for await (const delta of streamOpenAiModel(model, prompt, signal)) {
        emittedAny = true;
        yield { kind: "delta", text: delta };
      }

      yield { kind: "model", model };
      return;
    } catch (error: unknown) {
      const resolvedError = error instanceof Error ? error : new Error(String(error));

      if (resolvedError.name === "AbortError") {
        throw resolvedError;
      }

      console.error(`[DANTE] ${model} failed:`, resolvedError.message);

      if (emittedAny || resolvedError.message.includes("OPENAI_API_KEY")) {
        throw resolvedError;
      }

      lastError = resolvedError;
    }
  }

  throw new Error(lastError?.message ?? "All Dante OpenAI models failed to produce a final answer.");
}

/** @deprecated Use callOpenAiWithFallback — kept for explain/daily-intelligence imports during migration. */
export const callGroqWithFallback = callOpenAiWithFallback;

/** @deprecated Use callOpenAiAgentTurn */
export const callGroqAgentTurn = callOpenAiAgentTurn;

export type GroqChatMessage = OpenAiChatMessage;
export type GroqToolSpec = OpenAiToolSpec;
export type GroqToolCall = OpenAiToolCall;
export type GroqAgentTurnResult = OpenAiAgentTurnResult;
