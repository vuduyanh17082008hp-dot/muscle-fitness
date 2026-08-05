import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data: fitness, error: fitnessError } =
    await supabase
      .from("fitness_profiles")
      .select(
        "weight_kg, height_cm, goal, calories_target, protein_target_g, carbs_target_g, fat_target_g",
      )
      .eq("user_id", user.id)
      .maybeSingle();

  if (fitnessError) {
    return NextResponse.json(
      { error: fitnessError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    userId: user.id,
    fitness,
    note: "Weight history endpoints will expand as check-in writes are added.",
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: {
    weightKg?: number;
  } = {};

  try {
    body = (await request.json()) as {
      weightKg?: number;
    };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const weightKg = Number(body.weightKg);

  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400) {
    return NextResponse.json(
      { error: "Enter a valid weight between 20 and 400 kg." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("fitness_profiles")
    .update({
      weight_kg: weightKg,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    weightKg,
  });
}
