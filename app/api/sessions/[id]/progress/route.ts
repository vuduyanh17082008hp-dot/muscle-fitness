import { NextResponse } from "next/server";

import {
  handleSessionAction,
  parseActionPayload,
} from "@/lib/workouts/session-mutations";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const { actionName, payload } =
    parseActionPayload(body);

  const result = await handleSessionAction(
    id,
    actionName || "save_set",
    payload,
  );

  return NextResponse.json(result, {
    status: result.success ? 200 : 400,
  });
}
