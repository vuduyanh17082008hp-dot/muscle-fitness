import { NextResponse } from "next/server";
import { getSession } from "@/features/workout/store";
import { listExercises } from "@/features/workout/store";
import { buildNextSessionRecommendation } from "@/features/workout/calculations";
import { listSessions } from "@/features/workout/store";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let recommendation = null;
  if (session.status === "completed") {
    const [sessions, exercises] = await Promise.all([
      listSessions(),
      listExercises(),
    ]);
    recommendation = buildNextSessionRecommendation(
      session,
      sessions,
      exercises,
    );
  }

  return NextResponse.json({ session, recommendation });
}
