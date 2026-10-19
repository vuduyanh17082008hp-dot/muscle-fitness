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
 * OpenAI is the sole runtime provider.
 */

import {
  getDanteOpenAiModels,
  getOpenAiApiKey,
  OPENAI_CHAT_BASE_URL,
  OPENAI_REQUEST_TIMEOUT_MS,
  OPENAI_STREAM_TIMEOUT_MS,
} from "@/lib/dante-core/openai/config";
import { maxCompletionTokens } from "@/lib/dante-core/openai/prompt-budget";
import type { TurnBudget } from "@/lib/dante-core/turn-budget";

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
  // H0 WP1: the timeout stays attached for the BODY too (a cleared timer left `.json()` / the SSE read unbounded), and a
  // caller signal (client disconnect / turn deadline) narrows it — it never replaces it.
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetch(`${OPENAI_CHAT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, ...body }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}

async function callModel(model: string, prompt: string, signal?: AbortSignal): Promise<LlmResult | null> {
  const response = await callOpenAiChatCompletion(
    model,
    {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.35,
      max_tokens: maxCompletionTokens({ inputText: prompt, preferredCap: 1536 }),
    },
    OPENAI_REQUEST_TIMEOUT_MS,
    signal,
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

/**
 * H0: with a turn budget every model attempt reserves one provider attempt and runs under the turn's signal (client
 * disconnect / deadline). An aborted attempt never falls through to the next model, and a result that lands after the
 * signal fired is dropped, so a late reply can never become this turn's answer.
 */
export async function callOpenAiWithFallback(prompt: string, budget?: Pick<TurnBudget, "tryStart" | "signal">): Promise<LlmResult | null> {
  const models = getDanteOpenAiModels();
  let lastError: unknown = null;

  for (const model of models) {
    if (budget && !budget.tryStart("provider")) break;
    try {
      const result = await callModel(model, prompt, budget?.signal);
      if (budget?.signal.aborted) return null;
      if (result) return result;
    } catch (error) {
      lastError = error;
      if (budget?.signal.aborted) return null;
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
  /** H0 WP1: every model attempt (the transport retry) reserves one provider attempt from the turn budget. */
  budget?: Pick<TurnBudget, "tryStart">,
): AsyncGenerator<DanteStreamEvent, void, unknown> {
  const models = getDanteOpenAiModels();
  let lastError: Error | null = null;

  for (const model of models) {
    let emittedAny = false;

    if (budget && !budget.tryStart("provider")) {
      lastError ??= new Error("Dante turn budget exhausted before a provider attempt could start.");
      break;
    }

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

      // The caller's signal decides, not the error name: Next aborts a disconnected request with "ResponseAborted".
      if (signal.aborted || resolvedError.name === "AbortError") {
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

