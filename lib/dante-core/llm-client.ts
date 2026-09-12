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
    max_completion_tokens: gptOss ? 1536 : 1024,
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
