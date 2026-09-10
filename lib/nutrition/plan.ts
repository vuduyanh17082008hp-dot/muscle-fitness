/**
 * MUSCLE FITNESS — ADAPTIVE NUTRITION ENGINE
 *
 * Turns a user's profile into a full, training-mode-aware nutrition
 * plan: BMR, PAL, an estimated maintenance calorie level, a goal
 * adjustment, macro targets, a gram-based meal plan, and coaching
 * notes.
 *
 * This module is intentionally pure (no Supabase, no React) so it can
 * be called from any server component, server action, API route or
 * the Dante chatbot with the same result for the same input. That is
 * what keeps the Dashboard Overview and the Nutrition Plan page in
 * sync — both call `buildNutritionPlan()` with the same mapped input.
 *
 * IMPORTANT — what this engine deliberately does NOT do:
 * - It never adds a fixed "training bonus" or EPOC bonus to calories.
 *   Training mode only changes macro distribution, meal timing and
 *   fuel placement — real-world expenditure is estimated through PAL.
 * - It never applies a medical/condition-based calorie multiplier.
 * - It never claims the result is exact. Every output is labelled as
 *   a starting estimate that should be calibrated against 14–21 days
 *   of real bodyweight trend data.
 */

/* =========================================================
   TYPES
========================================================= */

export type Sex = "male" | "female" | "unspecified"

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "very_active"
  | "super_active"

export type TrainingMode =
  | "general"
  | "strength"
  | "running"
  | "hybrid"
  | "hiit"
  | "team_sport"

export type NutritionGoal = "fat_loss" | "maintenance" | "lean_bulk"

export type FoodCategory =
  | "protein"
  | "carb"
  | "fat"
  | "fruit"
  | "vegetable"

export type NutritionInput = {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  trainingMode: TrainingMode
  goal: NutritionGoal
  trainingDaysPerWeek: number
  mealsPerDay: number
  foodPreferences: string[]
  excludedFoods: string[]
  allergies: string[]
}

export type MacroTarget = {
  calories: number
  protein: number
  carbs: number
  fat: number
  proteinPerKg: number
  carbsPerKg: number
  fatPerKg: number
}

/** See lib/nutrition/food-data/types.ts for the full FoodPreparationState set this is aligned with. */
export type MealMeasurementBasis = "raw" | "cooked" | "as-served"

export type MealIngredient = {
  foodId: string
  name: string
  category: FoodCategory
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  /**
   * What the gram amount above measures. This must never be
   * conflated with a different basis — 150 g raw chicken breast and
   * 150 g cooked chicken breast are different foods (see PHASE 5,
   * "raw vs cooked must not be mixed").
   */
  measurementBasis: MealMeasurementBasis
}

export type Meal = {
  id: string
  name: string
  purpose: string
  ingredients: MealIngredient[]
  totals: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
}

export type NutritionPlan = {
  input: NutritionInput
  bmr: number
  pal: number
  maintenanceCalories: number
  goalAdjustmentPercent: number
  target: MacroTarget
  meals: Meal[]
  mealTotals: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  trainingNotes: string[]
  calibrationNotes: string[]
  healthNote: string
  excludedIngredientNames: string[]
}

/* =========================================================
   LABELS
========================================================= */

export const TRAINING_MODE_LABELS: Record<TrainingMode, string> = {
  general: "General Fitness",
  strength: "Strength / Bodybuilding",
  running: "Running / Endurance",
  hybrid: "Hybrid — Strength + Endurance",
  hiit: "HIIT / Functional",
  team_sport: "Team Sport",
}

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Lightly Active",
  moderate: "Moderately Active",
  very_active: "Very Active",
  super_active: "Super Active",
}

export const NUTRITION_GOAL_LABELS: Record<NutritionGoal, string> = {
  fat_loss: "Fat Loss",
  maintenance: "Maintenance",
  lean_bulk: "Lean Bulk",
}

export const HEALTH_NOTE =
  "Medical conditions, medications, pregnancy, significant injury, " +
  "illness and endocrine disorders (including thyroid conditions) may " +
  "alter energy requirements. Muscle Fitness does not automatically " +
  "apply a medical calorie multiplier. Individual assessment by a " +
  "qualified professional may be appropriate."

/* =========================================================
   BMR + PAL
========================================================= */

const PAL_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  super_active: 1.9,
}

/** Mifflin-St Jeor. */
export function calculateBMR(input: {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age

  if (input.sex === "male") {
    return Math.round(base + 5)
  }

  if (input.sex === "female") {
    return Math.round(base - 161)
  }

  // Sex not disclosed: use the midpoint of the male/female constant
  // rather than guessing. This is an estimate, not a diagnosis.
  return Math.round(base - 78)
}

export function getPalMultiplier(activityLevel: ActivityLevel): number {
  return PAL_MULTIPLIERS[activityLevel]
}

const GOAL_ADJUSTMENT_PERCENT: Record<NutritionGoal, number> = {
  fat_loss: -0.15,
  maintenance: 0,
  lean_bulk: 0.075,
}

/* =========================================================
   MACRO TARGETS
========================================================= */

/**
 * Base protein target is per training mode. Fat loss is allowed to
 * move toward the upper end of that mode's evidence-based range;
 * maintenance and lean bulk use the mode's base value directly (a
 * Strength / Bodybuilding lean bulk at 70 kg should read ~140 g,
 * i.e. exactly 2.0 g/kg — not a reduced "surplus" protein number).
 */
const PROTEIN_G_PER_KG: Record<
  TrainingMode,
  Record<NutritionGoal, number>
> = {
  strength: { fat_loss: 2.2, maintenance: 2.0, lean_bulk: 2.0 },
  hybrid: { fat_loss: 2.0, maintenance: 1.9, lean_bulk: 1.9 },
  hiit: { fat_loss: 1.9, maintenance: 1.8, lean_bulk: 1.8 },
  team_sport: { fat_loss: 1.8, maintenance: 1.7, lean_bulk: 1.7 },
  running: { fat_loss: 1.7, maintenance: 1.6, lean_bulk: 1.6 },
  general: { fat_loss: 1.8, maintenance: 1.6, lean_bulk: 1.6 },
}

const FAT_G_PER_KG: Record<TrainingMode, number> = {
  strength: 0.9,
  hybrid: 0.8,
  hiit: 0.8,
  team_sport: 0.8,
  running: 0.7,
  general: 0.8,
}

/**
 * Physiological safety floor only — 15% of calories from fat is a
 * commonly cited minimum for hormonal health. This must stay low
 * enough that a mode's normal g/kg fat target (e.g. Strength's
 * 0.9 g/kg, which sits around 18% of calories at a lean-bulk
 * intake) is never pushed upward unnecessarily. Remaining calories
 * beyond protein + this fat target go to carbohydrate.
 */
const MIN_FAT_CALORIE_SHARE = 0.15
const MIN_FAT_G_PER_KG = 0.5

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

export function calculateMacroTargets(input: NutritionInput): {
  bmr: number
  pal: number
  maintenanceCalories: number
  target: MacroTarget
} {
  const bmr = calculateBMR(input)
  const pal = getPalMultiplier(input.activityLevel)
  const maintenanceCalories = Math.round(bmr * pal)

  const adjustmentPercent = GOAL_ADJUSTMENT_PERCENT[input.goal]

  const calories = Math.max(
    1200,
    roundTo(maintenanceCalories * (1 + adjustmentPercent), 10),
  )

  const proteinPerKg = PROTEIN_G_PER_KG[input.trainingMode][input.goal]
  const protein = Math.round(input.weightKg * proteinPerKg)

  let fatPerKg = Math.max(
    MIN_FAT_G_PER_KG,
    FAT_G_PER_KG[input.trainingMode],
  )
  let fat = Math.round(input.weightKg * fatPerKg)

  const minFatCalories = calories * MIN_FAT_CALORIE_SHARE
  if (fat * 9 < minFatCalories) {
    fat = Math.round(minFatCalories / 9)
    fatPerKg = Math.round((fat / input.weightKg) * 10) / 10
  }

  const remainingCalories = calories - protein * 4 - fat * 9
  const carbs = Math.max(0, Math.round(remainingCalories / 4))

  const carbsPerKg = Math.round((carbs / input.weightKg) * 10) / 10

  return {
    bmr,
    pal,
    maintenanceCalories,
    target: {
      calories,
      protein,
      carbs,
      fat,
      proteinPerKg: Math.round(proteinPerKg * 10) / 10,
      carbsPerKg,
      fatPerKg: Math.round(fatPerKg * 10) / 10,
    },
  }
}

/* =========================================================
   TRAINING-SPECIFIC NOTES
========================================================= */

const TRAINING_NOTES: Record<TrainingMode, string[]> = {
  strength: [
    "Protein is spread across every meal to support muscle protein synthesis throughout the day.",
    "Carbohydrates are concentrated around your resistance training session to fuel training and support recovery.",
    "A dedicated pre-workout and post-workout meal are included to bracket your lifting session.",
  ],
  running: [
    "Carbohydrate availability is prioritised over protein density — running performance is highly sensitive to glycogen status.",
    "A pre-run meal favours easily digestible carbohydrate to limit gastrointestinal discomfort.",
    "Post-run recovery pairs carbohydrate with protein to replenish glycogen and support tissue repair.",
    "This plan is not a bodybuilding meal structure — portions and timing are built around running, not resistance training.",
  ],
  hybrid: [
    "Carbohydrate availability is raised to cover both resistance training and running in the same training cycle.",
    "Separate fuel is placed around your strength session and your run so each session is properly supported.",
    "When two sessions fall on the same day, the between-session meal is treated as a recovery bridge, not an afterthought.",
  ],
  hiit: [
    "Carbohydrate availability supports repeated high-intensity efforts without assuming a large 'afterburn' calorie bonus.",
    "Protein is kept adequate for recovery between sessions.",
    "Hydration and electrolyte intake matter more for HIIT sessions than any single meal choice — treat this as a standing reminder.",
  ],
  team_sport: [
    "Carbohydrate is placed around training sessions and match days, since your weekly workload is variable rather than fixed.",
    "A recovery meal follows training/match days to support glycogen replenishment and tissue repair.",
    "Hydration and electrolytes deserve explicit attention around longer sessions or matches in heat.",
  ],
  general: [
    "This is a general fitness structure — simple, sustainable meals rather than athlete-specific fuel timing.",
    "Protein and carbohydrate are distributed evenly across the day to support consistency over precision.",
  ],
}

export const CALIBRATION_NOTES: string[] = [
  "The calculator is the starting point — your trend is the truth.",
  "Track bodyweight first thing in the morning, under consistent conditions, for 14–21 days.",
  "Compare your actual weight trend (not a single day's reading) against the direction your goal implies.",
  "If the trend clearly diverges from your goal after 14–21 days, adjust calories gradually — small, deliberate steps rather than large swings.",
  "Do not change your targets based on daily scale fluctuations; body weight moves with water, sodium and digestion day to day.",
]

/* =========================================================
   FOOD TEMPLATES
   Deterministic local values for building a meal plan without
   depending on a live external API. Treat these as reasonable
   approximations, not verified lab values.
========================================================= */

export type FoodTemplate = {
  id: string
  name: string
  category: FoodCategory
  caloriesPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  /**
   * What preparation state these per-100g values describe. Chosen to
   * match how each ingredient is actually used in the meal
   * blueprints below (e.g. "Chicken Breast" here is a cooked, edible
   * portion value, matching the gram amounts a meal-prep plan
   * actually uses) — never mix this up with a raw-weight figure for
   * the same food.
   */
  preparationState: MealMeasurementBasis
}

export const FOOD_TEMPLATES: FoodTemplate[] = [
  { id: "oats", name: "Oats", category: "carb", caloriesPer100g: 389, proteinPer100g: 16.9, carbsPer100g: 66, fatPer100g: 6.9, preparationState: "raw" },
  { id: "rice", name: "Rice", category: "carb", caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, preparationState: "cooked" },
  { id: "rice_cakes", name: "Rice Cakes", category: "carb", caloriesPer100g: 387, proteinPer100g: 8, carbsPer100g: 81, fatPer100g: 2.8, preparationState: "as-served" },
  { id: "potato", name: "Potato", category: "carb", caloriesPer100g: 87, proteinPer100g: 1.9, carbsPer100g: 20, fatPer100g: 0.1, preparationState: "cooked" },
  { id: "wholegrain_bread", name: "Wholegrain Bread", category: "carb", caloriesPer100g: 247, proteinPer100g: 13, carbsPer100g: 41, fatPer100g: 3.4, preparationState: "as-served" },
  { id: "chicken_breast", name: "Chicken Breast", category: "protein", caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, preparationState: "cooked" },
  { id: "cod", name: "Cod", category: "protein", caloriesPer100g: 82, proteinPer100g: 18, carbsPer100g: 0, fatPer100g: 0.7, preparationState: "cooked" },
  { id: "salmon", name: "Salmon", category: "protein", caloriesPer100g: 208, proteinPer100g: 22, carbsPer100g: 0, fatPer100g: 13, preparationState: "cooked" },
  { id: "eggs", name: "Eggs", category: "protein", caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, preparationState: "raw" },
  { id: "greek_yogurt", name: "Greek Yogurt", category: "protein", caloriesPer100g: 59, proteinPer100g: 10, carbsPer100g: 3.6, fatPer100g: 0.4, preparationState: "as-served" },
  { id: "whey_protein", name: "Whey Protein", category: "protein", caloriesPer100g: 380, proteinPer100g: 80, carbsPer100g: 7, fatPer100g: 4, preparationState: "as-served" },
  { id: "banana", name: "Banana", category: "fruit", caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 22.8, fatPer100g: 0.3, preparationState: "raw" },
  { id: "berries", name: "Berries", category: "fruit", caloriesPer100g: 50, proteinPer100g: 0.7, carbsPer100g: 12, fatPer100g: 0.3, preparationState: "raw" },
  { id: "vegetables", name: "Vegetables", category: "vegetable", caloriesPer100g: 35, proteinPer100g: 2.4, carbsPer100g: 7, fatPer100g: 0.4, preparationState: "cooked" },
  { id: "olive_oil", name: "Olive Oil", category: "fat", caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, preparationState: "as-served" },
  { id: "peanut_butter", name: "Peanut Butter", category: "fat", caloriesPer100g: 588, proteinPer100g: 25, carbsPer100g: 20, fatPer100g: 50, preparationState: "as-served" },
  { id: "honey", name: "Honey", category: "carb", caloriesPer100g: 304, proteinPer100g: 0.3, carbsPer100g: 82, fatPer100g: 0, preparationState: "as-served" },
]

function findFood(id: string): FoodTemplate {
  const food = FOOD_TEMPLATES.find((item) => item.id === id)

  if (!food) {
    throw new Error(`Unknown food template: ${id}`)
  }

  return food
}

/* =========================================================
   SUBSTITUTION GROUPS
   Used so an excluded/allergy food can be replaced by an
   equivalent food from the same functional category.
========================================================= */

const SUBSTITUTION_ORDER: Record<FoodCategory, string[]> = {
  protein: ["chicken_breast", "cod", "eggs", "greek_yogurt", "whey_protein", "salmon"],
  carb: ["rice", "potato", "oats", "wholegrain_bread", "rice_cakes", "honey"],
  fat: ["olive_oil", "peanut_butter"],
  fruit: ["banana", "berries"],
  vegetable: ["vegetables"],
}

function isBlocked(foodName: string, blockedTerms: string[]): boolean {
  const normalized = foodName.toLowerCase()

  return blockedTerms.some(
    (term) => term.trim().length > 0 && normalized.includes(term.trim().toLowerCase()),
  )
}

function resolveFoodId(
  preferredId: string,
  blockedTerms: string[],
): string | null {
  const preferred = findFood(preferredId)

  if (!isBlocked(preferred.name, blockedTerms)) {
    return preferredId
  }

  const alternatives = SUBSTITUTION_ORDER[preferred.category]

  const substitute = alternatives.find(
    (candidateId) => !isBlocked(findFood(candidateId).name, blockedTerms),
  )

  return substitute ?? null
}

/* =========================================================
   MEAL BLUEPRINTS
========================================================= */

type BlueprintIngredient = {
  foodId: string
  macro: "protein" | "carb" | "fat" | "garnish"
  /** Share of the DAY's macro target this ingredient targets. Ignored for garnish. */
  shareOfDailyMacro?: number
  /** Fixed grams used for garnish-role ingredients (fruit/vegetable/flavour). */
  fixedGrams?: number
}

type BlueprintMeal = {
  id: string
  name: string
  purpose: string
  ingredients: BlueprintIngredient[]
}

const MEAL_BLUEPRINTS: Record<TrainingMode, BlueprintMeal[]> = {
  strength: [
    {
      id: "breakfast",
      name: "Breakfast",
      purpose: "Steady energy and protein to start the day.",
      ingredients: [
        { foodId: "oats", macro: "carb", shareOfDailyMacro: 0.2 },
        { foodId: "greek_yogurt", macro: "protein", shareOfDailyMacro: 0.2 },
        { foodId: "banana", macro: "garnish", fixedGrams: 120 },
        { foodId: "honey", macro: "garnish", fixedGrams: 15 },
      ],
    },
    {
      id: "pre_workout",
      name: "Pre-Workout Meal",
      purpose: "Fast-digesting fuel before resistance training.",
      ingredients: [
        { foodId: "rice", macro: "carb", shareOfDailyMacro: 0.2 },
        { foodId: "chicken_breast", macro: "protein", shareOfDailyMacro: 0.15 },
      ],
    },
    {
      id: "post_workout",
      name: "Post-Workout Meal",
      purpose: "Replenish glycogen and drive muscle repair after training.",
      ingredients: [
        { foodId: "whey_protein", macro: "protein", shareOfDailyMacro: 0.25 },
        { foodId: "rice_cakes", macro: "carb", shareOfDailyMacro: 0.15 },
        { foodId: "banana", macro: "garnish", fixedGrams: 100 },
      ],
    },
    {
      id: "lunch",
      name: "Lunch",
      purpose: "Balanced meal to sustain training volume across the day.",
      ingredients: [
        { foodId: "chicken_breast", macro: "protein", shareOfDailyMacro: 0.2 },
        { foodId: "potato", macro: "carb", shareOfDailyMacro: 0.25 },
        { foodId: "olive_oil", macro: "fat", shareOfDailyMacro: 0.35 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 150 },
      ],
    },
    {
      id: "dinner",
      name: "Dinner",
      purpose: "Protein-forward meal to support overnight recovery.",
      ingredients: [
        { foodId: "salmon", macro: "protein", shareOfDailyMacro: 0.2 },
        { foodId: "wholegrain_bread", macro: "carb", shareOfDailyMacro: 0.2 },
        { foodId: "peanut_butter", macro: "fat", shareOfDailyMacro: 0.65 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 100 },
      ],
    },
  ],

  running: [
    {
      id: "breakfast",
      name: "Breakfast",
      purpose: "Carbohydrate-forward start to keep glycogen topped up.",
      ingredients: [
        { foodId: "oats", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "greek_yogurt", macro: "protein", shareOfDailyMacro: 0.25 },
        { foodId: "banana", macro: "garnish", fixedGrams: 120 },
        { foodId: "honey", macro: "garnish", fixedGrams: 15 },
      ],
    },
    {
      id: "pre_run",
      name: "Pre-Run Meal",
      purpose: "Easily digestible carbohydrate to fuel the run without GI distress.",
      ingredients: [
        { foodId: "rice_cakes", macro: "carb", shareOfDailyMacro: 0.25 },
        { foodId: "honey", macro: "garnish", fixedGrams: 20 },
      ],
    },
    {
      id: "post_run",
      name: "Post-Run Recovery",
      purpose: "Carbohydrate + protein to replenish glycogen and support repair.",
      ingredients: [
        { foodId: "rice", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "chicken_breast", macro: "protein", shareOfDailyMacro: 0.4 },
        { foodId: "berries", macro: "garnish", fixedGrams: 100 },
      ],
    },
    {
      id: "dinner",
      name: "Dinner",
      purpose: "Carbohydrate-adequate meal to finish daily glycogen replenishment.",
      ingredients: [
        { foodId: "potato", macro: "carb", shareOfDailyMacro: 0.15 },
        { foodId: "cod", macro: "protein", shareOfDailyMacro: 0.35 },
        { foodId: "olive_oil", macro: "fat", shareOfDailyMacro: 0.6 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 150 },
      ],
    },
  ],

  hybrid: [
    {
      id: "breakfast",
      name: "Breakfast",
      purpose: "High-carbohydrate start to cover a two-session training day.",
      ingredients: [
        { foodId: "oats", macro: "carb", shareOfDailyMacro: 0.2 },
        { foodId: "greek_yogurt", macro: "protein", shareOfDailyMacro: 0.2 },
        { foodId: "banana", macro: "garnish", fixedGrams: 120 },
      ],
    },
    {
      id: "strength_fuel",
      name: "Strength Fuel",
      purpose: "Fuel and protein placed around the resistance training session.",
      ingredients: [
        { foodId: "rice", macro: "carb", shareOfDailyMacro: 0.2 },
        { foodId: "chicken_breast", macro: "protein", shareOfDailyMacro: 0.25 },
      ],
    },
    {
      id: "between_sessions",
      name: "Between Sessions / Run Fuel",
      purpose: "Recovery bridge between lifting and running, or fuel before the run.",
      ingredients: [
        { foodId: "rice_cakes", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "whey_protein", macro: "protein", shareOfDailyMacro: 0.2 },
        { foodId: "honey", macro: "garnish", fixedGrams: 15 },
      ],
    },
    {
      id: "recovery_dinner",
      name: "Recovery Dinner",
      purpose: "Balanced protein, carbohydrate and fat to close out total daily workload.",
      ingredients: [
        { foodId: "salmon", macro: "protein", shareOfDailyMacro: 0.35 },
        { foodId: "potato", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "olive_oil", macro: "fat", shareOfDailyMacro: 1 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 150 },
      ],
    },
  ],

  hiit: [
    {
      id: "breakfast",
      name: "Breakfast",
      purpose: "Balanced start with adequate carbohydrate for upcoming sessions.",
      ingredients: [
        { foodId: "oats", macro: "carb", shareOfDailyMacro: 0.25 },
        { foodId: "eggs", macro: "protein", shareOfDailyMacro: 0.3 },
        { foodId: "berries", macro: "garnish", fixedGrams: 100 },
      ],
    },
    {
      id: "pre_session",
      name: "Pre-Session Fuel",
      purpose: "Carbohydrate availability for repeated high-intensity efforts.",
      ingredients: [
        { foodId: "rice_cakes", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "banana", macro: "garnish", fixedGrams: 100 },
      ],
    },
    {
      id: "post_session",
      name: "Post-Session Recovery",
      purpose: "Protein and carbohydrate to support recovery between sessions.",
      ingredients: [
        { foodId: "chicken_breast", macro: "protein", shareOfDailyMacro: 0.4 },
        { foodId: "rice", macro: "carb", shareOfDailyMacro: 0.3 },
      ],
    },
    {
      id: "dinner",
      name: "Dinner",
      purpose: "Adequate protein and fat to close out the day's recovery needs.",
      ingredients: [
        { foodId: "cod", macro: "protein", shareOfDailyMacro: 0.3 },
        { foodId: "potato", macro: "carb", shareOfDailyMacro: 0.15 },
        { foodId: "olive_oil", macro: "fat", shareOfDailyMacro: 1 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 150 },
      ],
    },
  ],

  team_sport: [
    {
      id: "breakfast",
      name: "Breakfast",
      purpose: "Carbohydrate-adequate start ahead of variable daily workload.",
      ingredients: [
        { foodId: "oats", macro: "carb", shareOfDailyMacro: 0.25 },
        { foodId: "greek_yogurt", macro: "protein", shareOfDailyMacro: 0.25 },
        { foodId: "banana", macro: "garnish", fixedGrams: 120 },
      ],
    },
    {
      id: "pre_training",
      name: "Pre-Training / Match Fuel",
      purpose: "Carbohydrate placed ahead of training or match sessions.",
      ingredients: [
        { foodId: "rice", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "chicken_breast", macro: "protein", shareOfDailyMacro: 0.3 },
      ],
    },
    {
      id: "post_training",
      name: "Post-Training Recovery",
      purpose: "Recovery meal to replenish glycogen and support repair after training/matches.",
      ingredients: [
        { foodId: "rice_cakes", macro: "carb", shareOfDailyMacro: 0.25 },
        { foodId: "whey_protein", macro: "protein", shareOfDailyMacro: 0.25 },
        { foodId: "berries", macro: "garnish", fixedGrams: 100 },
      ],
    },
    {
      id: "dinner",
      name: "Dinner",
      purpose: "Balanced meal supporting recovery and adequate hydration context.",
      ingredients: [
        { foodId: "salmon", macro: "protein", shareOfDailyMacro: 0.2 },
        { foodId: "potato", macro: "carb", shareOfDailyMacro: 0.2 },
        { foodId: "olive_oil", macro: "fat", shareOfDailyMacro: 1 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 150 },
      ],
    },
  ],

  general: [
    {
      id: "breakfast",
      name: "Breakfast",
      purpose: "Simple, sustainable start to the day.",
      ingredients: [
        { foodId: "oats", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "greek_yogurt", macro: "protein", shareOfDailyMacro: 0.35 },
        { foodId: "banana", macro: "garnish", fixedGrams: 120 },
      ],
    },
    {
      id: "lunch",
      name: "Lunch",
      purpose: "Balanced, filling meal built around a lean protein source.",
      ingredients: [
        { foodId: "chicken_breast", macro: "protein", shareOfDailyMacro: 0.4 },
        { foodId: "rice", macro: "carb", shareOfDailyMacro: 0.4 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 150 },
      ],
    },
    {
      id: "dinner",
      name: "Dinner",
      purpose: "Straightforward evening meal to close out the day's targets.",
      ingredients: [
        { foodId: "cod", macro: "protein", shareOfDailyMacro: 0.25 },
        { foodId: "potato", macro: "carb", shareOfDailyMacro: 0.3 },
        { foodId: "olive_oil", macro: "fat", shareOfDailyMacro: 1 },
        { foodId: "vegetables", macro: "garnish", fixedGrams: 150 },
      ],
    },
  ],
}

/* =========================================================
   MEAL COUNT ADAPTATION
   Merge trailing meals so the plan respects the user's stated
   meals-per-day without losing any macro share.
========================================================= */

function mergeMeals(a: BlueprintMeal, b: BlueprintMeal): BlueprintMeal {
  return {
    id: `${a.id}_${b.id}`,
    name: `${a.name} + ${b.name}`,
    purpose: a.purpose,
    ingredients: [...a.ingredients, ...b.ingredients],
  }
}

function adaptMealCount(
  blueprint: BlueprintMeal[],
  mealsPerDay: number,
): BlueprintMeal[] {
  const desired = Math.min(Math.max(Math.round(mealsPerDay), 3), blueprint.length)

  let meals = [...blueprint]

  while (meals.length > desired) {
    const last = meals[meals.length - 1]
    const secondLast = meals[meals.length - 2]
    meals = [...meals.slice(0, -2), mergeMeals(secondLast, last)]
  }

  return meals
}

/* =========================================================
   GRAM SCALING
========================================================= */

const GRAM_CLAMPS: Record<BlueprintIngredient["macro"], [number, number]> = {
  protein: [30, 320],
  carb: [30, 350],
  fat: [5, 40],
  garnish: [0, 500],
}

function macroPer100g(
  food: FoodTemplate,
  macro: "protein" | "carb" | "fat",
): number {
  if (macro === "protein") return food.proteinPer100g
  if (macro === "carb") return food.carbsPer100g
  return food.fatPer100g
}

function buildIngredient(
  foodId: string,
  grams: number,
): MealIngredient {
  const food = findFood(foodId)
  const factor = grams / 100

  return {
    foodId: food.id,
    name: food.name,
    category: food.category,
    grams,
    calories: Math.round(food.caloriesPer100g * factor),
    protein: Math.round(food.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(food.carbsPer100g * factor * 10) / 10,
    fat: Math.round(food.fatPer100g * factor * 10) / 10,
    measurementBasis: food.preparationState,
  }
}

function sumMealTotals(ingredients: MealIngredient[]): Meal["totals"] {
  return ingredients.reduce(
    (totals, ingredient) => ({
      calories: totals.calories + ingredient.calories,
      protein: Math.round((totals.protein + ingredient.protein) * 10) / 10,
      carbs: Math.round((totals.carbs + ingredient.carbs) * 10) / 10,
      fat: Math.round((totals.fat + ingredient.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}

/**
 * `adaptMealCount()` merges trailing blueprint meals when the user
 * has fewer meals per day than the blueprint was authored with.
 * Two merged meals can each independently include the same garnish
 * (e.g. "Vegetables"), which would otherwise render as two separate
 * rows with the same food in one meal. Collapse those into a single
 * row with combined grams/macros instead.
 */
function mergeDuplicateIngredients(
  ingredients: MealIngredient[],
): MealIngredient[] {
  const order: string[] = []
  const totalsByFoodId = new Map<string, MealIngredient>()

  for (const ingredient of ingredients) {
    const existing = totalsByFoodId.get(ingredient.foodId)

    if (!existing) {
      order.push(ingredient.foodId)
      totalsByFoodId.set(ingredient.foodId, { ...ingredient })
      continue
    }

    totalsByFoodId.set(ingredient.foodId, {
      ...existing,
      grams: existing.grams + ingredient.grams,
      calories: existing.calories + ingredient.calories,
      protein: Math.round((existing.protein + ingredient.protein) * 10) / 10,
      carbs: Math.round((existing.carbs + ingredient.carbs) * 10) / 10,
      fat: Math.round((existing.fat + ingredient.fat) * 10) / 10,
    })
  }

  return order.map((foodId) => totalsByFoodId.get(foodId) as MealIngredient)
}

function buildMeals(
  blueprint: BlueprintMeal[],
  target: MacroTarget,
  blockedTerms: string[],
): { meals: Meal[]; excludedIngredientNames: string[] } {
  const dailyGrams = {
    protein: target.protein,
    carb: target.carbs,
    fat: target.fat,
  }

  const excludedIngredientNames: string[] = []

  const meals = blueprint.map((blueprintMeal) => {
    const ingredients: MealIngredient[] = []

    for (const ingredient of blueprintMeal.ingredients) {
      const resolvedId = resolveFoodId(ingredient.foodId, blockedTerms)

      if (!resolvedId) {
        excludedIngredientNames.push(findFood(ingredient.foodId).name)
        continue
      }

      if (resolvedId !== ingredient.foodId) {
        excludedIngredientNames.push(findFood(ingredient.foodId).name)
      }

      const food = findFood(resolvedId)
      const [minGrams, maxGrams] = GRAM_CLAMPS[ingredient.macro]

      let grams: number

      if (ingredient.macro === "garnish") {
        grams = ingredient.fixedGrams ?? 100
      } else {
        const macroTargetGrams =
          dailyGrams[ingredient.macro] * (ingredient.shareOfDailyMacro ?? 0)

        const per100g = macroPer100g(food, ingredient.macro)

        grams =
          per100g > 0 ? (macroTargetGrams / per100g) * 100 : minGrams
      }

      grams = Math.min(Math.max(roundTo(grams, 5), minGrams), maxGrams)

      ingredients.push(buildIngredient(resolvedId, grams))
    }

    const dedupedIngredients = mergeDuplicateIngredients(ingredients)

    return {
      id: blueprintMeal.id,
      name: blueprintMeal.name,
      purpose: blueprintMeal.purpose,
      ingredients: dedupedIngredients,
      totals: sumMealTotals(dedupedIngredients),
    }
  })

  return { meals, excludedIngredientNames }
}

/* =========================================================
   PUBLIC ENTRY POINT
========================================================= */

export function buildNutritionPlan(input: NutritionInput): NutritionPlan {
  const { bmr, pal, maintenanceCalories, target } = calculateMacroTargets(input)

  const blockedTerms = [...input.allergies, ...input.excludedFoods].filter(
    (term) => term.trim().length > 0,
  )

  const blueprint = adaptMealCount(
    MEAL_BLUEPRINTS[input.trainingMode],
    input.mealsPerDay,
  )

  const { meals, excludedIngredientNames } = buildMeals(
    blueprint,
    target,
    blockedTerms,
  )

  const mealTotals = meals.reduce(
    (totals, meal) => ({
      calories: totals.calories + meal.totals.calories,
      protein: Math.round((totals.protein + meal.totals.protein) * 10) / 10,
      carbs: Math.round((totals.carbs + meal.totals.carbs) * 10) / 10,
      fat: Math.round((totals.fat + meal.totals.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

  return {
    input,
    bmr,
    pal,
    maintenanceCalories,
    goalAdjustmentPercent: GOAL_ADJUSTMENT_PERCENT[input.goal],
    target,
    meals,
    mealTotals,
    trainingNotes: TRAINING_NOTES[input.trainingMode],
    calibrationNotes: CALIBRATION_NOTES,
    healthNote: HEALTH_NOTE,
    excludedIngredientNames: Array.from(new Set(excludedIngredientNames)),
  }
}
