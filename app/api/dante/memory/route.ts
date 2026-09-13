import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { CANONICAL_MUSCLES } from "@/lib/training/muscle-taxonomy";
import { deleteDanteMemory, loadDanteMemory, saveDanteMemory } from "@/lib/dante-core/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dante Memory CRUD (spec Part "5. DANTE MEMORY"). Every operation is
 * scoped to the authenticated user via `.eq("user_id", user.id)` in
 * lib/dante-core/memory.ts AND enforced independently by the table's
 * RLS policies (auth.uid() = user_id) — either layer alone would
 * already prevent cross-user access.
 */

const exerciseNameSchema = z.string().trim().min(1).max(120);

const patchSchema = z.object({
  preferredExercises: z.array(exerciseNameSchema).max(50).optional(),
  dislikedExercises: z.array(exerciseNameSchema).max(50).optional(),
  weakPointPriorities: z
    .array(z.enum(CANONICAL_MUSCLES as [string, ...string[]]))
    .max(CANONICAL_MUSCLES.length)
    .optional(),
  coachingPreference: z.enum(["direct", "encouraging", "detailed", "concise"]).nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const memory = await loadDanteMemory(supabase, user.id);
  return NextResponse.json({ ok: true, memory });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await saveDanteMemory(supabase, user.id, parsed.data);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, memory: result.memory });
}

export async function DELETE() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await deleteDanteMemory(supabase, user.id);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
