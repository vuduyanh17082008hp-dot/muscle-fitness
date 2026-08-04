import { NextResponse } from "next/server";
import { deletePlan, getPlan, savePlan } from "@/features/workout/store";
import type { WorkoutPlan } from "@/features/workout/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const plan = await getPlan(id);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ plan });
}

export async function PUT(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as WorkoutPlan;
    if (body.id !== id) {
      return NextResponse.json({ error: "id mismatch" }, { status: 400 });
    }
    const plan = await savePlan(body);
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const { id } = await context.params;
  await deletePlan(id);
  return NextResponse.json({ ok: true });
}
