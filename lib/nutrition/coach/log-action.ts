import { z } from "zod"

import { MEAL_TYPES, type MealType } from "@/lib/nutrition/food-log/types"

/**
 * Chat-driven meal-log action lifecycle (pure: no Supabase, no LLM).
 *
 *   PROPOSED → AWAITING_REQUIRED_INPUT → READY_FOR_CONFIRMATION → CONFIRMED → SERVER_VALIDATED → EXECUTED → VERIFIED
 *   terminal off-ramps: REJECTED (user cancelled), EXPIRED (server TTL), FAILED (write refused/failed), UNKNOWN_OUTCOME
 *   (the confirm's result never came back — the write may or may not have happened).
 *
 * The authority is the server's `dante_tool_actions` row (atomic CAS confirm; its UUID is the food-log idempotency key).
 * This state is only the chat's pointer to it, echoed by the client: a forged `actionId` can confirm nothing the
 * authenticated user doesn't own, and the meal/numbers in every reply come from the server, never from this echo.
 * Only the stages that outlive a turn are stored; CONFIRMED/SERVER_VALIDATED happen inside one request.
 */

export const LOG_ACTION_STAGES = ["PROPOSED", "AWAITING_REQUIRED_INPUT", "READY_FOR_CONFIRMATION", "CONFIRMED", "SERVER_VALIDATED", "EXECUTED", "VERIFIED", "REJECTED", "EXPIRED", "FAILED", "UNKNOWN_OUTCOME"] as const
export type LogActionStage = (typeof LOG_ACTION_STAGES)[number]

const STORED_STAGES = ["AWAITING_REQUIRED_INPUT", "READY_FOR_CONFIRMATION", "UNKNOWN_OUTCOME", "EXECUTED", "VERIFIED"] as const

export const pendingLogSchema = z.object({
  stage: z.enum(STORED_STAGES),
  /** What the next answer must supply: a meal type, a "log again?" for a similar meal, or a retry after a failed write. */
  missing: z.enum(["mealType", "similarAck", "retry"]).nullable().optional(),
  draftId: z.string().uuid(),
  mealName: z.string().max(120),
  /** Ingredient fingerprint at proposal time: a draft edited after the proposal is never logged under the old action. */
  fingerprint: z.string().max(400).optional(),
  mealType: z.enum(MEAL_TYPES as [MealType, ...MealType[]]).nullable().optional(),
  actionId: z.string().uuid().optional(),
  foodLogId: z.string().max(64).optional(),
  /** Set when the last reply asked which of two waiting things a bare "confirm" meant. */
  ambiguity: z.enum(["other_draft", "modification"]).nullable().optional(),
  lang: z.enum(["en", "vi"]).optional(),
  expiresAt: z.string().max(40),
})
export type PendingLog = z.infer<typeof pendingLogSchema>

const L = "(?<![\\p{L}\\p{N}])"
const R = "(?![\\p{L}\\p{N}])"
const w = (source: string) => new RegExp(`${L}(?:${source})${R}`, "iu")

const MEAL_WORDS: Array<[RegExp, MealType]> = [
  [w("pre[- ]?workout|trước (?:khi )?tập"), "pre_workout"],
  [w("post[- ]?workout|sau (?:khi )?tập"), "post_workout"],
  [w("breakfast|bữa sáng|ăn sáng|sáng"), "breakfast"],
  [w("lunch|bữa trưa|ăn trưa|trưa"), "lunch"],
  [w("dinner|supper|bữa tối|ăn tối|tối"), "dinner"],
  [w("snacks?|ăn vặt|bữa phụ|ăn nhẹ"), "snack"],
]

/** The one meal type a message names; null when it names none or more than one ("not lunch, dinner" is asked again). */
export function mealTypeIn(message: string): MealType | null {
  const found = new Set(MEAL_WORDS.filter(([pattern]) => pattern.test(message)).map(([, type]) => type))
  // "post-workout snack" names the slot by its training context; the snack word is the food, not a second slot.
  if (found.has("post_workout") || found.has("pre_workout")) found.delete("snack")
  return found.size === 1 ? [...found][0] : null
}

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ").trim()
const NEGATION = w("no|nope|nah|not|don'?t|do not|cancel|stop|wait|hold on|never ?mind|không|khoan|đừng|hủy|huỷ|thôi")
const CONFIRM_WORD = w("confirm(?:ed)?|xác nhận|đồng ý")
const BARE_YES = /^(?:(?:ok(?:ay)?|yes|yeah|yep|yup|sure|please|go ahead|do it|log it|yes log it|ok log it|that'?s right|correct|right|ừ|ừm|có|được|ok luôn|chuẩn|đúng rồi)\s*)+$/iu

/** A short "yes / confirm / log it" with no negation. */
export function isLogConfirm(message: string): boolean {
  const text = normalize(message)
  if (!text || text.split(" ").length > 6 || NEGATION.test(text)) return false
  return CONFIRM_WORD.test(text) || BARE_YES.test(text)
}

/** "confirm" / "xác nhận" itself — not a bare "yes", which also answers offers. */
export function isExplicitConfirm(message: string): boolean {
  return isLogConfirm(message) && CONFIRM_WORD.test(normalize(message))
}

/** A short "no / cancel / don't log it". "No, log this now" is a log request, not a cancel — callers check that first. */
export function isLogCancel(message: string): boolean {
  const text = normalize(message)
  if (!text || text.split(" ").length > 6) return false
  return /^(?:no|nope|nah|cancel(?: it| that)?|don'?t(?: log(?: it| that)?)?|do not log(?: it)?|stop|never ?mind|forget it|không|thôi|hủy|huỷ|đừng(?: ghi)?)(?:\s+(?:it|that|thanks|please|đi|nhé))*$/iu.test(text)
}

const EARLIER = w("earlier|first|previous|old(?:er)?|original|the other one|lúc nãy|trước|cũ")
const CURRENT = w("this one|current|new(?:er)?|latest|on screen|món này|cái này|mới")

/** "the earlier one" / "this one" when the last reply asked which of two meals to log; null = didn't say. */
export function pickCompeting(message: string): "earlier" | "current" | null {
  const earlier = EARLIER.test(message)
  const current = CURRENT.test(message)
  return earlier === current ? null : earlier ? "earlier" : "current"
}

/** Exact ingredient identity (not the bucketed similarity fingerprint): any edit after a proposal is a different meal. */
export function draftIdentity(draft: { ingredients: Array<{ ingredientId: string; grams: number }> }): string {
  const key = draft.ingredients.map((item) => `${item.ingredientId}@${item.grams}`).sort().join(",")
  let hash = 5381
  for (let i = 0; i < key.length; i += 1) hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0
  return `${draft.ingredients.length}:${hash.toString(36)}`
}

export const isLive = (pending: PendingLog | null | undefined, now: Date): pending is PendingLog => Boolean(pending) && Date.parse(pending!.expiresAt) > now.getTime()

const VI_MEAL: Record<MealType, string> = { breakfast: "bữa sáng", lunch: "bữa trưa", dinner: "bữa tối", snack: "bữa phụ", pre_workout: "bữa trước tập", post_workout: "bữa sau tập" }
export const mealLabelFor = (type: MealType, lang: "en" | "vi") => (lang === "vi" ? VI_MEAL[type] : type.replace("_", "-"))

export const MEAL_TYPE_QUESTION = {
  en: (name: string) => `Sure — I'll add “${name}” to today's food log (as eaten today, not a future meal plan). Which meal was it: breakfast, lunch, dinner or a snack? Nothing is saved until you confirm.`,
  vi: (name: string) => `Được — mình sẽ ghi “${name}” vào nhật ký ăn hôm nay (món đã ăn hôm nay, không phải kế hoạch bữa sau). Đây là bữa nào: sáng, trưa, tối hay bữa phụ? Chưa lưu gì cho đến khi bạn xác nhận.`,
}
