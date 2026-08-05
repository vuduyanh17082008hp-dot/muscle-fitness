export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatRequestBody = {
  message?: unknown
  messages?: unknown
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

function getUserMessage(
  body: unknown,
): string {
  if (!isRecord(body)) {
    return ""
  }

  const requestBody =
    body as ChatRequestBody

  if (
    typeof requestBody.message ===
    "string"
  ) {
    return requestBody.message.trim()
  }

  if (
    !Array.isArray(
      requestBody.messages,
    )
  ) {
    return ""
  }

  for (
    let index =
      requestBody.messages.length - 1;
    index >= 0;
    index -= 1
  ) {
    const item =
      requestBody.messages[index]

    if (!isRecord(item)) {
      continue
    }

    if (
      item.role === "user" &&
      typeof item.content === "string"
    ) {
      return item.content.trim()
    }
  }

  return ""
}

function createTestReply(
  message: string,
): string {
  const normalizedMessage =
    message.toLowerCase()

  if (
    normalizedMessage.includes(
      "calorie",
    ) ||
    normalizedMessage.includes(
      "calories",
    ) ||
    normalizedMessage.includes(
      "kcal",
    )
  ) {
    return [
      "Your calorie target should be based on your body weight,",
      "height, age, activity level and current goal.",
      "Complete onboarding so Muscle Fitness can calculate",
      "your initial calorie and macro targets.",
    ].join(" ")
  }

  if (
    normalizedMessage.includes(
      "protein",
    )
  ) {
    return [
      "A practical protein range for resistance training is",
      "approximately 1.6–2.2 grams per kilogram of body weight.",
      "Your exact target should match your goal and total calories.",
    ].join(" ")
  }

  if (
    normalizedMessage.includes(
      "workout",
    ) ||
    normalizedMessage.includes(
      "training",
    )
  ) {
    return [
      "Build your training plan around progressive overload,",
      "good technique, sufficient recovery and a weekly schedule",
      "you can follow consistently.",
    ].join(" ")
  }

  if (
    normalizedMessage.includes(
      "fat loss",
    ) ||
    normalizedMessage.includes(
      "lose weight",
    )
  ) {
    return [
      "For fat loss, use a moderate calorie deficit,",
      "keep protein high, continue resistance training",
      "and monitor your weekly weight trend.",
    ].join(" ")
  }

  if (
    normalizedMessage.includes(
      "muscle",
    ) ||
    normalizedMessage.includes(
      "bulk",
    )
  ) {
    return [
      "For muscle gain, use a small calorie surplus,",
      "train with progressive overload and track",
      "strength, body weight and recovery.",
    ].join(" ")
  }

  return [
    `I received your message: "${message}".`,
    "The Muscle Fitness AI Coach is currently running in test mode.",
    "The production AI integration can be connected after deployment.",
  ].join(" ")
}

export async function GET() {
  return Response.json({
    ok: true,
    service: "Muscle Fitness AI Coach",
    status: "ready",
    mode: "test",
  })
}

export async function POST(
  request: Request,
) {
  try {
    const body: unknown =
      await request.json()

    const userMessage =
      getUserMessage(body)

    if (!userMessage) {
      return Response.json(
        {
          ok: false,
          error:
            "Please provide a message.",
        },
        {
          status: 400,
        },
      )
    }

    const reply =
      createTestReply(userMessage)

    return Response.json({
      ok: true,

      /*
       * Trả cả message và reply để
       * tương thích với nhiều frontend.
       */
      message: reply,
      reply,

      mode: "test",
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown chatbot error."

    return Response.json(
      {
        ok: false,
        error:
          "Unable to process the chatbot request.",
        details:
          process.env.NODE_ENV ===
          "development"
            ? message
            : undefined,
      },
      {
        status: 500,
      },
    )
  }
}