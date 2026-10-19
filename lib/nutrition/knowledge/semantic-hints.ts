/**
 * Closed vocabularies of retrieval concepts the corpus can serve. Layer 2 (the single semantic call) may only pick from
 * them; each value maps to canonical retrieval terms below, so indirect or non-English wording ("more snap", "sharper",
 * a Vietnamese sentence) reaches the right section without any user-vocabulary regex. Every value is validated against
 * these lists. They are retrieval hints only: never user state, preferences, memory, allergies, actions or medical facts.
 */
export const SEMANTIC_SENSORY = ["crunchy", "creamy", "chewy", "cold", "sweet", "salty", "spicy", "sour", "bitter", "umami", "herby", "juicy"] as const
export type SemanticSensory = (typeof SEMANTIC_SENSORY)[number]
export const SENSORY_RETRIEVAL_TERMS: Record<SemanticSensory, { sensory: string; terms: string[] }> = {
  crunchy: { sensory: "crunchy", terms: ["crunch", "crispness"] },
  creamy: { sensory: "creamy", terms: ["creaminess"] },
  chewy: { sensory: "chewy", terms: ["chew"] },
  cold: { sensory: "cold", terms: ["frozen"] },
  sweet: { sensory: "sweet", terms: ["sweetness"] },
  salty: { sensory: "salty", terms: ["salt"] },
  spicy: { sensory: "spicy", terms: ["spice", "heat"] },
  sour: { sensory: "sour", terms: ["acidity", "acid"] },
  bitter: { sensory: "bitter", terms: ["bitterness"] },
  umami: { sensory: "umami", terms: ["umami"] },
  herby: { sensory: "aromatic", terms: ["herb", "aromatic"] },
  juicy: { sensory: "juicy", terms: ["juicy"] },
}

export const SEMANTIC_CUISINES = ["vietnamese", "singapore_hawker"] as const
export const SEMANTIC_FOODS = ["fried_chicken", "cereal", "ice_cream", "fast_food"] as const

/**
 * What the answer should be ABOUT, beyond taste and texture: the strategy topics the corpus's goal, principle and
 * uncertainty documents are organised around. Each id carries the few canonical words the corpus itself uses for that
 * topic (taken from its section headings), so a concept in any language lands on the section that is locally about it.
 */
export const TOPIC_RETRIEVAL_TERMS = {
  energy_balance: ["energy", "balance", "calorie", "budget"],
  protein: ["protein"],
  satiety: ["satiety", "volume", "filling"],
  carbohydrate: ["carbohydrate", "performance"],
  meal_density: ["meal", "density", "energy", "availability"],
  meal_composition: ["meal", "composition", "protein", "carbohydrate"],
  meal_timing: ["meal", "structure", "performance"],
  indulgent_meal: ["indulgent", "meal", "restriction"],
  food_flexibility: ["flexible", "restriction", "moralisation"],
  adherence: ["adherence"],
  portion_estimates: ["portion", "uncertainty"],
  estimate_confidence: ["estimate", "verified", "range", "confidence"],
  eating_out: ["restaurant", "hawker", "ordering", "uncertainty"],
  substitution: ["substitution", "modify", "calorie"],
  preferred_foods: ["preserve", "preferred", "foods"],
  coaching_tone: ["autonomy", "shaming", "trade-offs"],
  sauces: ["sauce", "gravy", "dressing"],
  calorie_drivers: ["main", "calorie", "drivers"],
  keep_identity: ["recognizable", "identity", "preserve", "sensory"],
  cooking_method: ["grilled", "fried", "broth", "preparation"],
  craving_understanding: ["understand", "craving", "sensory", "target"],
  dish_patterns: ["common", "dish", "patterns"],
  texture_contrast: ["contrast"],
  seasoning: ["seasoning", "sauce", "acidity", "salt", "umami", "aromatics"],
} as const satisfies Record<string, readonly string[]>
export type SemanticTopic = keyof typeof TOPIC_RETRIEVAL_TERMS
export const SEMANTIC_TOPICS = Object.keys(TOPIC_RETRIEVAL_TERMS) as SemanticTopic[]

/** Goals the corpus has documents for. A goal the MESSAGE itself states ("I'm cutting"), in any language; absent = say nothing. */
export const SEMANTIC_GOALS = ["fat_loss", "muscle_gain"] as const
export type SemanticGoal = (typeof SEMANTIC_GOALS)[number]

/** Everything Layer 2 may hand to the query builder. Each list is already filtered to its closed vocabulary. */
export type SemanticQueryHints = { sensory?: SemanticSensory[]; cuisines?: string[]; foods?: string[]; topics?: SemanticTopic[]; goal?: SemanticGoal }
