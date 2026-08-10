import { NextResponse } from "next/server";

import {
  getAiClient,
  getAiModel,
  getSafeProviderInfo,
} from "@/lib/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/test
 *
 * Simple server-side AI provider health check.
 *
 * It verifies that:
 * - the configured provider can initialize
 * - the configured model can be resolved
 * - a real request can reach the provider
 *
 * No API keys are ever returned to the browser.
 */
export async function GET() {
  try {
    const client = getAiClient();
    const model = getAiModel();
    const providerInfo = getSafeProviderInfo();

    const completion = await client.chat.completions.create({
      model,

      messages: [
        {
          role: "system",
          content:
            "You are the Muscle Fitness AI Coach. Keep responses concise.",
        },
        {
          role: "user",
          content:
            "Reply with exactly: Muscle Fitness AI is working.",
        },
      ],

      max_tokens: 50,
      temperature: 0,
    });

    const message =
      completion.choices?.[0]?.message?.content?.trim() ||
      "AI returned an empty response.";

    return NextResponse.json(
      {
        success: true,
        provider: providerInfo,
        model,
        message,
      },
      {
        status: 200,
      },
    );
  } catch (error: unknown) {
    let internalMessage = "Unknown AI provider error.";

    if (error instanceof Error) {
      internalMessage = error.message;
    }

    console.error("[Muscle Fitness AI Test]", {
      message: internalMessage,
    });

    /*
     * Do not expose:
     * - API keys
     * - authorization headers
     * - provider stack traces
     * - billing URLs
     *
     * to the client.
     */
    return NextResponse.json(
      {
        success: false,
        error: "AI_PROVIDER_UNAVAILABLE",
        message:
          "Muscle Fitness AI is currently unavailable. Check the server AI provider configuration.",
      },
      {
        status: 503,
      },
    );
  }
}