import {
  logAiCoachFailure,
  mapAiErrorToUserMessage,
} from "@/lib/ai-coach/errors";
import {
  getAiClient,
  getSafeProviderInfo,
  usesResponsesApi,
} from "@/lib/ai-coach/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const info = getSafeProviderInfo();

  /*
   * Production health stays lightweight — no inference call.
   */
  if (process.env.NODE_ENV === "production") {
    try {
      // Validate config without leaking secrets.
      getAiClient();

      return Response.json({
        ok: true,
        provider: info.provider,
        model: info.model,
        baseUrlConfigured: info.baseUrlConfigured,
        transport: info.transport,
      });
    } catch (error) {
      logAiCoachFailure("health config failed", error, {
        provider: info.provider,
        model: info.model,
      });

      return Response.json(
        {
          ok: false,
          provider: info.provider,
          model: info.model,
          baseUrlConfigured: info.baseUrlConfigured,
          transport: info.transport,
          error: "AI_UNAVAILABLE",
          message: mapAiErrorToUserMessage(error),
        },
        {
          status: 500,
        },
      );
    }
  }

  try {
    const client = getAiClient();

    if (usesResponsesApi()) {
      const response = await client.responses.create({
        model: info.model,
        store: false,
        input: "Reply with exactly: AI_COACH_CONNECTED",
        max_output_tokens: 32,
      });

      const output = response.output_text.trim();

      return Response.json({
        ok: output.includes("AI_COACH_CONNECTED"),
        provider: info.provider,
        model: info.model,
        baseUrlConfigured: info.baseUrlConfigured,
        transport: info.transport,
      });
    }

    const response = await client.chat.completions.create({
      model: info.model,
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
      provider: info.provider,
      model: info.model,
      baseUrlConfigured: info.baseUrlConfigured,
      transport: info.transport,
    });
  } catch (error) {
    logAiCoachFailure("health check failed", error, {
      provider: info.provider,
      model: info.model,
    });

    return Response.json(
      {
        ok: false,
        provider: info.provider,
        model: info.model,
        baseUrlConfigured: info.baseUrlConfigured,
        transport: info.transport,
        error: "AI_UNAVAILABLE",
        message: mapAiErrorToUserMessage(error),
      },
      {
        status: 500,
      },
    );
  }
}
