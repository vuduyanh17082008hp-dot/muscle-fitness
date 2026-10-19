/**
 * Shared query understanding — pure types (no I/O, no provider, no persistence).
 * The frame is INTERNAL: it is never returned to the client or shown to the user.
 */

export type CoachDomain = "TRAINING" | "RECOVERY" | "PERFORMANCE" | "NUTRITION" | "GLOBAL" | "UNKNOWN";
export type QueryLanguage = "EN" | "VI" | "MIXED" | "UNKNOWN";
export type CoachOwner = "DANTE" | "GEMMA" | "SHARED";

export type InformationNeed =
  | "FACT" | "CALCULATION" | "EXPLANATION" | "RECOMMENDATION" | "COMPARISON"
  | "DIAGNOSIS_REQUEST" | "PLAN_CHANGE" | "SIMULATION" | "MUTATION" | "UNKNOWN";

export type CrossCoachRelevance = "IRRELEVANT" | "OPTIONAL" | "MATERIAL" | "CRITICAL";
export type ConfidenceClass = "HIGH_SUPPORT" | "MODERATE_SUPPORT" | "WEAK_SUPPORT" | "UNRESOLVED";

export const GEMMA_INTENTS = [
  "FOOD_FACT", "FOOD_MACRO_LOOKUP", "MEAL_IDEA", "MACRO_CALCULATION", "MEAL_ADJUSTMENT", "FOOD_COMPARISON",
  "CRAVING", "RESTAURANT_QUERY", "FOLLOWUP_QUANTITY", "DAILY_REMAINING", "NUTRITION_EXPLANATION",
  "PLAN_CHANGE", "SIMULATION", "MUTATION_REQUEST",
] as const;
export const DANTE_INTENTS = [
  "TRAINING_FACT", "PERFORMANCE_EXPLANATION", "CURRENT_STATE", "TRAINING_RECOMMENDATION", "READINESS_RECOMMENDATION",
  "TRAINING_PLAN_CHANGE", "TRAINING_SIMULATION", "CROSS_DOMAIN_DECISION", "FATIGUE_REPORT", "SAFETY_SYMPTOM",
] as const;
export type GemmaIntent = (typeof GEMMA_INTENTS)[number];
export type DanteIntent = (typeof DANTE_INTENTS)[number];
/** Non-domain intents: nothing to answer (bare noun, casual chatter, social insult). */
export type NeutralIntent = "BARE_MENTION" | "CASUAL" | "SOCIAL_INSULT" | "UNKNOWN";
export type QueryIntent = GemmaIntent | DanteIntent | NeutralIntent;

export type EntityKind =
  | "FOOD" | "EXERCISE" | "MUSCLE_GROUP" | "QUANTITY" | "PREPARATION" | "LOAD" | "EFFORT"
  | "SESSION" | "SYMPTOM" | "PERFORMANCE_CHANGE" | "RESTAURANT"
  /** A subjective/physical state phrase ("buồn ngủ" → SLEEPINESS). `value` is a PhraseState. */
  | "STATE"
  /** A training-decision phrase ("đi tập" → GO_TRAIN). `value` is a PhraseAction. */
  | "ACTION";

export type EntityOrigin = "CURRENT_TURN" | "ACTIVE_TASK" | "PREVIOUS_TURN" | "RECENT_HISTORY" | "ATHLETE_STATE";

export interface QueryEntity {
  kind: EntityKind;
  /** Canonical English key (e.g. "cod", "bench_press", "legs"). */
  value: string;
  /** Surface text as the user wrote it. */
  surface: string;
  origin: EntityOrigin;
  /** FOOD: the generic base key without variety/prep modifiers (e.g. "cod" for "atlantic cod"). */
  base?: string;
  /** Only for QUANTITY. */
  amount?: number;
  unit?: string;
}

export type TimeRef = "TONIGHT" | "TODAY" | "YESTERDAY" | "TOMORROW" | "THIS_WEEK" | "AFTER_TRAINING" | "BEFORE_TRAINING";

export interface QueryConstraints {
  quantity?: number;
  unit?: string;
  calories?: number;
  /** "ate N calories" — intake that already happened, NOT a target. */
  intakeCalories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  time?: TimeRef;
  meal?: string;
  workout?: string;
  exercise?: string;
  preparation?: string;
  preferenceRefs?: string[];
  /** Hard ceilings/floors the user stated ("under 500 calories"). */
  ceilings?: string[];
  /** Signed calorie change request ("300 fewer calories" → -300). */
  calorieDelta?: number;
  /** Things the user wants preserved ("same protein", "don't change my calories"). */
  keep?: string[];
  reduce?: string[];
  increase?: string[];
}

export type RetrievalRoute =
  | "NO_RETRIEVAL" | "LOCAL_RETRIEVAL" | "USDA_RETRIEVAL" | "TRAINING_KNOWLEDGE_RETRIEVAL" | "ATHLETE_STATE" | "MULTI_SOURCE";
export type ThinkingLevel = "MINIMAL" | "MEDIUM" | "DEEP";

export interface RetrievalDecision {
  route: RetrievalRoute;
  thinking: ThinkingLevel;
  /** Fact sources to consult when route is MULTI_SOURCE. */
  sources: Array<"LOCAL" | "USDA" | "TRAINING_KNOWLEDGE" | "ATHLETE_STATE">;
  reasons: string[];
}

/** Objective (recovery score) vs subjective (how the user says they feel) readiness, as the user stated them THIS turn. */
export interface ReadinessSignals {
  /** The message asks whether to train / rest / go. */
  decisionRequested: boolean;
  /** Recovery score the user quoted. Self-reported: canonical Athlete State outranks it. */
  statedRecoveryScore: number | null;
  objective: "LOW" | "OK" | null;
  subjective: "HIGH" | "LOW" | null;
  /** Objective and subjective readiness disagree → evidence is PARTIALLY_IDENTIFIED; both are kept. */
  conflict: boolean;
  /** "Is 11 lower than MY normal?" — the only readiness question that needs longitudinal baseline evidence. */
  baselineQuestion: boolean;
}

export interface UserQueryFrame {
  rawText: string;
  language: QueryLanguage;
  /** Lower-cased, NFC, typo-corrected. Diacritics are PRESERVED. Never used alone for critical classification. */
  normalizedText: string;
  primaryDomain: CoachDomain;
  secondaryDomains: CoachDomain[];
  owner: CoachOwner;
  intent: QueryIntent;
  entities: QueryEntity[];
  references: {
    resolvedFromHistory: boolean;
    previousEntityRefs: string[];
    unresolvedReferences: string[];
    /** Set when a food follow-up has more than one plausible referent; the candidates in the user's own words. */
    ambiguousFoods?: string[];
  };
  constraints: QueryConstraints;
  informationNeed: InformationNeed;
  crossCoachRelevance: CrossCoachRelevance;
  /** Dante-side: the question asks for nutrition-specialist work (meal construction) → recommend Gemma. No handoff is performed. */
  deferToGemma: boolean;
  /** Gemma-side: the question is a training/readiness decision → Dante's, not nutrition's. No handoff is performed. */
  deferToDante: boolean;
  /** Present only for Dante-family turns that carry readiness evidence or ask a train/rest decision. */
  readiness: ReadinessSignals | null;
  /** Short follow-up with no topic of its own: the earlier user message whose topic it continues (<=160 chars). Internal; used only to build the prompt note. */
  followUpOf: string | null;
  /** Pain / symptom wording seen. Flag only — safety semantics stay in lib/dante-core/safety-layer.ts. */
  safetySignal: boolean;
  ambiguity: { present: boolean; fields: string[] };
  confidenceClass: ConfidenceClass;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface FrameContext {
  /** Oldest → newest, EXCLUDING the current message. */
  history?: HistoryTurn[];
  /** Active structured task/draft (e.g. a Gemma meal draft). Outranks history. */
  activeTask?: { foods?: string[]; exercise?: string; workout?: string };
  /** Athlete State hints (e.g. today's scheduled lift). Lowest-priority reference source. */
  athleteState?: { scheduledExercise?: string; scheduledWorkout?: string; lastFood?: string };
  /** Which chat surface is asking; only biases ties. */
  surface?: "DANTE" | "GEMMA";
}
