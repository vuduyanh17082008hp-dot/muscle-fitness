import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { loadCoachContext } from "@/lib/nutrition/coach/context"
import { readCoachJsonBody } from "@/lib/nutrition/coach/http"
import { coachRequestSchema } from "@/lib/nutrition/coach/schema"
import { runCoachAction } from "@/lib/nutrition/coach/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/nutrition/coach — deterministic Nutrition Coach actions (build,
 * choose, suggest, craving, edit). No LLM and no writes: it returns Active
 * Meal Drafts only. Logging goes through /api/nutrition/coach/log -> the
 * shared pending-action confirmation. The conversational coach lives on
 * /api/chatbot with coachMode "nutrition" (shared auth + rate limit).
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const jsonBody = await readCoachJsonBody(request)
  if (!jsonBody.ok) {
    return NextResponse.json(
      { ok: false, error: jsonBody.tooLarge ? "Request body is too large." : "Invalid JSON body." },
      { status: jsonBody.tooLarge ? 413 : 400 },
    )
  }

  const parsed = coachRequestSchema.safeParse(jsonBody.body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid Nutrition Coach request." }, { status: 400 })
  }

  try {
    const loaded = await loadCoachContext(supabase, user.id)
    if (!loaded.ok) return NextResponse.json({ ok: false, code: loaded.code, error: loaded.message }, { status: 422 })

    return NextResponse.json(runCoachAction(loaded.ctx, parsed.data))
  } catch (error) {
    console.error("[NUTRITION COACH ERROR]", error)
    return NextResponse.json({ ok: false, error: "Nutrition Coach couldn't process that right now." }, { status: 500 })
  }
}
