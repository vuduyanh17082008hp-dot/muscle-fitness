import { detectCravingKey } from "./craving"
import type { DraftOp } from "./draft"
import { findIngredientByText } from "./ingredients"
import type { ConstraintOverrides } from "./schema"
import type { CravingKey } from "./types"

/**
 * Deterministic message -> intent parser for the Nutrition Coach chat.
 * Pattern matching only — no model call — so safety routing, training
 * redirects and every number-changing edit are reproducible and testable.
 * Anything it can't map becomes `chat` (an LLM conversation over the
 * structured context; the LLM never computes totals).
 */

export const SAFETY_REPLY =
  "One meal doesn't require compensation. We can adjust the rest of the day around your overall target — no skipping meals, no punishing workouts. If food or eating feels stressful or out of control, talking to a doctor or a registered dietitian is a good next step."

export const TRAINING_REDIRECT =
  "That's a training or recovery question, so it's one for Dante — I only work on nutrition and I can't change your workouts or recovery. Ask Dante in the AI Coach, and bring me back anything about meals, macros or cravings."

const DISORDERED = /\b(starv\w*|purg\w*|laxative\w*|make myself (throw|vomit|sick)|throw (it )?up|vomit\w*|fast(ing)? for \d+\s*(days?|hours?)|skip (all|every) meals?|not eat (at all|for (days|a week)))\b/i
const COMPENSATION = /\b(burn (it |this |that |these )?off|work (it |this |that )?off|make up for (it|what|that|eating)|earn (it|this|my|the|food|dinner|lunch|breakfast)|punish\w*|compensat\w*|cheat meal.*(run|exercise))\b/i
const TRAINING = /\b(workout|exercise|training|program|routine|sets|reps|squat|deadlift|bench|injur\w*|pain|sore|soreness|recovery|rest day|cardio|stretch\w*|mobility)\b/i
const FOODISH = /\b(meal|food|eat|eating|calorie|calories|kcal|protein|carb|carbs|macro|macros|recipe|snack|breakfast|lunch|dinner|ingredient|cook|cooking|hungry|craving|craving)\b/i

export type Intent =
  | { kind: "safety"; reply: string }
  | { kind: "redirect_training"; reply: string }
  | { kind: "build"; overrides: ConstraintOverrides; foodIds: string[]; unresolvedFoods: string[]; proteinPriority: boolean }
  | { kind: "craving"; key: CravingKey | null }
  | { kind: "op"; op: DraftOp }
  | { kind: "swap"; fromText: string; toText: string }
  | { kind: "remove_missing"; text: string }
  | { kind: "remove"; text: string }
  | { kind: "portion"; text: string; factor: number }
  | { kind: "swap_missing_target"; text: string }
  | { kind: "need_foods" }
  | { kind: "chat" }

/**
 * "lots of protein", "high protein", "protein-heavy", "protein focused", "protein-rich", "more protein":
 * a protein-priority MODIFIER on the request, never a food. Matched before the food-list parser so
 * "a Vietnamese meal with lots of protein" can no longer yield food = "lots of protein".
 */
const PROTEIN_PRIORITY = /\b(?:(?:with|and|plus)\s+)?(?:(?:lots?|plenty|loads?|tons?|heaps?|a (?:lot|ton|load|bunch)|a good amount|extra|more|high|higher|good)\s+(?:of\s+)?protein|protein[- ](?:heavy|focused|forward|packed|rich|dense)|high[- ]protein|focus(?:ed)? on protein)\b/gi

export function isSafetyMessage(message: string): boolean {
  return DISORDERED.test(message) || COMPENSATION.test(message)
}

/** True when a model reply tries to prescribe compensation/restriction — replaced with SAFETY_REPLY. */
export function isUnsafeCoachReply(reply: string): boolean {
  return COMPENSATION.test(reply) || /\b(starve|purge|you must earn|skip (dinner|lunch|breakfast|meals) (entirely|completely))\b/i.test(reply)
}

function splitFoods(text: string): string[] {
  return text
    .split(/,|\band\b|\bplus\b|\bwith\b|\+|&/i)
    .map((part) => part.replace(/\b(some|the|my|a|an|only|just|already|at home|in the fridge)\b/gi, "").trim())
    .filter((part) => part.length > 1)
}

export function resolveFoods(texts: string[]): { ids: string[]; unresolved: string[] } {
  const ids: string[] = []
  const unresolved: string[] = []
  for (const text of texts) {
    const found = findIngredientByText(text)
    if (found) {
      if (!ids.includes(found.id)) ids.push(found.id)
    } else {
      unresolved.push(text)
    }
  }
  return { ids, unresolved }
}

function calorieNumber(message: string): { value: number; strict: boolean } | null {
  const strict = message.match(/\b(?:under|below|less than|fewer than|no more than|at most|max(?:imum)?(?: of)?|within|<=?)\s*(\d{2,4})\s*(?:k?cal(?:ories)?)?/i)
  if (strict && /cal|kcal/i.test(message)) return { value: Number(strict[1]), strict: true }
  const exact = message.match(/\b(\d{2,4})\s*(?:k?cal(?:ories)?)\b/i)
  if (exact) return { value: Number(exact[1]), strict: false }
  return null
}

const SENSORY_ADDS: Array<[RegExp, string]> = [
  [/\bsweet(er)?\b/i, "banana"],
  [/\bcrunch(y|ier)\b/i, "cucumber"],
  [/\b(spic(y|ier)|more heat|hotter)\b/i, "chili"],
  [/\b(creamy|creamier)\b/i, "greek_yogurt"],
  [/\b(salty|saltier|more umami|savou?ry)\b/i, "soy_sauce"],
  [/\b(tangy|tangier|fresher|more acid)\b/i, "lime"],
]

export function parseCoachMessage(message: string, options: { hasDraft: boolean }): Intent {
  const text = message.trim()
  const lower = text.toLowerCase()

  if (isSafetyMessage(text)) return { kind: "safety", reply: SAFETY_REPLY }
  if (TRAINING.test(text) && !FOODISH.test(text)) return { kind: "redirect_training", reply: TRAINING_REDIRECT }

  if (/^(undo|go back|revert)\b/.test(lower)) return { kind: "op", op: { type: "undo" } }
  if (/^redo\b/.test(lower)) return { kind: "op", op: { type: "redo" } }

  // Craving makeovers
  if (/\b(crav\w*|makeover)\b/.test(lower) || /\b(protein ice cream|chocolate cereal)\b/.test(lower)) {
    return { kind: "craving", key: detectCravingKey(lower) }
  }

  const swap = lower.match(/\b(?:swap|switch|replace|change)\s+(?:the\s+)?(.+?)\s+(?:for|with|to|into)\s+(.+?)[.!?]*$/) ?? lower.match(/\buse\s+(.+?)\s+instead of\s+(.+?)[.!?]*$/)
  if (swap && options.hasDraft) {
    const instead = /instead of/.test(lower)
    return { kind: "swap", fromText: instead ? swap[2] : swap[1], toText: instead ? swap[1] : swap[2] }
  }

  const missing = lower.match(/\b(?:i (?:don'?t|do not) have|i'?m out of|i have no|no)\s+(.+?)(?: at home| left)?[.!?]*$/)
  if (missing && options.hasDraft && !/calorie|kcal/.test(lower)) return { kind: "remove_missing", text: missing[1] }

  if (/\buse only (?:the )?(?:ingredients|foods|food|stuff)? ?(?:that )?i (?:already )?have\b/.test(lower) || /\bonly what i have\b/.test(lower)) {
    const list = lower.match(/\bi (?:already )?have\s*:?\s*(.+)$/)
    if (list) {
      const { ids } = resolveFoods(splitFoods(list[1]))
      if (ids.length > 0) return { kind: "op", op: { type: "use_available", ingredientIds: ids } }
    }
    return { kind: "need_foods" }
  }

  if (options.hasDraft) {
    // "Swap the whey" with no replacement: ask, never guess.
    const bareSwap = lower.match(/^(?:please\s+)?(?:swap|replace|switch out|change)\s+(?:the\s+)?([a-z][a-z ]+?)[.!?]*$/)
    if (bareSwap && resolveFoods([bareSwap[1]]).ids.length > 0 && !/\b(?:for|with|to|into|instead)\b/.test(lower)) return { kind: "swap_missing_target", text: bareSwap[1] }
    const removal = lower.match(/^(?:please\s+)?(?:remove|drop|skip|take out|get rid of)\s+(?:the\s+)?([a-z][a-z ]+?)(?:\s+from (?:this|it|the \w+))?[.!?]*$/)
    if (removal && resolveFoods([removal[1]]).ids.length > 0) return { kind: "remove", text: removal[1] }
  }

  if (options.hasDraft) {
    const calories = calorieNumber(text)
    if (calories && /\b(make|get|bring|keep|cut|scale|under|below)\b/.test(lower)) {
      return { kind: "op", op: { type: "scale", mode: "AUTO", targetCalories: calories.value, strict: calories.strict } }
    }
    if (/\bmore carbs?\b|\badd (?:more )?carbs?\b/.test(lower)) return { kind: "op", op: { type: "more_carbs" } }
    if (/\bmore protein\b|\bhigher protein\b|\bgive me more protein\b/.test(lower)) return { kind: "op", op: { type: "more_protein" } }
    if (/\blower (?:the )?cal|\bfewer cal|\bless calor|\blighter\b/.test(lower)) return { kind: "op", op: { type: "lower_calories" } }
    if (/\bcheaper|\bless expensive|\bcheap(er)? option\b|\bbudget\b/.test(lower)) return { kind: "op", op: { type: "cheaper" } }
    if (/\bfaster|\bquicker|\bless time\b/.test(lower)) return { kind: "op", op: { type: "faster" } }
    if (/\bmore filling|\bfilling(er)?\b|\bbulk (it )?up\b|\bmore volume\b/.test(lower)) return { kind: "op", op: { type: "more_filling" } }
    const portion = lower.match(/\b(reduce|cut|lower|decrease|trim|halve|increase|double|more|less)\s+(?:down\s+)?(?:the\s+|my\s+|on the\s+)?([a-z][a-z ]+?)(?:\s+(?:in|from|on) (?:this|it|the \w+))?[.!?]*$/)
    if (portion && resolveFoods([portion[2]]).ids.length > 0) {
      const verb = portion[1]
      return { kind: "portion", text: portion[2], factor: verb === "halve" ? 0.5 : verb === "double" ? 2 : verb === "increase" || verb === "more" ? 1.25 : 0.75 }
    }
    for (const [pattern, id] of SENSORY_ADDS) {
      if (pattern.test(lower) && /\bmake\b|\bmore\b|\bit\b|\bthis\b/.test(lower)) return { kind: "op", op: { type: "add", ingredientId: id } }
    }
    if (/\btastier|\bmore flavou?r|\bbetter taste|\bmake (?:it|this) better\b/.test(lower)) return { kind: "op", op: { type: "tastier" } }
  }

  // Build a meal (from context, or from foods the user names)
  const proteinPriority = new RegExp(PROTEIN_PRIORITY.source, "i").test(lower)
  const foodText = lower.replace(PROTEIN_PRIORITY, " ").replace(/\s+/g, " ")
  const foodsMatch = foodText.match(/\b(?:i have|i've got|using|use|from|with)\s*:?\s*(.+?)(?:\.|$| (?:under|below|and (?:high|under)|for (?:dinner|lunch|breakfast)))/)
  const { ids, unresolved } = foodsMatch ? resolveFoods(splitFoods(foodsMatch[1])) : { ids: [], unresolved: [] }
  const asksForMeal = (/\b(build|make me|make a|suggest|plan|what should i eat|what should i have|help me hit|help me (?:decide|choose|pick|figure out|plan|find)|use my remaining|what meal|give me|i need a|i want a|put together|create)\b/.test(lower) && FOODISH.test(text)) || /\bwhat (?:to|should i) (?:eat|have)\b/.test(lower)
  const namesFoodsForMeal = ids.length > 0 && /\b(dinner|lunch|breakfast|snack|meal|calories?|kcal|protein)\b/.test(lower)

  if (asksForMeal || namesFoodsForMeal || /\bbuild\b/.test(lower) || /^(high[- ]protein|meal under)/.test(lower)) {
    const overrides: ConstraintOverrides = {}
    const calories = calorieNumber(text)
    if (calories) {
      overrides.calorieCeiling = calories.value
      overrides.strict = calories.strict
    }
    const protein = lower.match(/(\d{2,3})\s*g(?:rams?)?\s*(?:of\s*)?protein/) ?? lower.match(/protein\s*(?:of|target|>=?)?\s*(\d{2,3})\s*g/)
    if (protein) overrides.proteinTarget = Number(protein[1])
    const price = lower.match(/(?:under|below|less than|within|<=?)\s*(?:s?\$|sgd\s*)(\d+(?:\.\d+)?)/)
    if (price) overrides.maxPriceSgd = Number(price[1])
    const minutes = lower.match(/(?:under|within|in|<=?)\s*(\d{1,3})\s*(?:min|minutes)\b/)
    if (minutes) overrides.maxCookMinutes = Number(minutes[1])
    return { kind: "build", overrides, foodIds: ids, unresolvedFoods: unresolved, proteinPriority }
  }

  return { kind: "chat" }
}
