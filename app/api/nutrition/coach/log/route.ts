import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { readCoachJsonBody } from "@/lib/nutrition/coach/http"
import { proposeDraftLog } from "@/lib/nutrition/coach/propose-log"
import { draftInputSchema } from "@/lib/nutrition/coach/schema"
import { MEAL_TYPES, type MealType } from "@/lib/nutrition/food-log/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  draft: draftInputSchema,
  mealType: z.enum(MEAL_TYPES as [string, ...string[]]),
  /** Set after the user answers "Log again?" for a similar meal. */
  acknowledgeSimilar: z.boolean().optional(),
})

/**
 * POST /api/nutrition/coach/log — PROPOSES logging an Active Meal Draft.
 * Nothing is written to food_logs here: this creates one pending action
 * (dante_tool_actions) that the user must confirm via
 * /api/dante/tools/confirm. The confirmed action's UUID is the food-log
 * idempotency key, so retries can't double-log and a new action can log the
 * same meal again. The meal fingerprint is similarity-only. The validation
 * itself is shared with the Gemma chat (lib/nutrition/coach/propose-log.ts).
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

  const parsed = requestSchema.safeParse(jsonBody.body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid meal log request." }, { status: 400 })
  }

  const { draft, mealType, acknowledgeSimilar } = parsed.data

  try {
    const result = await proposeDraftLog(supabase, user.id, draft, mealType as MealType, { acknowledgeSimilar })
    if (result.ok) return NextResponse.json({ ok: true, pendingConfirmation: result.pending, nutrition: result.nutrition })
    switch (result.code) {
      case "CONTEXT_UNAVAILABLE":
        return NextResponse.json({ ok: false, code: result.contextCode, error: result.message }, { status: 422 })
      case "BLOCKED_INGREDIENT":
        return NextResponse.json({ ok: false, code: result.code, error: result.message }, { status: 422 })
      case "STALE_CONTEXT":
        return NextResponse.json({ ok: false, code: result.code, message: result.message, actions: ["Refresh meal", "Keep current draft"] })
      case "SIMILAR_MEAL_LOGGED_TODAY":
        return NextResponse.json({ ok: false, code: result.code, message: result.message, actions: ["Log again", "Cancel"] })
    }
  } catch (error) {
    console.error("[NUTRITION COACH LOG ERROR]", error)
    return NextResponse.json({ ok: false, error: "Couldn't prepare that log right now." }, { status: 500 })
  }
}
