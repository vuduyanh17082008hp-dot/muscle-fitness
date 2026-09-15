import "server-only";

/**
 * Minimal Groq chat client for Dante Core explanations (spec §9).
 *
 * KNOWN DUPLICATION, documented rather than hidden: app/api/chatbot/
 * route.ts already implements a Groq fetch-with-model-fallback client
 * (callGroqModel/generateDanteReply) for the main Dante conversation.
 * That file is ~3,300 lines and load-bearing for the live product
 * chat; extracting a shared helper from it without the ability to
 * exercise the change in a real browser session was judged too risky
 * for this pass. This module intentionally mirrors its env vars
 * (GROQ_API_KEY, GROQ_MODEL) and model-fallback behavior so the two
 * stay consistent, and is small/self-contained enough that the
 * duplication cost is low. See docs/dante-core.md "Known limitations".
 */

import { groqMaxCompletionTokens } from "@/lib/dante-core/groq-budget";

export type LlmResult = {
  reply: string;
  model: string;
};

function getGroqKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing from .env.local");
  }

  return apiKey;
}

function getGroqModels(): string[] {
  return Array.from(
    new Set(
      [
        process.env.GROQ_MODEL?.trim(),
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "llama-3.3-70b-versatile",
      ].filter((model): model is string => Boolean(model)),
    ),
  );
}

async function callModel(model: string, prompt: string): Promise<LlmResult | null> {
  const apiKey = getGroqKey();
  const gptOss = model.startsWith("openai/gpt-oss");

  const requestBody: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: gptOss ? 0.4 : 0.3,
    top_p: 0.95,
    max_completion_tokens: groqMaxCompletionTokens({
      model,
      inputText: prompt,
      preferredCap: gptOss ? 1536 : 1024,
    }),
  };

  if (gptOss) {
    requestBody.reasoning_effort = "low";
    requestBody.reasoning_format = "hidden";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let response: Response;

  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Groq rejected GROQ_API_KEY.");
    }

    throw new Error(
      `${model}: ${data.error?.message ?? `Groq returned HTTP ${response.status}.`}`,
    );
  }

  const reply = data.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    return null;
  }

  return { reply, model };
}

/**
 * Tries each configured model in order, falling back on failure
 * (except an unrecoverable 401). Returns null if every model failed
 * to produce content — callers must handle that by falling back to
 * the structured decision object alone (never silently returning
 * nothing to the user).
 */
export async function callGroqWithFallback(prompt: string): Promise<LlmResult | null> {
  const models = getGroqModels();
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = await callModel(model, prompt);
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;

      if (error instanceof Error && error.message.includes("rejected GROQ_API_KEY")) {
        throw error;
      }
    }
  }

  if (lastError) {
    console.error("[DANTE CORE LLM] all models failed", lastError);
  }

  return null;
}

/* =========================================================
   TOOL-CALLING (Agentic Performance Interface, Part 10)

   Extends this SAME Groq client with function-calling support for
   lib/dante-core/tools/orchestrate.ts, rather than teaching a second
   module how to talk to Groq. Provider-specific parsing (tool_calls
   shape, JSON-encoded arguments) stays contained here — callers only
   ever see the plain GroqAgentTurnResult union below.
========================================================= */

export type GroqChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  /** Set only on an assistant message that represents the model's own prior tool-call request, so the next round's transcript reflects what it actually asked for before seeing the result. */
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

export type GroqToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type GroqToolCall = { id: string; name: string; arguments: unknown };

export type GroqAgentTurnResult =
  | { type: "tool_calls"; toolCalls: GroqToolCall[] }
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

async function callGroqAgentTurnOnModel(
  model: string,
  messages: GroqChatMessage[],
  tools: GroqToolSpec[],
): Promise<GroqAgentTurnResult | null> {
  const apiKey = getGroqKey();
  const inputText = messages
    .map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")))
    .join("\n");

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.2,
    top_p: 0.95,
    max_completion_tokens: groqMaxCompletionTokens({
      model,
      inputText,
      preferredCap: 1024,
    }),
    tools: tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    })),
    tool_choice: "auto",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let response: Response;

  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Groq rejected GROQ_API_KEY.");
    }

    throw new Error(`${model}: ${data.error?.message ?? `Groq returned HTTP ${response.status}.`}`);
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

/** Same model-fallback behavior as callGroqWithFallback, extended with tool-calling. */
export async function callGroqAgentTurn(messages: GroqChatMessage[], tools: GroqToolSpec[]): Promise<GroqAgentTurnResult> {
  const models = getGroqModels();
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = await callGroqAgentTurnOnModel(model, messages, tools);
      if (result) {
        return result;
      }

      lastError = new Error(`${model} returned neither content nor a tool call.`);
    } catch (error) {
      lastError = error;

      if (error instanceof Error && error.message.includes("rejected GROQ_API_KEY")) {
        throw error;
      }
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "All Dante models failed to produce a response.");
}
