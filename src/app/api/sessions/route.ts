import { NextResponse } from "next/server";
import { listSessions, startSession } from "@/features/workout/store";

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { planId?: string; dayId?: string };
    if (!body.planId || !body.dayId) {
      return NextResponse.json(
        { error: "planId and dayId required" },
        { status: 400 },
      );
    }
    const session = await startSession({
      planId: body.planId,
      dayId: body.dayId,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
