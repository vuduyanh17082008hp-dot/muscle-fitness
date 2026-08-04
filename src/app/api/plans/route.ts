import { NextResponse } from "next/server";
import { createPlan, listPlans } from "@/features/workout/store";

export async function GET() {
  const plans = await listPlans();
  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const plan = await createPlan({
      name: body.name.trim(),
      description: body.description,
    });
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
