import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown OpenAI error.";
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

  const apiKey = process.env.OPENAI_API_KEY;

  const model =
    process.env.OPENAI_MODEL ||
    "gpt-5.6-terra";

  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        model,
        error:
          "OPENAI_API_KEY chưa được khai báo trong .env.local.",
      },
      {
        status: 500,
      },
    );
  }

  const openai = new OpenAI({
    apiKey,
    timeout: 30_000,
    maxRetries: 1,
  });

  try {
    const response =
      await openai.responses.create({
        model,
        store: false,
        input:
          "Reply with exactly: AI_COACH_CONNECTED",
        max_output_tokens: 32,
      });

    const output = response.output_text.trim();

    return Response.json({
      ok: output.includes(
        "AI_COACH_CONNECTED",
      ),
      model,
      output,
      responseId: response.id,
    });
  } catch (error) {
    console.error(
      "OpenAI health check failed:",
      error,
    );

    return Response.json(
      {
        ok: false,
        model,
        error: getErrorMessage(error),
      },
      {
        status: 500,
      },
    );
  }
}