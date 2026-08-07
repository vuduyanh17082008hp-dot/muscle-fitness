import {
  getAiModelName,
  getOpenAI,
} from "@/lib/ai-coach/server";
import {
  getAiProviderConfig,
  usesResponsesApi,
} from "@/lib/ai-coach/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown AI provider error.";
}

export async function GET() {
  /*
   * Không để health test công khai trên production
   * vì mỗi lần gọi sẽ sử dụng API.
   */
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      {
        error: "Not found.",
      },
      {
        status: 404,
      },
    );
  }

  let model = "unknown";
  let provider = "unknown";

  try {
    const config = getAiProviderConfig();
    model = config.model;
    provider = config.name;

    const openai = getOpenAI();

    if (usesResponsesApi()) {
      const response = await openai.responses.create({
        model,
        store: false,
        input: "Reply with exactly: AI_COACH_CONNECTED",
        max_output_tokens: 32,
      });

      const output = response.output_text.trim();

      return Response.json({
        ok: output.includes("AI_COACH_CONNECTED"),
        provider,
        model,
        mode: "responses",
        output,
        responseId: response.id,
      });
    }

    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: "Reply with exactly: AI_COACH_CONNECTED",
        },
      ],
      max_tokens: 32,
    });

    const output =
      response.choices[0]?.message?.content?.trim() ?? "";

    return Response.json({
      ok: output.includes("AI_COACH_CONNECTED"),
      provider,
      model,
      mode: "chat.completions",
      output,
      responseId: response.id,
    });
  } catch (error) {
    console.error("AI Coach health check failed:", error);

    return Response.json(
      {
        ok: false,
        provider,
        model: model || getAiModelNameFallback(),
        error: getErrorMessage(error),
      },
      {
        status: 500,
      },
    );
  }
}

function getAiModelNameFallback(): string {
  try {
    return getAiModelName();
  } catch {
    return "unknown";
  }
}
