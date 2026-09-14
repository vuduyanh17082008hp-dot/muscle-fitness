import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { confirmPendingAction, cancelPendingAction } from "@/lib/dante-core/tools/pending-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dante/tools/confirm — the ONLY HTTP entry point that can
 * turn a Dante tool-call proposal (created by
 * lib/dante-core/tools/orchestrate.ts) into a real write. Identity
 * always comes from the authenticated session (Part 17) — the request
 * body never carries a userId, and `confirmPendingAction`/
 * `cancelPendingAction` additionally scope every query to it, on top
 * of the table's own RLS policies.
 */

const requestSchema = z.object({
  actionId: z.string().uuid(),
  intent: z.enum(["confirm", "cancel"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid confirmation request." }, { status: 400 });
  }

  try {
    if (parsed.data.intent === "cancel") {
      const result = await cancelPendingAction(supabase, user.id, parsed.data.actionId);
      return NextResponse.json(result, { status: result.ok ? 200 : 404 });
    }

    const result = await confirmPendingAction(supabase, { supabase, userId: user.id, now: new Date(), cache: new Map() }, parsed.data.actionId);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    console.error("[DANTE TOOLS CONFIRM ERROR]", error);

    return NextResponse.json(
      { ok: false, error: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error.") : "Could not process this confirmation right now." },
      { status: 500 },
    );
  }
}
