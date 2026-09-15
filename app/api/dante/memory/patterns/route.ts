import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  forgetLearnedPattern,
  loadLearnedPatterns,
  setPatternRequiresConfirmation,
} from "@/lib/dante-core/memory-hierarchy/load-patterns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "DANTE LEARNED" memory control surface (mission Part 14). Every
 * operation is scoped to the authenticated user in
 * lib/dante-core/memory-hierarchy/load-patterns.ts AND independently
 * enforced by dante_learned_patterns' RLS policies.
 */

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const patterns = await loadLearnedPatterns(supabase, user.id);
  return NextResponse.json({
    ok: true,
    patterns,
    // Empty when the optional adaptive-memory migration is not applied.
    // Clients should treat this as "nothing learned / feature idle", not an error.
  });
}

const actionSchema = z.object({
  patternId: z.string().uuid(),
  action: z.enum(["keep", "ask_first", "forget"]),
});

export async function POST(request: Request) {
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

  const parsed = actionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { patternId, action } = parsed.data;

  if (action === "forget") {
    const result = await forgetLearnedPattern(supabase, user.id, patternId);
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // "keep" clears any prior ASK FIRST override; "ask_first" sets it.
  const result = await setPatternRequiresConfirmation(supabase, user.id, patternId, action === "ask_first");

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
