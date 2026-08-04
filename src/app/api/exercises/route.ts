import { NextResponse } from "next/server";
import { listExercises, upsertExercise } from "@/features/workout/store";
import type { Exercise } from "@/features/workout/types";

export async function GET() {
  const exercises = await listExercises();
  return NextResponse.json({ exercises });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Exercise;
    if (!body.id || !body.name) {
      return NextResponse.json({ error: "id and name required" }, { status: 400 });
    }
    const exercise = await upsertExercise(body);
    return NextResponse.json({ exercise });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
