export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/*
 * Legacy test-mode chatbot endpoint.
 * Production AI Coach uses /api/ai-coach/chat and /ai-coach.
 */

export async function GET() {
  return Response.json({
    ok: true,
    service: "Muscle Fitness AI Coach",
    status: "moved",
    mode: "production",
    chatPath: "/ai-coach",
    apiPath: "/api/ai-coach/chat",
    message:
      "The test-mode chatbot has been replaced by the production AI Coach.",
  })
}

export async function POST() {
  return Response.json(
    {
      ok: false,
      error:
        "This test-mode chatbot endpoint is retired. Use /ai-coach and POST /api/ai-coach/chat.",
      chatPath: "/ai-coach",
      apiPath: "/api/ai-coach/chat",
    },
    {
      status: 410,
    },
  )
}
