import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { createPendingAction } from "@/lib/dante-core/tools/pending-actions"
import { loadCoachContext } from "@/lib/nutrition/coach/context"
import { isStale, STALE_MESSAGE } from "@/lib/nutrition/coach/draft"
import { mealFingerprint } from "@/lib/nutrition/coach/fingerprint"
import { readCoachJsonBody } from "@/lib/nutrition/coach/http"
import { isIngredientBlocked, requireIngredient } from "@/lib/nutrition/coach/ingredients"
import { totalsFor } from "@/lib/nutrition/coach/macros"
import { draftInputSchema } from "@/lib/nutrition/coach/schema"
import { resolveLocalToday } from "@/lib/nutrition/food-log/load-food-log-context"
import { MEAL_TYPES } from "@/lib/nutrition/food-log/types"

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
 * same meal again. The meal fingerprint is similarity-only.
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
  const ingredients = draft.ingredients.map(({ ingredientId, grams }) => ({ ingredientId, grams }))

  try {
    const loaded = await loadCoachContext(supabase, user.id)
    if (!loaded.ok) {
      return NextResponse.json({ ok: false, code: loaded.code, error: loaded.message }, { status: 422 })
    }
    const blockedTerms = [...loaded.ctx.guards.allergies, ...loaded.ctx.guards.excludedFoods]
    const blocked = ingredients
      .map(({ ingredientId }) => requireIngredient(ingredientId))
      .filter((ingredient) => isIngredientBlocked(ingredient, blockedTerms))
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "BLOCKED_INGREDIENT",
          error: `This meal contains a food from your current allergies or exclusions: ${blocked.map((item) => item.shortName).join(", ")}.`,
        },
        { status: 422 },
      )
    }

    // The draft's snapshot is client-held; Athlete State stays canonical. "Keep current draft"
    // (acknowledgedContextVersion === current version) accepts the old meal concept only —
    // allergy/exclusion checks above and at confirmation are never skipped.
    const current = loaded.ctx.snapshot
    if (isStale(draft.sessionContextSnapshot, current) && draft.acknowledgedContextVersion !== current.contextVersion) {
      return NextResponse.json({ ok: false, code: "STALE_CONTEXT", message: STALE_MESSAGE, actions: ["Refresh meal", "Keep current draft"] })
    }

    const fingerprint = mealFingerprint(ingredients)

    if (!acknowledgeSimilar) {
      const today = await resolveLocalToday(supabase, user.id)
      const { data: similar } = await supabase
        .from("food_logs")
        .select("id, food_name")
        .eq("user_id", user.id)
        .eq("log_date", today)
        .eq("source", "local")
        .eq("source_id", fingerprint)
        .limit(1)

      if (similar && similar.length > 0) {
        return NextResponse.json({
          ok: false,
          code: "SIMILAR_MEAL_LOGGED_TODAY",
          message: "You logged a similar meal earlier today. Log again?",
          actions: ["Log again", "Cancel"],
        })
      }
    }

    const totals = totalsFor(ingredients)
    const args = { mealType, name: draft.name, ingredients, context: current }
    const summary = `Log "${draft.name}" (~${Math.round(totals.calories)} kcal, ${Math.round(totals.protein)}g protein) as ${mealType.replace("_", " ")}`
    const pending = await createPendingAction(supabase, user.id, "log_meal_draft", args, summary)

    return NextResponse.json({ ok: true, pendingConfirmation: pending, nutrition: totals })
  } catch (error) {
    console.error("[NUTRITION COACH LOG ERROR]", error)
    return NextResponse.json({ ok: false, error: "Couldn't prepare that log right now." }, { status: 500 })
  }
}
