/**
 * CANONICAL NUTRITION TARGETS (PF-03)
 *
 * The ONE place that decides which daily calorie/macro target the app
 * uses. Every surface (Today, Gemma, the meal optimizer, the daily
 * nutrition snapshot, Athlete State, Progress) reads the result through
 * `loadNutritionContext().targets` — none of them picks a column itself.
 *
 * Frozen precedence, highest first:
 *
 *   1. PLAN   — the live deterministic nutrition plan
 *               (lib/nutrition/plan.ts), computed from the current
 *               profile and the user's own overrides.
 *   2. STORED — the onboarding snapshot on `fitness_profiles`. Inside the
 *               row the app-written columns win over the legacy
 *               duplicates left by the original foundation migration:
 *                 calories_target  > calorie_target
 *                 carbs_target_g   > carb_target_g
 *   3. NONE   — every field null. Never a guessed default.
 *
 * A source is chosen once for all four fields; macros are never mixed
 * across PLAN and STORED.
 * Disagreements are never silent: they are returned in `diagnostics`.
 */

export type NutritionTargetSource = "PLAN" | "STORED" | "NONE"

export type MacroTargets = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type StoredNutritionTargetRow = {
  calories_target?: unknown
  calorie_target?: unknown
  protein_target_g?: unknown
  carbs_target_g?: unknown
  carb_target_g?: unknown
  fat_target_g?: unknown
} | null

export type CanonicalNutritionTargets = {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  source: NutritionTargetSource
  /** All four targets together, or null when any one is unknown. */
  complete: MacroTargets | null
  /** Stable `CODE:detail` strings. Empty when every source agrees. */
  diagnostics: string[]
}

/** A stored target is only real when it is a positive finite number (numeric columns may arrive as strings). */
function positive(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function getCanonicalNutritionTargets(input: {
  planTarget?: MacroTargets | null
  stored?: StoredNutritionTargetRow
}): CanonicalNutritionTargets {
  const diagnostics: string[] = []
  const row = input.stored ?? null

  const pick = (field: string, current: string, legacy: string): number | null => {
    const record = (row ?? {}) as Record<string, unknown>
    const currentValue = positive(record[current])
    const legacyValue = positive(record[legacy])

    if (currentValue !== null && legacyValue !== null && currentValue !== legacyValue) {
      diagnostics.push(
        `STORED_COLUMN_CONFLICT:${field} ${current}=${currentValue} ${legacy}=${legacyValue} using=${current}`,
      )
    }

    return currentValue ?? legacyValue
  }

  const stored = {
    calories: pick("calories", "calories_target", "calorie_target"),
    protein: positive(row?.protein_target_g),
    carbs: pick("carbs", "carbs_target_g", "carb_target_g"),
    fat: positive(row?.fat_target_g),
  }

  const plan = input.planTarget ?? null

  if (plan && stored.calories !== null && stored.calories !== plan.calories) {
    diagnostics.push(
      `PLAN_STORED_MISMATCH:calories plan=${plan.calories} stored=${stored.calories} using=plan`,
    )
  }

  const chosen: Omit<CanonicalNutritionTargets, "complete" | "diagnostics"> = plan
    ? { calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat, source: "PLAN" }
    : Object.values(stored).some((value) => value !== null)
      ? { ...stored, source: "STORED" }
      : { calories: null, protein: null, carbs: null, fat: null, source: "NONE" }

  const { calories, protein, carbs, fat } = chosen

  return {
    ...chosen,
    complete:
      calories !== null && protein !== null && carbs !== null && fat !== null
        ? { calories, protein, carbs, fat }
        : null,
    diagnostics,
  }
}

export type TargetUtteranceKind = "NONE" | "USER_CLAIM" | "HYPOTHETICAL" | "MUTATION" | "THIRD_PARTY"

export type TargetUtterance = { kind: TargetUtteranceKind; calories: number | null }

/** A mentioned calorie number is not a new canonical target. */
export function classifyTargetUtterance(message: string): TargetUtterance {
  const text = message.trim()
  const calories = Number(text.match(/\b(\d{3,5})\b/)?.[1] ?? "")
  const kcal = Number.isFinite(calories) && calories >= 500 && calories <= 8000 ? calories : null
  const aboutTarget = /(?:^|[^\p{L}])(?:targets?|calories?|kcal|calo|mục tiêu|muc tieu)(?![\p{L}])/iu.test(text)
  const hypothetical = /(?:^|[^\p{L}])(?:pretend|what if|imagine|suppose|giả sử|gia su|nếu|neu)(?![\p{L}])/iu.test(text)
  if (hypothetical && (aboutTarget || (kcal !== null && /\b(?:ate|eat|ăn|an)\b/i.test(text)))) {
    return { kind: "HYPOTHETICAL", calories: kcal }
  }
  if (/(?:^|[^\p{L}])(?:another coach|my coach says|trainer says|hlv)(?![\p{L}])/iu.test(text) && (aboutTarget || kcal !== null)) {
    return { kind: "THIRD_PARTY", calories: kcal }
  }
  const directedTarget = /(?:^|[^\p{L}])(?:change|set|update|make)\s+(?:my\s+)?(?:target|calorie|calories)(?![\p{L}])/iu.test(text)
    || /(?:^|[^\p{L}])(?:change|set|update|make)\s+it\s+(?:to\s+)?\d{3,5}(?![\p{L}])/iu.test(text);
  if (directedTarget && kcal !== null) {
    return { kind: "MUTATION", calories: kcal }
  }
  if (/(?:^|[^\p{L}])(?:i think|i believe|i guess|tôi nghĩ|toi nghi|mình nghĩ|minh nghi)(?![\p{L}])/iu.test(text) && aboutTarget) {
    return { kind: "USER_CLAIM", calories: kcal }
  }
  return { kind: "NONE", calories: null }
}

export function targetTruthReply(
  utterance: TargetUtterance,
  canonical: { calories: number | null; protein: number | null },
): string {
  const cal = canonical.calories
  const protein = canonical.protein
  const saved = cal != null
    ? `Your current calculated target is still ${cal} kcal${protein != null ? ` and ${protein} g protein` : ""}.`
    : "There isn't a calculated target on your profile yet."
  const mentioned = utterance.calories != null ? ` You mentioned ${utterance.calories}.` : ""
  if (utterance.kind === "HYPOTHETICAL") return `${saved} Treating that as a what-if doesn't change the saved target.`
  if (utterance.kind === "MUTATION") return `${saved} Changing the saved target from chat isn't available, so nothing was updated.`
  if (utterance.kind === "THIRD_PARTY") return `${saved}${mentioned} Someone else's number doesn't replace the saved target.`
  return `${saved}${mentioned} That hasn't changed the current target.`
}

const FALSE_TARGET_CHANGE = /\b(?:confirmed|saved|updated|i changed|now your target)\b|\btarget is (?:now )?(?:confirmed|set|changed)\b/i
const NEGATED_CHANGE = /\b(?:not|no|never|hasn't|haven't|hadn't|wasn't|isn't|didn't|without|nothing|chưa|chua|không|khong)\b/i

/** A reply may say a target changed only when the number is the canonical one. */
export function guardCanonicalTargetClaim(reply: string, canonicalCalories: number | null): string {
  if (canonicalCalories == null || canonicalCalories <= 0) return reply
  return reply.replace(/[^.!?\n]+[.!?]?/g, (sentence) => {
    if (!FALSE_TARGET_CHANGE.test(sentence) || NEGATED_CHANGE.test(sentence)) return sentence
    const numbers = [...sentence.matchAll(/\b(\d{3,5})\b/g)].map((match) => Number(match[1]))
    if (numbers.length > 0 && numbers.every((n) => n === canonicalCalories)) return sentence
    return `Your current calculated target is still ${canonicalCalories} kcal.`
  }).replace(/\s{2,}/g, " ").trim()
}

export function readCanonicalCalories(context: unknown): number | null {
  if (!context || typeof context !== "object") return null
  const calories = (context as { currentState?: { canonicalCalories?: unknown } }).currentState?.canonicalCalories
  return typeof calories === "number" && calories > 0 ? calories : null
}
