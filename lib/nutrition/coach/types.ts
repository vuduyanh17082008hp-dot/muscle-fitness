/**
 * Nutrition Coach V1 — shared types.
 *
 * Everything in lib/nutrition/coach/* except context.ts / chat.ts is pure
 * (no Supabase, no React, no LLM): the model never calculates a number
 * that ends up in a draft. Totals are always recomputed from
 * `ingredientId + grams` against the canonical ingredient table.
 */

export type MacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type DraftItem = { ingredientId: string; grams: number }

export type DataSource = "VERIFIED" | "ESTIMATED" | "UNKNOWN"
export type Confidence = "HIGH" | "MEDIUM" | "LOW"
export type MeasurementBasis = "RAW" | "COOKED" | "AS_SERVED"
export type DataProvenance = "USDA_REFERENCE" | "LABEL_REFERENCE" | "CURATED_ESTIMATE"

export type IngredientRole = "protein" | "carb" | "volume" | "flavor" | "fat" | "base"

export type CoachIngredient = {
  id: string
  name: string
  shortName: string
  role: IngredientRole
  caloriesPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  /** Rough SGD per 100 g as purchased — an estimate, never a quote. */
  priceEstimateSgd: number
  tags: string[]
  /** Allergen / dietary group tags used for exclusion matching. */
  allergens: string[]
  cookingMethods: string[]
  flavorRoles: string[]
  textureRoles: string[]
  /** Minutes of active prep/cook; 0 = ready to eat. */
  cookMinutes: number
  typicalGrams: number
  minGrams: number
  maxGrams: number
  /** True when the real-world quantity is inherently variable (cooking oil). */
  variableQuantity?: boolean
  source: DataSource
  measurementBasis: MeasurementBasis
  provenance: DataProvenance
}

export type OptimizerMode = "BALANCED" | "LEANEST" | "BUDGET"
export type ScalingMode = "AUTO" | "PROPORTIONAL" | "CARB_ADJUST" | "PROTEIN_ADJUST"
export type DraftStatus = "DRAFT" | "STALE_CONTEXT" | "READY" | "CONFIRMED" | "LOGGED"

export type ContextSnapshot = {
  capturedAt: string
  timezone: string
  localDate: string
  goal: string | null
  caloriesTarget: number
  caloriesConsumed: number
  caloriesRemaining: number
  proteinTarget: number
  proteinConsumed: number
  proteinRemaining: number
  contextVersion: string
}

export type MealConstraints = {
  calorieCeiling: number | null
  /** User-declared absolute ceiling ("under 500") => hard constraint. */
  calorieCeilingStrict: boolean
  calorieCeilingSource: "context" | "user"
  proteinTarget: number | null
  proteinTargetSource: "context" | "user"
  maxPriceSgd: number | null
  maxCookMinutes: number | null
  /** When set, only these ingredient ids may appear ("use only what I have"). */
  availableIds: string[] | null
}

/** Allergies / exclusions are always re-loaded server-side and never relaxed. */
export type ProfileGuards = {
  allergies: string[]
  excludedFoods: string[]
  preferredFoods: string[]
  recentFoodNames: string[]
}

export type CoachContext = {
  snapshot: ContextSnapshot
  guards: ProfileGuards
  cookingAbility: string | null
}

export type ViolationTier = "hard" | "medium" | "soft"

export type Violation = {
  constraint: "calorieCeiling" | "protein" | "budget" | "time"
  tier: ViolationTier
  requested: number
  actual: number
  /** Exact statement of what changed, e.g. "Closest match costs approximately S$2.60 rather than S$2.00." */
  message: string
}

export type GapKind = "PROTEIN_GAP" | "FLAVOR_GAP" | "TEXTURE_GAP" | "VOLUME_GAP" | "BALANCE_GAP"

export type GapSuggestion = {
  ingredientId: string
  ingredientName: string
  gap: GapKind
  role: string
  necessity: "REQUIRED_FOR_TARGET" | "OPTIONAL_QUALITY_UPGRADE"
  reason: string
  purpose: string
  grams: number
  impact: MacroTotals
  alternatives: string[]
  confidence: Confidence
}

export type DraftVersion = {
  version: number
  label: string
  ingredients: DraftItem[]
}

export type CravingInfo = {
  key: CravingKey
  label: string
  sensoryTargets: string[]
  preserved: string[]
  swaps: Array<{ from: string; to: string; why: string }>
  original: {
    description: string
    portion: string
    caloriesRange: [number, number]
    proteinRange: [number, number]
    source: "ESTIMATED"
  }
  /** Range-based, claim-safe comparison sentences (never ratios / percentages). */
  comparison: string[]
}

export type CravingKey = "chocolate_cereal" | "protein_ice_cream" | "real_cereal"

export type MealDraftSource = "build_next_meal" | "choose_food" | "suggested_for_you" | "craving_makeover" | "conversation"

/** Lightweight, session-only record of drafts — never a persistent table. */
export type MealDraftHistoryItem = {
  draftId: string
  name: string
  status: "active" | "superseded" | "confirmed" | "logged"
  createdAt: string
  source: MealDraftSource
}

export type ActiveMealDraft = {
  id: string
  /** Where the draft came from. Optional so drafts created before N1.5 still load. */
  source?: MealDraftSource
  name: string
  family: string
  mode: OptimizerMode
  sessionContextSnapshot: ContextSnapshot
  ingredients: Array<DraftItem & { name: string }>
  nutrition: MacroTotals
  estimatedPriceSgd: number
  cookMinutes: number
  constraints: MealConstraints
  confidence: Confidence
  confidenceReasons: string[]
  scalingMode: ScalingMode
  suggestions: GapSuggestion[]
  history: DraftVersion[]
  historyIndex: number
  status: DraftStatus
  violations: Violation[]
  /** Plain-language warnings + exact relaxation statements. */
  notes: string[]
  /** Set when the user chose "Keep current draft" for a stale context. */
  acknowledgedContextVersion: string | null
  craving: CravingInfo | null
}
