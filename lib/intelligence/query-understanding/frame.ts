import {
  asksMeal, asksTrainingDecision, classifyDomain, classifyInformationNeed, classifyIntent, detectCrossDomainRelevance, domainSignals,
  isCasual, isFatigueIdiom, isHeavy, isInsult, isMacroQuestion, isQuantitySwap, isSymptomText, isWhy, mentionsDecline, mentionsLowRecovery,
} from "./classify";
import {
  extractConstraints, extractExercises, extractFoods, extractLoad, extractMuscles, extractPreparation, extractQuantities, extractRestaurants,
} from "./entities";
import { detectPhrases, type PhraseState } from "./phrases";
import { extractReadiness } from "./readiness";
import { historyMentionsFood, looksLikeExerciseFollowUp, looksLikeFoodFollowUp, resolveConversationReferences } from "./references";
import { detectLanguage, normalizeQueryText } from "./text";
import type { CoachOwner, ConfidenceClass, FrameContext, QueryEntity, QueryIntent, UserQueryFrame } from "./types";

const DANTE_FAMILY = new Set(["TRAINING", "RECOVERY", "PERFORMANCE"]);

/** Decisions that belong to Dante. Gemma answers none of them: she says so and points to Dante. */
const DANTE_DECISION_INTENTS = new Set<QueryIntent>(["READINESS_RECOMMENDATION", "TRAINING_RECOMMENDATION", "TRAINING_PLAN_CHANGE", "FATIGUE_REPORT"]);
/** States that are recovery evidence even with no recovery keyword in the message. */
const RECOVERY_STATES = new Set<PhraseState>(["SLEEPINESS", "SHORT_SLEEP", "FATIGUE", "SORENESS", "FEELS_BAD"]);

/** Intents whose answer needs a food entity; a missing one is a reference to resolve, not an error. */
const FOOD_INTENTS = new Set<QueryIntent>(["FOOD_MACRO_LOOKUP", "FOLLOWUP_QUANTITY", "MACRO_CALCULATION", "FOOD_FACT", "SIMULATION"]);

function ownerFor(primary: UserQueryFrame["primaryDomain"], intent: QueryIntent, surface?: "DANTE" | "GEMMA"): CoachOwner {
  if (DANTE_FAMILY.has(primary)) return "DANTE";
  if (primary === "NUTRITION") {
    // Dante may READ nutrition facts for a performance question; meal construction stays Gemma's.
    const factOnly = intent === "FOOD_FACT" || intent === "FOOD_MACRO_LOOKUP" || intent === "MACRO_CALCULATION" || intent === "FOLLOWUP_QUANTITY";
    return surface === "DANTE" && factOnly ? "SHARED" : "GEMMA";
  }
  return "SHARED";
}

/** Public entry point: raw message (+ bounded context) → internal UserQueryFrame. Pure and synchronous. */
export function parseUserQuery(rawText: string, ctx: FrameContext = {}): UserQueryFrame {
  return buildFrame(rawText, ctx, 0);
}

function buildFrame(rawText: string, ctx: FrameContext, depth: number): UserQueryFrame {
  const normalized = normalizeQueryText(rawText);
  const language = detectLanguage(rawText);
  const wordCount = (normalized.match(/[\p{L}\p{N}]+/gu) ?? []).length;

  // ---- entities (current turn only) ----
  const loads = extractLoad(normalized);
  const scan = extractQuantities(normalized);
  // "100kg" is a lifting load, not a food weight.
  scan.entities = scan.entities.filter((q) => !loads.some((l) => l.surface === q.surface));
  const prep = extractPreparation(normalized);
  const entities: QueryEntity[] = [
    ...extractFoods(normalized),
    ...extractExercises(normalized),
    ...extractMuscles(normalized),
    ...extractRestaurants(normalized),
    ...scan.entities,
    ...loads,
  ];
  if (prep) entities.push({ kind: "PREPARATION", value: prep.method ?? prep.state, surface: prep.surface, origin: "CURRENT_TURN" });
  const decline = mentionsDecline(normalized);
  const symptom = isSymptomText(normalized);
  const constraints = extractConstraints(normalized, scan);
  if (prep) constraints.preparation = prep.method ?? prep.state;
  if (decline && entities.some((e) => e.kind === "EXERCISE" || e.kind === "LOAD")) {
    entities.push({ kind: "PERFORMANCE_CHANGE", value: "decline", surface: "decline", origin: "CURRENT_TURN" });
  }
  const fatigue = isFatigueIdiom(normalized);
  if (fatigue) entities.push({ kind: "SYMPTOM", value: "fatigue", surface: "fatigue", origin: "CURRENT_TURN" });
  // Phrase layer: the longest meaningful phrase claims its words ("buồn ngủ" = sleepy, not "buồn" + "ngủ").
  const phrases = detectPhrases(normalized);
  for (const p of phrases) entities.push({ kind: p.kind, value: p.key, surface: p.surface, origin: "CURRENT_TURN" });
  const recoveryStates = phrases.filter((p) => p.kind === "STATE" && RECOVERY_STATES.has(p.key as PhraseState)).length;
  const readiness = extractReadiness(normalized, phrases);

  // ---- domain ----
  let signals = domainSignals(normalized, entities, constraints);
  // Fatigue/recovery wording is recovery evidence even when no recovery keyword appears ("legs are cooked").
  if (fatigue) signals = { ...signals, recovery: signals.recovery + 2 };
  if (recoveryStates > 0) signals = { ...signals, recovery: signals.recovery + 1 };
  if (readiness?.statedRecoveryScore != null) signals = { ...signals, recovery: signals.recovery + 1 };

  // Short follow-ups ("why?", "what should I change?") inherit the topic of the previous user turn.
  let inheritedFrom: UserQueryFrame | null = null;
  let inheritedText: string | null = null;
  const noOwnTopic = signals.nutrition + signals.training + signals.recovery + signals.performance < 1;
  if (noOwnTopic && depth === 0 && ctx.history?.length) {
    // Walk back (bounded) to the nearest earlier user turn that has a topic of its own.
    const priorUsers = ctx.history.map((t, i) => ({ t, i })).filter(({ t }) => t.role === "user").slice(-3).reverse();
    for (const { t, i } of priorUsers) {
      const prior = buildFrame(t.text, { ...ctx, history: ctx.history.slice(0, i) }, depth + 1);
      if (prior.primaryDomain !== "UNKNOWN" && prior.primaryDomain !== "GLOBAL") {
        inheritedFrom = prior;
        inheritedText = t.text.replace(/\s+/g, " ").trim().slice(0, 160);
        break;
      }
    }
  }

  const sym = symptom && /(?<![\p{L}])(?:chest|ngực|bench|squat|deadlift|knee|shoulder|back|lưng|vai|gối|during|khi|lúc|while)(?![\p{L}])/iu.test(normalized);
  const safetySignal = sym || /(?<![\p{L}])(?:chest pain|đau ngực|dizzy|chóng mặt|numb|tingling)(?![\p{L}])/iu.test(normalized);
  if (safetySignal) signals = { ...signals, training: signals.training + 1, recovery: signals.recovery + 1 };

  let { primary, secondary } = classifyDomain(signals, ctx.surface);
  if (inheritedFrom && inheritedFrom.primaryDomain !== "UNKNOWN" && inheritedFrom.primaryDomain !== "GLOBAL") {
    primary = inheritedFrom.primaryDomain;
    secondary = inheritedFrom.secondaryDomains;
  }
  const insult = isInsult(normalized) && !asksTrainingDecision(normalized);
  const casual = isCasual(normalized) && !asksTrainingDecision(normalized);
  if (insult || casual) {
    primary = "GLOBAL";
    secondary = [];
  }

  // ---- references ----
  const wantsFood = !insult && !casual && (primary === "NUTRITION" || (inheritedFrom?.primaryDomain === "NUTRITION")) && looksLikeFoodFollowUp(normalized)
    || (isMacroQuestion(normalized) && !entities.some((e) => e.kind === "FOOD") && primary === "NUTRITION")
    || (scan.entities.length > 0 && !entities.some((e) => e.kind === "FOOD" || e.kind === "LOAD") && (wordCount <= 6 || (isQuantitySwap(normalized) && wordCount <= 10)) && primary !== "GLOBAL" && (noOwnTopic || primary === "NUTRITION"));
  const wantsExercise = !insult && !casual && DANTE_FAMILY.has(primary) && !entities.some((e) => e.kind === "EXERCISE" || e.kind === "MUSCLE_GROUP")
    && (entities.some((e) => e.kind === "LOAD" || e.kind === "PERFORMANCE_CHANGE") || looksLikeExerciseFollowUp(normalized) || asksTrainingDecision(normalized));
  const refs = resolveConversationReferences(normalized, entities, { food: wantsFood, exercise: wantsExercise }, ctx);
  entities.push(...refs.entities);
  if (refs.carriedQuantity) {
    entities.push(refs.carriedQuantity);
    constraints.quantity = refs.carriedQuantity.amount;
    constraints.unit = refs.carriedQuantity.unit;
  }
  if (refs.carriedPreparation) constraints.preparation = refs.carriedPreparation;
  const exEntity = entities.find((e) => e.kind === "EXERCISE" || e.kind === "MUSCLE_GROUP");
  if (exEntity) constraints.exercise = exEntity.value;

  // Dante follow-up: a carried-over exercise question ("why?" after "my squat feels weak") keeps the topic exercise.
  if (inheritedFrom && DANTE_FAMILY.has(primary)) {
    for (const e of inheritedFrom.entities) {
      if ((e.kind === "EXERCISE" || e.kind === "MUSCLE_GROUP") && !entities.some((x) => x.kind === e.kind)) {
        entities.push({ ...e, origin: "PREVIOUS_TURN" });
        refs.previousEntityRefs.push(`${e.kind}:${e.value}`);
        refs.resolvedFromHistory = true;
        constraints.exercise ??= e.value;
      }
    }
  }

  // ---- intent ----
  const fatigueReport = fatigue || (mentionsLowRecovery(normalized) && !asksTrainingDecision(normalized) && !isWhy(normalized));
  let intent = classifyIntent({
    text: normalized,
    primary,
    entities,
    constraints,
    wordCount,
    historyHasFood: historyMentionsFood(ctx),
    hasQuestionMark: /[?？]/.test(rawText),
    fatigueReport,
    safetySignal,
    signals,
    readiness,
  });
  // Follow-up with no topic of its own inherits the intent family when the new turn is just a short question.
  if (intent === "UNKNOWN" && inheritedFrom && DANTE_FAMILY.has(primary)) {
    if (isWhy(normalized)) intent = "PERFORMANCE_EXPLANATION";
    else if (/(?<![\p{L}])(?:what should i|what do i|should i|nên|phải)(?![\p{L}])/iu.test(normalized)) intent = "TRAINING_PLAN_CHANGE";
  }

  const informationNeed = classifyInformationNeed(intent);

  // ---- cross-domain ----
  const crossCoachRelevance = detectCrossDomainRelevance({
    primary, secondary, text: normalized, constraints, signals, lowRecoveryCue: mentionsLowRecovery(normalized),
  });
  const withNutritionSecondary = DANTE_FAMILY.has(primary) && crossCoachRelevance !== "IRRELEVANT" && !secondary.includes("NUTRITION") ? [...secondary, "NUTRITION" as const] : secondary;
  const withTrainingSecondary = primary === "NUTRITION" && crossCoachRelevance !== "IRRELEVANT" && !withNutritionSecondary.some((d) => DANTE_FAMILY.has(d))
    ? [...withNutritionSecondary, "TRAINING" as const] : withNutritionSecondary;

  // ---- ambiguity ----
  const ambiguityFields = [...refs.unresolvedReferences];
  if (FOOD_INTENTS.has(intent) && !entities.some((e) => e.kind === "FOOD") && !ambiguityFields.includes("food")) ambiguityFields.push("food");
  if ((intent === "TRAINING_RECOMMENDATION" || intent === "TRAINING_SIMULATION") && !exEntity && !ambiguityFields.includes("exercise") && entities.some((e) => e.kind === "LOAD")) ambiguityFields.push("exercise");
  // A quantity with a count-style unit and no verified serving weight is ambiguous, not guessable.
  const countUnit = scan.entities.find((e) => e.unit && !["g", "gram", "grams", "gr", "gam", "kg", "oz", "ounce", "ounces", "lb", "lbs"].includes(e.unit));
  if (countUnit && FOOD_INTENTS.has(intent) && !ambiguityFields.includes("serving_weight")) ambiguityFields.push("serving_weight");

  const deferToGemma = ownerFor(primary, intent, ctx.surface) === "GEMMA" && ctx.surface === "DANTE"
    || (ctx.surface === "DANTE" && (intent === "MEAL_IDEA" || intent === "MEAL_ADJUSTMENT" || intent === "CRAVING" || (asksMeal(normalized) && primary !== "NUTRITION")));

  const owner = ownerFor(primary, intent, ctx.surface);
  const deferToDante = ctx.surface === "GEMMA" && owner === "DANTE" && DANTE_DECISION_INTENTS.has(intent) && !insult && !casual;

  const confidenceClass: ConfidenceClass =
    intent === "UNKNOWN" || intent === "BARE_MENTION" ? "UNRESOLVED"
      : ambiguityFields.length > 0 ? "WEAK_SUPPORT"
        : refs.resolvedFromHistory || primary === "UNKNOWN" ? "MODERATE_SUPPORT"
          : "HIGH_SUPPORT";

  return {
    rawText,
    language,
    normalizedText: normalized,
    primaryDomain: primary,
    secondaryDomains: withTrainingSecondary,
    owner,
    intent,
    entities,
    references: { resolvedFromHistory: refs.resolvedFromHistory, previousEntityRefs: refs.previousEntityRefs, unresolvedReferences: refs.unresolvedReferences, ...(refs.ambiguousFoods ? { ambiguousFoods: refs.ambiguousFoods } : {}) },
    constraints,
    informationNeed,
    crossCoachRelevance,
    deferToGemma,
    deferToDante,
    readiness: DANTE_FAMILY.has(primary) ? readiness : null,
    followUpOf: inheritedFrom && !insult && !casual ? inheritedText : null,
    safetySignal,
    ambiguity: { present: ambiguityFields.length > 0, fields: ambiguityFields },
    confidenceClass,
  };
}

export { isHeavy };
