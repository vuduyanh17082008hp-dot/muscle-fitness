import type { RetrievalDecision, ThinkingLevel, UserQueryFrame } from "./types";

export interface RetrievalOptions {
  /** True when the local canonical table already covers this generic food (no external source needed). */
  isLocallyKnown?: (foodBase: string) => boolean;
}

const FOOD_LOOKUP_INTENTS = new Set(["FOOD_FACT", "FOOD_MACRO_LOOKUP", "MACRO_CALCULATION", "FOLLOWUP_QUANTITY", "FOOD_COMPARISON", "SIMULATION", "RESTAURANT_QUERY"]);
const STATE_INTENTS = new Set(["CURRENT_STATE", "TRAINING_RECOMMENDATION", "READINESS_RECOMMENDATION", "DAILY_REMAINING", "MEAL_IDEA", "MEAL_ADJUSTMENT", "CRAVING", "FATIGUE_REPORT", "TRAINING_PLAN_CHANGE", "TRAINING_SIMULATION"]);
const KNOWLEDGE_INTENTS = new Set(["TRAINING_FACT", "PERFORMANCE_EXPLANATION", "NUTRITION_EXPLANATION", "TRAINING_PLAN_CHANGE"]);

/**
 * Explicit retrieval + reasoning-effort decision. "Do not retrieve just because tools exist":
 * conversational/bare turns retrieve nothing, a plain food fact retrieves one food source, and only genuinely
 * cross-domain or causal turns fan out.
 */
export function decideRetrieval(frame: UserQueryFrame, options: RetrievalOptions = {}): RetrievalDecision {
  const reasons: string[] = [];
  const sources = new Set<RetrievalDecision["sources"][number]>();
  const { intent } = frame;

  if (intent === "CASUAL" || intent === "SOCIAL_INSULT" || intent === "BARE_MENTION" || intent === "UNKNOWN") {
    return { route: "NO_RETRIEVAL", thinking: "MINIMAL", sources: [], reasons: [`intent_${intent.toLowerCase()}`] };
  }
  if (intent === "SAFETY_SYMPTOM") {
    return { route: "NO_RETRIEVAL", thinking: "MEDIUM", sources: [], reasons: ["safety_layer_owns_turn"] };
  }

  if (FOOD_LOOKUP_INTENTS.has(intent) || (frame.crossCoachRelevance !== "IRRELEVANT" && frame.entities.some((e) => e.kind === "FOOD"))) {
    const food = frame.entities.find((e) => e.kind === "FOOD");
    const specific = Boolean(food && food.value !== food.base) || frame.entities.some((e) => e.kind === "PREPARATION");
    const known = food ? (options.isLocallyKnown ? options.isLocallyKnown(food.base ?? food.value) : false) : false;
    if (food && known && !specific) { sources.add("LOCAL"); reasons.push("generic_food_in_local_canonical"); }
    else if (food) { sources.add("USDA"); sources.add("LOCAL"); reasons.push(known ? "specific_variety_or_preparation" : "food_not_in_local_canonical"); }
  }
  if (STATE_INTENTS.has(intent) || intent === "CROSS_DOMAIN_DECISION") { sources.add("ATHLETE_STATE"); reasons.push("needs_current_state"); }
  if (KNOWLEDGE_INTENTS.has(intent) || intent === "CROSS_DOMAIN_DECISION" || intent === "TRAINING_RECOMMENDATION" || intent === "READINESS_RECOMMENDATION") {
    if (frame.primaryDomain !== "NUTRITION") { sources.add("TRAINING_KNOWLEDGE"); reasons.push("training_knowledge"); }
  }

  const list = [...sources];
  let route: RetrievalDecision["route"];
  if (list.length === 0) route = "NO_RETRIEVAL";
  else if (list.length === 1 || (list.length === 2 && list.includes("USDA") && list.includes("LOCAL"))) {
    route = list.includes("USDA") ? "USDA_RETRIEVAL" : list.includes("LOCAL") ? "LOCAL_RETRIEVAL" : list.includes("ATHLETE_STATE") ? "ATHLETE_STATE" : "TRAINING_KNOWLEDGE_RETRIEVAL";
  } else route = "MULTI_SOURCE";

  return { route, thinking: decideThinking(frame), sources: list, reasons };
}

/** MINIMAL: simple factual lookup. MEDIUM: multi-constraint recommendation. DEEP: causal / conflicting / cross-domain tradeoff. */
export function decideThinking(frame: UserQueryFrame): ThinkingLevel {
  const { intent } = frame;
  if (frame.crossCoachRelevance === "CRITICAL" || intent === "CROSS_DOMAIN_DECISION") return "DEEP";
  if (intent === "PERFORMANCE_EXPLANATION") return "DEEP";
  if (intent === "FOOD_MACRO_LOOKUP" || intent === "FOLLOWUP_QUANTITY" || intent === "FOOD_FACT" || intent === "TRAINING_FACT" || intent === "DAILY_REMAINING" || intent === "CURRENT_STATE") {
    return frame.crossCoachRelevance === "MATERIAL" ? "MEDIUM" : "MINIMAL";
  }
  if (intent === "CASUAL" || intent === "SOCIAL_INSULT" || intent === "BARE_MENTION") return "MINIMAL";
  return "MEDIUM";
}
