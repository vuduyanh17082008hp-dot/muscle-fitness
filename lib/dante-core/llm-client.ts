import "server-only";

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

/**
 * Dante's LLM client — OpenAI is the only provider (no Groq/Gemini
 * fallback chain; a missing/failing key degrades to each caller's own
 * deterministic text, never a second provider). Server-only, lazily
 * initialized: reading OPENAI_API_KEY happens on first actual
 * request, never at module import, so `next build` never fails just
 * because the key isn't set in that environment.
 */

const REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
}

function getReasoningEffort(): ReasoningEffort {
  const raw = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  return raw && REASONING_EFFORTS.has(raw) ? (raw as ReasoningEffort) : "low";
}

/**
 * `reasoning_effort` is only accepted by OpenAI's reasoning-capable
 * models (o-series: o1/o3/o4-mini..., and the gpt-5 family) — sending
 * it to a non-reasoning model (gpt-4o, gpt-4.1, gpt-3.5-turbo, ...) is
 * rejected as an unknown parameter. Pattern-matched against the model
 * name since there's no live capability-introspection endpoint to
 * check against.
 */
export function supportsReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return /^o[1-9]/.test(normalized) || normalized.startsWith("gpt-5") || normalized.startsWith("gpt-oss");
}

/**
 * Reasoning-capable models also reject a custom `temperature` — only
 * the default (1) is accepted, confirmed live against gpt-5.4-mini
 * ("Unsupported value: 'temperature' does not support 0.3 with this
 * model. Only the default (1) value is supported."). So the same
 * model check decides both fields at once: reasoning models get
 * `reasoning_effort` and no `temperature`; standard models get the
 * caller's `temperature` and no `reasoning_effort`. Spread into the
 * request body so an unsupported field is cleanly omitted rather than
 * sent as `undefined`.
 */
function chatCompletionTuning(
  model: string,
  standardTemperature: number,
): { reasoning_effort: ReasoningEffort } | { temperature: number } {
  return supportsReasoningEffort(model)
    ? { reasoning_effort: getReasoningEffort() }
    : { temperature: standardTemperature };
}

function getOpenAiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env.local");
  }

  return apiKey;
}

/** True when OPENAI_API_KEY is present — check before calling code paths that need it, to avoid a throw. */
export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

let cachedClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new OpenAI({ apiKey: getOpenAiKey() });
  return cachedClient;
}

export class OpenAiProviderError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "OpenAiProviderError";
    this.status = status;
  }
}

function toProviderError(error: unknown, model: string): OpenAiProviderError {
  if (error instanceof OpenAI.APIError) {
    return new OpenAiProviderError(`${model}: ${error.message}`, error.status ?? null);
  }

  if (error instanceof Error) {
    return new OpenAiProviderError(`${model}: ${error.message}`);
  }

  return new OpenAiProviderError(`${model}: ${String(error)}`);
}

export type LlmResult = { reply: string; model: string; provider: "openai" };

/**
 * Single non-streaming completion for Dante Core's explanation layer
 * (lib/dante-core/explain.ts) and daily narrative
 * (lib/dante-core/daily-intelligence.ts). Never throws — returns null
 * on any failure (missing key, timeout, provider error, empty reply)
 * so callers fall back to their own deterministic text. This is the
 * ONLY fallback behavior in this module; there is no second LLM
 * provider to retry against.
 */
export async function callDanteLlm(prompt: string): Promise<LlmResult | null> {
  if (!isOpenAiConfigured()) {
    console.error("[DANTE CORE LLM] OPENAI_API_KEY is not configured");
    return null;
  }

  const model = getOpenAiModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const client = getOpenAiClient();
    const response = await client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1024,
        ...chatCompletionTuning(model, 0.3),
      },
      { signal: controller.signal },
    );

    const reply = response.choices[0]?.message?.content?.trim();

    if (!reply) {
      return null;
    }

    return { reply, model, provider: "openai" };
  } catch (error) {
    console.error("[DANTE CORE LLM] request failed", toProviderError(error, model).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   TOOL-CALLING (Agentic Performance Interface, Part 10)

   Extends this SAME OpenAI client with function-calling support for
   lib/dante-core/tools/orchestrate.ts. Provider-specific shapes
   (tool_calls, JSON-encoded arguments) stay contained here — callers
   only ever see the plain DanteAgentTurnResult union below.
========================================================= */

export type DanteChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  /** Set only on an assistant message that represents the model's own prior tool-call request, so the next round's transcript reflects what it actually asked for before seeing the result. */
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

export type DanteToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type DanteToolCall = { id: string; name: string; arguments: unknown };

export type DanteAgentTurnResult =
  | { type: "tool_calls"; toolCalls: DanteToolCall[] }
  | { type: "final"; reply: string };

function parseToolCallArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Malformed JSON from the model — the caller's own zod validation
    // will reject this as invalid arguments (Part 10/K) rather than
    // this layer guessing at a repair.
    return {};
  }
}

/**
 * Throws OpenAiProviderError on failure (unlike callDanteLlm) — the
 * agent tool loop has its own per-round error handling; a silent null
 * here would be indistinguishable from "the model chose not to reply".
 */
export async function callDanteAgentTurn(
  messages: DanteChatMessage[],
  tools: DanteToolSpec[],
): Promise<DanteAgentTurnResult> {
  const model = getOpenAiModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const client = getOpenAiClient();
    const response = await client.chat.completions.create(
      {
        model,
        messages: messages as ChatCompletionMessageParam[],
        max_completion_tokens: 1024,
        ...chatCompletionTuning(model, 0.2),
        tools: tools.map(
          (tool): ChatCompletionTool => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          }),
        ),
        tool_choice: "auto",
      },
      { signal: controller.signal },
    );

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls?.filter((call) => call.type === "function") ?? [];

    if (toolCalls.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: toolCalls.map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: parseToolCallArguments(call.function.arguments),
        })),
      };
    }

    const reply = message?.content?.trim();

    if (!reply) {
      throw new OpenAiProviderError(`${model} returned neither content nor a tool call.`);
    }

    return { type: "final", reply };
  } catch (error) {
    throw error instanceof OpenAiProviderError ? error : toProviderError(error, model);
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   STREAMING — used by app/api/chatbot/route.ts's main Dante reply
========================================================= */

/**
 * Streams a single completion for the given prompt, yielding plain
 * text deltas as they arrive. Throws OpenAiProviderError (never a raw
 * SDK error) on any failure, including a missing key, so the route
 * can categorize the failure for observability.
 */
export async function* streamDanteLlmReply(
  prompt: string,
  signal: AbortSignal,
): AsyncGenerator<string, void, unknown> {
  const model = getOpenAiModel();
  const client = getOpenAiClient();

  let stream: Awaited<ReturnType<typeof client.chat.completions.create>>;

  try {
    stream = await client.chat.completions.create(
      {
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 4096,
        ...chatCompletionTuning(model, 0.4),
        stream: true,
      },
      { signal },
    );
  } catch (error) {
    throw toProviderError(error, model);
  }

  try {
    for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  } catch (error) {
    throw toProviderError(error, model);
  }
}
