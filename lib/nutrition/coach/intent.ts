import { detectCravingKey } from "./craving"
import type { DraftOp } from "./draft"
import { COACH_INGREDIENTS, findIngredientByText } from "./ingredients"
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
  "That's a training or recovery question — ask it on its own and I'll answer it from your training and recovery data. On the food side I can help with meals, macros or cravings — including what to eat around that session."

const DISORDERED = /\b(starv\w*|purg\w*|laxative\w*|make myself (throw|vomit|sick)|throw (it )?up|vomit\w*|fast(ing)? for \d+\s*(days?|hours?)|skip (all|every) meals?|not eat (at all|for (days|a week)))\b/i
const COMPENSATION = /\b(burn (it |this |that |these )?off|work (it |this |that )?off|make up for (it|what|that|eating)|earn (it|this|my|the|food|dinner|lunch|breakfast)|punish\w*|compensat\w*|cheat meal.*(run|exercise))\b/i
const SUPPLEMENT_ASK = /\b(?:supplements?|supps?|creatine|pre-?workout|bcaas?|eaas?|multivitamins?|vitamins?|omega-?3|fish oil|magnesium|zinc|ashwagandha)\b/i
// H0 cluster D: day names of a split ("push day", "leg day") and programming words are training, Dante's domain.
const TRAINING = /\b(workout|exercise|training|program|routine|sets|reps|squat|deadlift|bench|injur\w*|pain|sore|soreness|recovery|rest day|cardio|stretch\w*|mobility|(?:push|pull|leg|legs|upper|lower|arm|chest|back|shoulder) day|split|hypertrophy block|1rm|progressive overload|deload)\b/i
// Plurals count: "give me some meals with tuna" is a meal request even without the word "protein".
const FOODISH = /\b(meals?|foods?|eat|eating|calorie|calories|kcal|protein|carb|carbs|macro|macros|recipes?|snacks?|breakfast|lunch|dinner|ingredients?|cook|cooking|hungry|craving|dishes)\b/i

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

/** "with realistic portions", "with good macros": words about the REQUEST, never a food to look up (live: "realistic portions" was reported as a food with no data). */
const REQUEST_QUALIFIER = /\b(?:portions?|servings?|sizes?|amounts?|quantit(?:y|ies)|macros?|calories|ingredients?|options?|choices?|variety|flavou?rs?|taste|nutrition|numbers)\b/i

function splitFoods(text: string): string[] {
  return text
    .split(/,|\band\b|\bplus\b|\bwith\b|\+|&/i)
    .map((part) => part.replace(/\b(some|the|my|a|an|only|just|already|at home|in the fridge)\b/gi, "").trim())
    .filter((part) => part.length > 1 && !REQUEST_QUALIFIER.test(part))
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

/** A day-level calorie number is a proposal, not the current target. */
export function dayLevelCalorieProposal(message: string): number | null {
  const patterns = [
    /\b(\d{3,4})\s*(?:kcal|k?cal(?:orie)?s?|calo)\b[^.?!]{0,24}\bday\b/i,
    /\b(?:cut|target|budget)\b[^.?!]{0,32}?\b(\d{3,4})\s*(?:k?cals?|calories|calo)\b/i,
  ]
  for (const pattern of patterns) {
    const match = message.match(pattern)
    const raw = match?.[1] ?? match?.[2]
    if (raw) return Number(raw)
  }
  return null
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

/** "besides tuna" / "other than tuna" / "without tuna" / "no more tuna" / "ngoài cá ngừ": foods THIS request excludes. */
const EXCLUSION = /(?<![\p{L}])(?:besides?|other than|apart from|except(?: for)?|without|no more|instead of|anything but|minus|ngoài|trừ|không có|không dùng|không ăn)\s+(?:any\s+|the\s+)?([\p{L}][\p{L} ]{1,30}?)(?=[,.;!?]|\s+(?:and|but|or|please|for|today|this|again|anymore)(?![\p{L}])|$)/giu

/**
 * Turn-level exclusions resolved against the curated catalogue. Request-scoped only: never an allergy, never persisted.
 * `terms` feed the engine's excludedFoods matcher (names/tags); `ids` are the resolved ingredients.
 */
export function excludedFoodsIn(message: string): { ids: string[]; terms: string[] } {
  const terms = [...message.matchAll(EXCLUSION)].map((match) => match[1].trim().toLowerCase()).filter((term) => resolveFoods([term]).ids.length > 0)
  return { ids: resolveFoods(terms).ids, terms }
}

const OPTION_NOUNS = "(?:meals?|options?|choices?|ideas?|recipes?|dishes|suggestions?)"
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3 }
const LOTS = new RegExp(`\\b(?:lots|loads|plenty|tons|heaps|a bunch|many|a lot|a wide range|variety)\\b(?: of)?[^.?!]{0,24}?\\b(?:${OPTION_NOUNS}|choice|variety)\\b|\\blots of choice\\b|(?<![\\p{L}])nhiều (?:lựa chọn|món|gợi ý)`, "iu")
const EXPLICIT_N = new RegExp(`\\b(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|couple|few)\\s+(?:of\\s+)?(?:[a-z-]+\\s+){0,3}?${OPTION_NOUNS}\\b|(?<![\\p{L}])(\\d{1,2})\\s+(?:món|lựa chọn|gợi ý)`, "iu")
const PLURAL = new RegExp(`\\b(?:meals|options|choices|ideas|recipes|dishes|suggestions)\\b|(?<![\\p{L}])(?:vài|mấy|các|một số) (?:món|lựa chọn|gợi ý)`, "iu")
/** Most options one discovery may render; "lots of choices" asks for this many. */
export const MAX_DISCOVERY_OPTIONS = 8

/**
 * How many distinct meals a discovery request asks for: explicit N (bounded), "lots of choices" → 8, a plural request → 5.
 * null = a singular request ("build me a meal"), which keeps the engine's usual recommendation + 2 alternatives.
 */
export function requestedOptionCount(message: string): number | null {
  if (LOTS.test(message)) return MAX_DISCOVERY_OPTIONS
  const explicit = message.match(EXPLICIT_N)
  if (explicit) {
    const word = (explicit[1] ?? explicit[2]).toLowerCase()
    const n = NUMBER_WORDS[word] ?? Number(word)
    if (Number.isFinite(n) && n >= 1) return Math.min(MAX_DISCOVERY_OPTIONS, n)
  }
  return PLURAL.test(message) ? 5 : null
}

/** "more options" / "give me lots of choice" / "another high protein meals" / "thêm món khác": continue the LAST discovery, never re-voice one meal. */
export const MORE_OPTIONS = new RegExp(
  `\\b(?:more|other|another|different|new|lots of|loads of|plenty of|many)\\b[^.?!]{0,30}?\\b(?:${OPTION_NOUNS}|ones|choice)\\b|\\b(?:show|give) me (?:some )?(?:more|others)\\b|\\banything else\\b|\\bwhat else\\b|(?<![\\p{L}])(?:thêm (?:lựa chọn|món|gợi ý)|món khác|lựa chọn khác)`,
  "iu",
)

/** Foods a message names by their catalogue short name ("more chicken options" → chicken_breast). */
export function foodsNamedIn(message: string): string[] {
  return COACH_INGREDIENTS.filter((item) => new RegExp(`(?<![\\p{L}])${item.shortName.toLowerCase()}(?![\\p{L}])`, "iu").test(message)).map((item) => item.id)
}

export function parseCoachMessage(message: string, options: { hasDraft: boolean }): Intent {
  const text = message.trim()
  const lower = text.toLowerCase()

  if (isSafetyMessage(text)) return { kind: "safety", reply: SAFETY_REPLY }
  // H0 cluster D: a supplement question is shared knowledge (ICH-1: each coach reads it through its own lens), so "for
  // recovery" in it never turns it into a training bounce — Gemma answers it food-first from the shared brief.
  if (TRAINING.test(text) && !FOODISH.test(text) && !SUPPLEMENT_ASK.test(text)) return { kind: "redirect_training", reply: TRAINING_REDIRECT }

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
    if (/\blower (?:in )?fat\b|\bless fat\b|\blow(?:er)?[- ]fat\b|\bleaner\b/.test(lower)) return { kind: "op", op: { type: "lower_fat" } }
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
  // `\b` after the verb: "without tuna" must not read as "with: out tuna" (which selected the excluded food).
  const foodsMatch = foodText.match(/\b(?:i have|i've got|using|use|from|with)\b\s*:?\s*(.+?)(?:\.|$| (?:under|below|and (?:high|under)|for (?:dinner|lunch|breakfast)))/)
  const excluded = excludedFoodsIn(text).ids
  const named = foodsMatch ? resolveFoods(splitFoods(foodsMatch[1])) : { ids: [], unresolved: [] }
  const ids = named.ids.filter((id) => !excluded.includes(id))
  const unresolved = named.unresolved
  // "recommend a high-protein dinner" is a meal request too (live, Dante unified: it fell to the open model, which wrote number-free options).
  const asksForMeal = (/\b(build|make me|make a|suggest|recommend|plan|what should i eat|what should i have|help me hit|help me (?:decide|choose|pick|figure out|plan|find)|use my remaining|what meal|give me|i need a|i want a|put together|create)\b/.test(lower) && FOODISH.test(text)) || /\bwhat (?:to|should i) (?:eat|have)\b/.test(lower)
  const namesFoodsForMeal = ids.length > 0 && /\b(dinner|lunch|breakfast|snacks?|meals?|calories?|kcal|protein)\b/.test(lower)

  if (asksForMeal || namesFoodsForMeal || /\bbuild\b/.test(lower) || /^(high[- ]protein|meal under)/.test(lower)) {
    const overrides: ConstraintOverrides = {}
    const calories = calorieNumber(text)
    if (calories && dayLevelCalorieProposal(text) === null) {
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
