import { hasAny, hasTerm } from "./entities";
import { maskPhrases } from "./phrases";
import { NUTRITION_WORDS, PERFORMANCE_WORDS, RECOVERY_WORDS, SYMPTOM_WORDS, TRAINING_WORDS } from "./lexicon";
import type {
  CoachDomain, CrossCoachRelevance, InformationNeed, QueryConstraints, QueryEntity, QueryIntent, ReadinessSignals,
} from "./types";

const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";
const re = (src: string) => new RegExp(src, "iu");
/** Word-bounded alternation. */
const w = (alts: string) => re(`${L}(?:${alts})${R}`);

const ASKS_MEAL = w("what should i (?:eat|have)|what to eat|what can i eat|something to eat|meal ideas?|dinner ideas?|build (?:me )?(?:a|my)|plan (?:a|my) meal|ăn gì|nên ăn|gợi ý bữa");
const ASKS_TRAIN_DECISION = w("should i (?:still )?(?:train|squat|deadlift|bench|lift|push|go|work ?out|deload|rest|hit|do)|can i (?:still )?(?:train|squat|deadlift|bench|lift|push)|có nên|nên (?:đi )?(?:tập|gym|squat|deload|deadlift|bench|nghỉ)|should we|(?:vẫn|cứ) (?:đi )?tập|tập (?:hay|or) nghỉ|nghỉ (?:hay|or) tập|train or rest|rest or train|(?:squat|deadlift|bench|tập)[^?.!]{0,16}được không");
/** "nên đi không?" is a train decision only when the message is about training ("tôi muốn đi tập … nên đi không"). */
const ASKS_GO = w("nên đi (?:không|hay)|đi (?:không|nhỉ|nhé)");
const TRAIN_CONTEXT = w("đi tập|tập|gym|train\\w*|workout|squat|deadlift|bench");
const askTrain = (text: string) => ASKS_TRAIN_DECISION.test(text) || (ASKS_GO.test(text) && TRAIN_CONTEXT.test(text));
const CASUAL = re(`${L}(?:i'm|im) (?:dead|dying)${R}|${L}(?:workout|session|leg day|that set|cardio) (?:killed|destroyed|murdered|wrecked) me${R}|^(?:lol|lmao|haha+|ok+|thanks|thx)[.!\\s]*$`);
const FATIGUE_IDIOM = w("cooked|dead|destroyed|jelly|gassed|fried|toast|wrecked|heavy|shot|mỏi|nặng|ê|rã|đuối|mệt|nhức");
const BODY_PART = w("legs?|quads?|hamstrings?|glutes?|calves|back|shoulders?|arms?|chest|chân|lưng|vai|tay|mông|đùi|body");
const INSULT = re(`${L}(?:ngu|ngốc|óc chó|đần)${R}`);
const SLEEP_CONTEXT = w("tệ|te|quá|qua|ít|it|muộn|muon|đêm|dem|không|khong|nhiều|nhieu|ngon|sâu|sau|giấc|giac|rồi|roi|hôm qua|hom qua|sleep");
const WHY = re(`${L}(?:why|how come|tại sao|vì sao|sao (?:mà|lại))${R}|^sao${R}`);
const FACT_Q = w("what is|what's|what does|what are|define|meaning of|là gì|nghĩa là");
const SIM = w("what if|what about .{0,30}(?:tomorrow|instead|later)|if i (?:train|squat|deadlift|bench|eat|have|skip)|nếu|thay vì|instead");
const QUANTITY_SWAP = w("what if|instead|thay vì|nếu");
const FIT_SIM =w("can i fit|will (?:this|that|it) fit|does (?:this|that|it) fit|fit (?:this|that|it|mcdonald'?s|kfc)|có thể ăn|ăn .{0,20} được không|vừa không");
const COMPARE = w("better than|versus|compare|tốt hơn|hơn không|or");
const REMAINING = w("left|remaining|còn lại|còn bao nhiêu|còn thiếu|how much .{0,25} (?:do i|can i|have i)");
const MACRO_Q = w("macros|calories in|protein in|carbs in|nutrition|nutrients|how many calories|bao nhiêu calo|macro sao|macros? (?:for|of)|calories (?:for|of)|calo");
const FOOD_Q = w("good (?:source )?(?:of|for)|healthy|high in|rich in|ok to eat|is .{1,30} good|tốt không|có tốt|có nhiều");
const PLAN_CHANGE_NUT = w("(?:change|update|set|adjust|đổi|chỉnh).{0,20}(?:calorie|protein|macro|target|goal|mục tiêu)");
const MUTATION = w("log (?:this|it|that|my)|add (?:this|it|that).{0,20}(?:log|diary|lunch|dinner|breakfast)|ghi (?:vào|lại)|thêm vào");
const CRAVE = w("crav\\w*|thèm|want something (?:sweet|salty|crunchy|creamy)|sweet tooth");
const ADJUST = w("same|lighter|swap|instead|giữ .{1,20} nhưng|nhẹ hơn|lower|fewer|less|cheaper|rẻ hơn|giảm|thay");
const PLAN_CHANGE_TRAIN = w("(?:reduce|lower|cut|increase|raise|change|adjust|drop|giảm|tăng|đổi).{0,25}(?:volume|intensity|sets|fatigue|program|plan|load|frequency)|deload|swap .{0,15}(?:session|exercise)|reduce fatigue");
const CURRENT_STATE = w("how(?:'s| is| are) my (?:recovery|readiness|sleep|training|volume|form)|my (?:recovery|readiness) (?:score|today|status)|recovery (?:của|cua) (?:tôi|mình)|recovery .{0,10}sao");
const DECLINE = w("dropped|drop|down|worse|weaker|weak|lost|stalled|declin\\w*|regress\\w*|slower|yếu|tệ|tụt|giảm");
const NUTRITION_INTAKE = re(`${L}(?:ate|eaten|haven't eaten|have not eaten|barely ate|only ate|skipped (?:breakfast|lunch|dinner|meals?)|fasted|fasting|starving|hungry|mới ăn|chưa ăn|nhịn ăn|đói)${R}`);
const HEAVY = w("heavy|max|1rm|pr|hard|intense|nặng|tạ nặng|all[- ]out");

function count(text: string, words: readonly string[]): number {
  return words.reduce((n, word) => n + (hasTerm(text, word) ? 1 : 0), 0);
}

export interface Signals {
  nutrition: number;
  training: number;
  recovery: number;
  performance: number;
}

export function domainSignals(text: string, entities: QueryEntity[], constraints: QueryConstraints): Signals {
  const has = (k: QueryEntity["kind"]) => entities.filter((e) => e.kind === k).length;
  let nutrition = count(text, NUTRITION_WORDS) + has("FOOD") * 2 + has("RESTAURANT");
  let training = count(text, TRAINING_WORDS) + has("EXERCISE") * 2 + has("MUSCLE_GROUP") + has("LOAD") + has("EFFORT");
  const recovery = count(text, RECOVERY_WORDS);
  const performance = (DECLINE.test(text) && (has("EXERCISE") || has("LOAD") || /\b(?:pr|lift|squat|bench|deadlift)\b/iu.test(text)) ? 2 : 0) + count(text, PERFORMANCE_WORDS) * 0;
  if (ASKS_MEAL.test(text)) nutrition += 3;
  if (MACRO_Q.test(text) && has("FOOD")) nutrition += 3;
  if (askTrain(text)) training += 3;
  if (constraints.intakeCalories !== undefined) {
    // "I ate 800 calories" is context for a training question, not a nutrition question by itself.
    nutrition = Math.min(nutrition, 1.5);
    if (training + recovery > 0) training += 1;
  }
  return { nutrition, training, recovery, performance };
}

export function classifyDomain(sig: Signals, surface?: "DANTE" | "GEMMA"): { primary: CoachDomain; secondary: CoachDomain[] } {
  const ranked: Array<[CoachDomain, number]> = [
    ["PERFORMANCE", sig.performance + (sig.performance > 0 ? sig.training : 0) + 0.2],
    ["TRAINING", sig.training + 0.15],
    ["RECOVERY", sig.recovery + 0.1],
    ["NUTRITION", sig.nutrition + (surface === "GEMMA" ? 0.05 : 0)],
  ];
  const top = Math.max(...ranked.map(([, s]) => s));
  if (top < 1) return { primary: "UNKNOWN", secondary: [] };
  ranked.sort((a, b) => b[1] - a[1]);
  const raw: Record<CoachDomain, number> = { PERFORMANCE: sig.performance, TRAINING: sig.training, RECOVERY: sig.recovery, NUTRITION: sig.nutrition, GLOBAL: 0, UNKNOWN: 0 };
  const secondary = ranked.slice(1).filter(([d]) => raw[d] > 0).map(([d]) => d);
  // PERFORMANCE and TRAINING describe the same coach; keep the more specific one primary, never list both as "secondary" noise.
  return { primary: ranked[0][0], secondary: secondary.filter((d) => !(ranked[0][0] === "PERFORMANCE" && d === "TRAINING")) };
}

export interface IntentInput {
  text: string;
  primary: CoachDomain;
  entities: QueryEntity[];
  constraints: QueryConstraints;
  wordCount: number;
  /** A food was named earlier in the bounded conversation (or the active task). */
  historyHasFood: boolean;
  hasQuestionMark: boolean;
  fatigueReport: boolean;
  safetySignal: boolean;
  signals: Signals;
  readiness?: ReadinessSignals | null;
}

const has = (entities: QueryEntity[], kind: QueryEntity["kind"]) => entities.some((e) => e.kind === kind);

export function classifyIntent(i: IntentInput): QueryIntent {
  const { text, entities, constraints: c } = i;

  // A concrete coaching decision outranks slang/insult wording ("bố mày", "nghỉ mẹ ở nhà"): COACHING INTENT > STYLE.
  if (isInsult(text) && !askTrain(text)) return "SOCIAL_INSULT";
  if (CASUAL.test(text) && !askTrain(text) && !i.hasQuestionMark) return "CASUAL";
  if (i.safetySignal) return "SAFETY_SYMPTOM";

  const training = i.primary === "TRAINING" || i.primary === "RECOVERY" || i.primary === "PERFORMANCE";
  if (training) {
    const nutritionContext = c.intakeCalories !== undefined || NUTRITION_INTAKE.test(text);
    if (askTrain(text) && nutritionContext) return "CROSS_DOMAIN_DECISION";
    if (SIM.test(text) || FIT_SIM.test(text)) return "TRAINING_SIMULATION";
    if (PLAN_CHANGE_TRAIN.test(text)) return "TRAINING_PLAN_CHANGE";
    if (CURRENT_STATE.test(text) || (i.readiness?.baselineQuestion && !askTrain(text))) return "CURRENT_STATE";
    if (WHY.test(text) && !FACT_Q.test(text)) return "PERFORMANCE_EXPLANATION";
    if (askTrain(text)) return i.readiness && hasReadinessEvidence(i.readiness, text) ? "READINESS_RECOMMENDATION" : "TRAINING_RECOMMENDATION";
    if (FACT_Q.test(text)) return "TRAINING_FACT";
    if (has(entities, "PERFORMANCE_CHANGE")) return "PERFORMANCE_EXPLANATION";
    if (i.fatigueReport) return "FATIGUE_REPORT";
    return nutritionContext ? "CROSS_DOMAIN_DECISION" : "UNKNOWN";
  }

  if (i.primary === "NUTRITION" || has(entities, "FOOD") || has(entities, "RESTAURANT")) {
    if (MUTATION.test(text)) return "MUTATION_REQUEST";
    if (PLAN_CHANGE_NUT.test(text)) return "PLAN_CHANGE";
    // "what if I eat 150 g instead?" after a food was named: a new amount of THAT food, not a hypothetical meal or an edit.
    const newAmount = entities.some((e) => e.kind === "QUANTITY" && e.origin === "CURRENT_TURN");
    if (newAmount && !entities.some((e) => e.kind === "FOOD" && e.origin === "CURRENT_TURN") && i.historyHasFood && QUANTITY_SWAP.test(text) && i.wordCount <= 10 && !ASKS_MEAL.test(text) && !FIT_SIM.test(text)) return "FOLLOWUP_QUANTITY";
    if (FIT_SIM.test(text) || (SIM.test(text) && has(entities, "FOOD"))) return "SIMULATION";
    if (COMPARE.test(text) && entities.filter((e) => e.kind === "FOOD").length >= 2) return "FOOD_COMPARISON";
    if (REMAINING.test(text) && /(?:protein|calories|macros|carbs|fat|calo)/iu.test(text)) return "DAILY_REMAINING";
    if (CRAVE.test(text)) return "CRAVING";
    if (has(entities, "RESTAURANT")) return "RESTAURANT_QUERY";
    const cue = /(?<![\p{L}])(?:what about|how about|same but|same|thì sao|còn)(?![\p{L}])/iu.test(text);
    const currentFood = entities.some((e) => e.kind === "FOOD" && e.origin === "CURRENT_TURN");
    if (cue && i.historyHasFood && (has(entities, "PREPARATION") || currentFood)) {
      return "FOOD_MACRO_LOOKUP";
    }
    if (has(entities, "QUANTITY") && i.wordCount <= 6 && !ASKS_MEAL.test(text) && !MACRO_Q.test(text)) return "FOLLOWUP_QUANTITY";
    if (WHY.test(text)) return "NUTRITION_EXPLANATION";
    if (MACRO_Q.test(text) && (has(entities, "FOOD") || i.historyHasFood)) {
      return has(entities, "QUANTITY") && /(?:how many|total|calculate|tổng)/iu.test(text) ? "MACRO_CALCULATION" : "FOOD_MACRO_LOOKUP";
    }
    if (ASKS_MEAL.test(text) || c.ceilings?.length || c.preferenceRefs?.includes("high_protein") || c.protein !== undefined || (c.calories !== undefined && !has(entities, "FOOD"))) return "MEAL_IDEA";
    if ((c.keep?.length || c.reduce?.length || c.calorieDelta !== undefined || ADJUST.test(text)) && (i.historyHasFood || /meal|dinner|lunch|breakfast|bữa|món/iu.test(text) || i.wordCount <= 6)) return "MEAL_ADJUSTMENT";
    if (has(entities, "QUANTITY") && has(entities, "FOOD") && /(?:enough|đủ)/iu.test(text)) return "MACRO_CALCULATION";
    if (FOOD_Q.test(text) && has(entities, "FOOD")) return "FOOD_FACT";
    if (has(entities, "FOOD") && i.hasQuestionMark) return "FOOD_FACT";
    if (has(entities, "FOOD")) return "BARE_MENTION";
  }
  return "UNKNOWN";
}

export function classifyInformationNeed(intent: QueryIntent): InformationNeed {
  switch (intent) {
    case "FOOD_FACT": case "FOOD_MACRO_LOOKUP": case "TRAINING_FACT": case "FOLLOWUP_QUANTITY": case "DAILY_REMAINING": case "CURRENT_STATE":
      return "FACT";
    case "MACRO_CALCULATION":
      return "CALCULATION";
    case "NUTRITION_EXPLANATION": case "PERFORMANCE_EXPLANATION":
      return "EXPLANATION";
    case "MEAL_IDEA": case "MEAL_ADJUSTMENT": case "CRAVING": case "RESTAURANT_QUERY": case "TRAINING_RECOMMENDATION": case "READINESS_RECOMMENDATION": case "CROSS_DOMAIN_DECISION": case "FATIGUE_REPORT": case "SAFETY_SYMPTOM":
      return "RECOMMENDATION";
    case "FOOD_COMPARISON":
      return "COMPARISON";
    case "PLAN_CHANGE": case "TRAINING_PLAN_CHANGE":
      return "PLAN_CHANGE";
    case "SIMULATION": case "TRAINING_SIMULATION":
      return "SIMULATION";
    case "MUTATION_REQUEST":
      return "MUTATION";
    default:
      return "UNKNOWN";
  }
}

export interface CrossInput {
  primary: CoachDomain;
  secondary: CoachDomain[];
  text: string;
  constraints: QueryConstraints;
  signals: Signals;
  lowRecoveryCue: boolean;
}

export function detectCrossDomainRelevance(i: CrossInput): CrossCoachRelevance {
  const dante = i.primary === "TRAINING" || i.primary === "RECOVERY" || i.primary === "PERFORMANCE";
  const intake = i.constraints.intakeCalories;
  const nutritionSignal = i.signals.nutrition > 0 || intake !== undefined || NUTRITION_INTAKE.test(i.text);
  const trainingSignal = i.signals.training + i.signals.recovery > 0;
  if (dante && nutritionSignal) {
    const veryLow = (intake !== undefined && intake <= 300) || /(?:haven't eaten|have not eaten|chưa ăn|nhịn ăn|fasted|skipped (?:breakfast|lunch|dinner|meals?))/iu.test(i.text);
    return veryLow && HEAVY.test(i.text) ? "CRITICAL" : intake !== undefined || NUTRITION_INTAKE.test(i.text) ? "MATERIAL" : "OPTIONAL";
  }
  if (i.primary === "NUTRITION" && trainingSignal) {
    const timing = i.constraints.time === "AFTER_TRAINING" || i.constraints.time === "BEFORE_TRAINING";
    return timing || i.lowRecoveryCue || HEAVY.test(i.text) || i.constraints.workout ? "MATERIAL" : "OPTIONAL";
  }
  return "IRRELEVANT";
}

export const isSymptomText = (text: string) => hasAny(text, SYMPTOM_WORDS);
export const isFatigueIdiom = (text: string) => FATIGUE_IDIOM.test(text) && BODY_PART.test(text);
export const mentionsDecline = (text: string) => DECLINE.test(text);
export const mentionsLowRecovery = (text: string) => w("recovery (?:is )?(?:low|thấp|bad|poor)|thấp|low recovery|recovery thấp|slept (?:badly|poorly)|ngủ tệ|ngủ ít|tired|exhausted").test(text);
export const asksTrainingDecision = askTrain;
export const asksMeal = (text: string) => ASKS_MEAL.test(text);
export const isHeavy = (text: string) => HEAVY.test(text);
export const isWhy = (text: string) => WHY.test(text);
export const isMacroQuestion = (text: string) => MACRO_Q.test(text);
export const isQuantitySwap = (text: string) => QUANTITY_SWAP.test(text);
export const isCasual = (text: string) => CASUAL.test(text);
/** Phrases are masked first: "buồn ngủ" / "buon ngu" are sleepiness, never the insult "ngu". */
export const isInsult = (text: string) => {
  const masked = maskPhrases(text);
  return INSULT.test(masked) && !(hasTerm(masked, "ngu") && SLEEP_CONTEXT.test(masked.replace(/ngu/giu, " ")));
};

/** A train/rest decision that carries readiness evidence (a score, how the user feels, sleep, fatigue) is a readiness question. */
export function hasReadinessEvidence(r: ReadinessSignals, text: string): boolean {
  return r.statedRecoveryScore !== null || r.subjective !== null || r.objective !== null || mentionsLowRecovery(text) || isFatigueIdiom(text);
}
