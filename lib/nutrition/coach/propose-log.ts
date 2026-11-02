import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createPendingAction, type CreatePendingActionResult } from "@/lib/dante-core/tools/pending-actions"
import { resolveLocalToday } from "@/lib/nutrition/food-log/load-food-log-context"
import type { MealType } from "@/lib/nutrition/food-log/types"

import { loadCoachContext } from "./context"
import { isStale, STALE_MESSAGE } from "./draft"
import { mealFingerprint } from "./fingerprint"
import { isIngredientBlocked, requireIngredient } from "./ingredients"
import { totalsFor } from "./macros"
import type { CoachContext, ContextSnapshot, DraftItem, MacroTotals } from "./types"

export type LoggableDraft = { name: string; ingredients: DraftItem[]; sessionContextSnapshot: ContextSnapshot; acknowledgedContextVersion: string | null }

export type ProposeLogResult =
  | { ok: true; pending: CreatePendingActionResult; nutrition: MacroTotals; fingerprint: string }
  | { ok: false; code: "CONTEXT_UNAVAILABLE"; contextCode: string; message: string }
  | { ok: false; code: "BLOCKED_INGREDIENT"; message: string }
  | { ok: false; code: "STALE_CONTEXT"; message: string }
  | { ok: false; code: "SIMILAR_MEAL_LOGGED_TODAY"; message: string }

/**
 * PROPOSES logging a meal draft: validates it against the CURRENT server context and creates exactly one pending action
 * (dante_tool_actions, tool log_meal_draft). Nothing is written to food_logs here — only a confirmed action can do that,
 * and the action's UUID is the food-log idempotency key. Shared by POST /api/nutrition/coach/log (panel button) and the
 * Gemma chat, so both paths apply the same allergy / stale-context / similar-meal checks.
 *
 * `ctx` lets the chat pass the context it already loaded (its guards include allergies disclosed in this chat — stricter,
 * never looser); without it the stored context is loaded here.
 */
export async function proposeDraftLog(
  supabase: SupabaseClient,
  userId: string,
  draft: LoggableDraft,
  mealType: MealType,
  options: { acknowledgeSimilar?: boolean; ctx?: CoachContext } = {},
): Promise<ProposeLogResult> {
  const ingredients = draft.ingredients.map(({ ingredientId, grams }) => ({ ingredientId, grams }))
  let ctx = options.ctx
  if (!ctx) {
    const loaded = await loadCoachContext(supabase, userId)
    if (!loaded.ok) return { ok: false, code: "CONTEXT_UNAVAILABLE", contextCode: loaded.code, message: loaded.message }
    ctx = loaded.ctx
  }

  const blockedTerms = [...ctx.guards.allergies, ...ctx.guards.excludedFoods]
  const blocked = ingredients.map(({ ingredientId }) => requireIngredient(ingredientId)).filter((ingredient) => isIngredientBlocked(ingredient, blockedTerms))
  if (blocked.length > 0) {
    return { ok: false, code: "BLOCKED_INGREDIENT", message: `This meal contains a food from your current allergies or exclusions: ${blocked.map((item) => item.shortName).join(", ")}.` }
  }

  // The draft's snapshot is client-held; Athlete State stays canonical. "Keep current draft" (acknowledgedContextVersion ===
  // current version) accepts the old meal concept only — allergy/exclusion checks above and at confirmation are never skipped.
  const current = ctx.snapshot
  if (isStale(draft.sessionContextSnapshot, current) && draft.acknowledgedContextVersion !== current.contextVersion) {
    return { ok: false, code: "STALE_CONTEXT", message: STALE_MESSAGE }
  }

  const fingerprint = mealFingerprint(ingredients)
  if (!options.acknowledgeSimilar) {
    const today = await resolveLocalToday(supabase, userId)
    const { data: similar } = await supabase.from("food_logs").select("id, food_name").eq("user_id", userId).eq("log_date", today).eq("source", "local").eq("source_id", fingerprint).limit(1)
    if (similar && similar.length > 0) return { ok: false, code: "SIMILAR_MEAL_LOGGED_TODAY", message: "You logged a similar meal earlier today. Log again?" }
  }

  const totals = totalsFor(ingredients)
  const args = { mealType, name: draft.name, ingredients, context: current }
  const summary = `Log "${draft.name}" (~${Math.round(totals.calories)} kcal, ${Math.round(totals.protein)}g protein) as ${mealType.replace("_", " ")}`
  const pending = await createPendingAction(supabase, userId, "log_meal_draft", args, summary)
  return { ok: true, pending, nutrition: totals, fingerprint }
}
