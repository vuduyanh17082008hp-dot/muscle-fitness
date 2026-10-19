import { buildContextWorkingSet, renderContextWorkingSet, type ContextWorkingSet } from "./context-working-set";
import { controlDirectives, resolveConversationControl } from "./conversation-control";
import { assessOptions, decideCandidates, decideRecommendation, decideSafetyPosture, extractNeedContext, missingContext, personalPickBlocked, type SupplementScreenKind } from "./policy";
import { knowledgeEvidenceLine, resolveKnowledge, settleKnowledgeState } from "./registry";
import { citeSource } from "./sources";
import type {
  AthleteFacts, CandidatePriority, Coach, RankingCriterion, ConversationControl, IntelligenceBrief, KnowledgeClaim, KnowledgeRecord, KnowledgeResolution, NeedDependency, OptionTier, StudyPopulation,
} from "./types";

/**
 * The per-turn brief both coaches consume. It is the ONLY way knowledge, evidence, need policy, safety posture and
 * conversation control reach a coach prompt — as a compact, deterministic block built from structured state.
 * Knowledge lives in the registry; the prompt carries policy and the few claims this turn needs.
 */

export type BriefInput = {
  message: string;
  coach: Coach;
  /** Prior USER messages, oldest → newest. */
  priorUserMessages?: string[];
  /** The coach's previous reply, when the caller has it (used only to restate under a control-only turn). */
  previousReply?: string | null;
  athlete?: AthleteFacts;
  hardSafetyTriggered?: boolean;
  supplementScreen?: SupplementScreenKind;
  /** Whether this coach can run live external retrieval at all. */
  canRetrieve?: boolean;
  /** Pass a control already resolved earlier in the pipeline so both stages agree. */
  control?: ConversationControl;
  /** The turn's context working set, when already built (a per-obligation brief reuses the turn's). Built from priorUserMessages otherwise. */
  context?: ContextWorkingSet;
};

const OWNER: Record<KnowledgeRecord["domain"], Coach | "BOTH"> = { TRAINING: "DANTE", NUTRITION: "GEMMA", SUPPLEMENT: "BOTH" };
const MAX_CLAIMS_NAMED = 4;
const MAX_CLAIMS_OPEN = 2;

const TIER_LABEL: Record<OptionTier, string> = {
  HIGH_UTILITY: "strong support, still optional",
  CONDITIONAL: "conditional on context",
  LOW_VALUE: "low value / usually unnecessary here",
  OUTSIDE_SCOPE: "outside safe coaching scope",
};

const ASK: Record<NeedDependency, string> = {
  PROTEIN_INTAKE: "whether their usual diet already covers their protein",
  FISH_INTAKE: "how often they eat oily fish",
  DIET_QUALITY: "how varied their diet is",
  LAB_STATUS: "a blood test result",
  SWEAT_LOSS: "how long and how sweaty their sessions are",
  SLEEP_AND_STIMULANT_LOAD: "how they sleep and how much caffeine they already have",
};

/** Claims in the order this coach should read them: its own lens first, then by claim type weight. */
function claimsFor(record: KnowledgeRecord, coach: Coach, limit: number): KnowledgeClaim[] {
  const lens = coach === "DANTE" ? "PERFORMANCE" : "DIETARY";
  const weight = (c: KnowledgeClaim) => (c.lens === lens ? 0 : c.lens ? 2 : 1) + (c.claimType === "MECHANISM" ? 1 : 0);
  return [...record.claims].sort((a, b) => weight(a) - weight(b)).slice(0, limit);
}

function renderClaim(c: KnowledgeClaim): string {
  const stance = c.stance === "DOES_NOT_SUPPORT" ? "NOT SUPPORTED" : c.stance === "MIXED" ? "MIXED" : "SUPPORTED";
  const parts = [
    `[${c.claimType} · ${c.evidenceStrength} · ${stance}] ${c.claim}`,
    `outcome: ${c.outcome}; who: ${c.population}; when: ${c.context}`,
    ...(c.conditions.length ? [`only if: ${c.conditions.join("; ")}`] : []),
    ...(c.limitations.length ? [`limits: ${c.limitations.join("; ")}`] : []),
    ...(c.uncertainty ? [`uncertain: ${c.uncertainty}`] : []),
    ...(c.sourceIds.length ? [`src: ${c.sourceIds.map(citeSource).join(" | ")}`] : ["src: none in registry"]),
  ];
  return `  - ${parts.join(" — ")}`;
}

function renderKnowledge(knowledge: KnowledgeResolution, coach: Coach, blocked = false): string[] {
  if (!knowledge.state) return [];
  // An open request whose personal pick belongs to a clinician gets no product claims to list from.
  if (blocked && knowledge.openSupplementRequest) return [];
  // Many candidates share one prompt budget (the route cuts a brief over 2600 tokens in the middle): fewer claims each,
  // never fewer candidates. Each candidate's tier and reasons are in the decision block below.
  const crowded = Boolean(knowledge.candidateRequest) && knowledge.records.length > MAX_CLAIMS_NAMED;
  const limit = crowded ? 1 : knowledge.openSupplementRequest ? MAX_CLAIMS_OPEN : MAX_CLAIMS_NAMED;
  const lines = [`KNOWLEDGE_STATE: ${knowledge.state}`];
  if (knowledge.records.length > 0) {
    lines.push("CANONICAL KNOWLEDGE — the project's verified claims. Each strength belongs to that claim, outcome, population and context only; never restate it more strongly or stretch it to another outcome or group:");
    for (const record of knowledge.records) {
      lines.push(`* ${record.topic}`);
      for (const c of claimsFor(record, coach, limit)) lines.push(renderClaim(c));
    }
  }
  for (const gap of knowledge.gaps) lines.push(`KNOWLEDGE GAP — ${gap.topic}: ${gap.reason}.`);
  // Only entities the question names by alias; a topic reached through a related tag lends no definition.
  const defined = (knowledge.identityMatches ?? []).filter((entity) => entity.identity);
  if (defined.length > 0 && knowledge.entityStatus !== "UNKNOWN_ENTITY" && !knowledge.openSupplementRequest) {
    lines.push("IDENTITY — checked definitions: what each thing IS, not evidence of any benefit. When asked what it is, open with this definition in the user's language; a missing benefit source never makes the identity uncertain, and a plain definition needs no doctor caveat:");
    for (const entity of defined) lines.push(`  - ${entity.identity!.en}`);
  }
  if (knowledge.entityStatus === "RELATED_TOPIC") {
    lines.push("IDENTITY: the topics above are related context, not the thing asked about. Never define the asked term with one of their definitions; if asked what it is, say its definition is not confirmed here.");
  }
  if (knowledge.state === "RETRIEVAL_REQUIRED") {
    lines.push("Retrieved EXTERNAL EVIDENCE for this turn is supporting material, not curated project knowledge: report what it says with its own limits, and prefer the canonical claims above where both exist.");
  }
  const evidenceLine = knowledgeEvidenceLine(knowledge);
  if (evidenceLine) lines.push(evidenceLine);
  if (knowledge.state === "KNOWLEDGE_INSUFFICIENT" && knowledge.gaps.every((gap) => gap.boundary === "PED_DRUG")) {
    // A policy boundary, not an evidence gap: it restricts use guidance, never what the product is or what it risks.
    lines.push("This gap is a policy boundary, not missing evidence: what it is, its broad mechanism, medical use and risks may be explained as general medical knowledge. Do not state a dose or present a benefit for the user.");
  } else if (knowledge.state === "KNOWLEDGE_INSUFFICIENT") {
    const searched = knowledge.coverage === "NO_MATCH_IN_SEARCHED_CORPUS" || knowledge.retrievalStatus === "FAILED";
    lines.push(searched
      ? "Say that it is not established here; do not present recalled facts as established, and do not state a dose or a benefit for it."
      : "Nothing verified is available for the gap above. Say that it is not established here; do not present recalled facts as established, and do not state a dose or a benefit for it.");
  }
  if (knowledge.entityStatus === "UNKNOWN_ENTITY") {
    lines.push(`ENTITY: UNKNOWN. Do not invent what ${knowledge.gaps[0]?.topic ?? "this product"} is. Say it cannot be identified from the registry and ask for the exact name if needed.`);
  }
  if (knowledge.entityStatus === "AMBIGUOUS_ENTITY") lines.push("ENTITY: AMBIGUOUS. Ask which product or brand is meant before comparing or recommending.");
  if (knowledge.entityStatus === "VARIANT_REQUIRED") lines.push("ENTITY: the formulation or variant matters for this question. Ask for it only because the question needs ingredients or a personal ranking. Do not invent a formula.");
  return lines;
}

const REASONING_RULES = [
  "REASONING RULES:",
  "- Mark what kind of statement you are making when it matters: fact, established guidance, reasonable inference, conditional recommendation, uncertain evidence, or unknown. Missing evidence lowers the strength of the claim; it is never filled with a confident guess.",
  "- Match your wording to the tag on the claim: HIGH = well supported; MODERATE = supported; LIMITED or UNCERTAIN = early or limited evidence, 'may'; REASONABLE_INFERENCE = an inference, not directly tested — say so; UNKNOWN or INSUFFICIENT = not established. Never write 'research shows' for an inference.",
  "- Do not add benefits, risks, doses or mechanisms that are not in the claims. If you add ordinary coaching experience, label it as general practice, not as evidence.",
  "- A mechanism is not a benefit. An association is not a cause. Popular is not proven. Possible is not recommended. Optional is not necessary. A request is not a need. A supplement is not a treatment.",
  "- Numbers about this person (targets, intake, recovery, loads) come only from the deterministic state you were given. Never compute or adjust one yourself.",
];

/** The recommendation decision as a rule for the reply. Nothing for a request the decision cleared on coaching practice. */
function renderRecommendation(brief: Omit<IntelligenceBrief, "promptBlock">): string[] {
  const { eligibility, reasons } = brief.recommendation;
  const outcome = brief.knowledge.requestedOutcome;
  if (!outcome || outcome.ask !== "PICK" || brief.knowledge.openSupplementRequest) return [];
  const asked = `"${outcome.phrase}"`;
  switch (eligibility) {
    case "CAN_RANK":
      return reasons.some((reason) => reason.startsWith("supported_for_outcome:"))
        ? [`RECOMMENDATION — the user asks what is best for ${asked}. Pick only on the claims above for that outcome, at their stated strength and for their stated population; a claim about another outcome or group never backs this pick.`]
        : [];
    case "CAN_EDUCATE":
      if (reasons.some((reason) => reason.startsWith("health_outcome_general_food_guidance:"))) {
        return [`RECOMMENDATION — ${asked} is a health outcome. General food guidance is fine (eating patterns and the foods commonly discussed for it, with their limits); no single food is "the best", nothing is a treatment, and personal targets or a diagnosed condition belong with a doctor.`];
      }
      return [`RECOMMENDATION — nothing here establishes a best option for ${asked}. Do not name a winner, a top pick or a ranking. Describe the candidates above with their own limits (or say none is established here), say in general terms what matters more for this outcome, and label anything from ordinary practice as general practice, not evidence.`];
    case "NEEDS_CLARIFICATION":
      return [
        `RECOMMENDATION — ${asked} is a health-sensitive outcome and what the user wants is not yet clear (general prevention, a diagnosed condition, a test result or a symptom). Do not rank or recommend a product or exercise as the answer, diagnose, or present anything as a treatment.`,
        "SAFE CONTINUATION — the boundary limits the pick, not the help. In this order: say in one line what you can't pick from this alone and why; then give usable bounded help (for a symptom: train around it, not through it — pain-free range, lighter load, swap the movements that provoke it; what matters for the decision); name the signs that mean it should be assessed soon; then ask only the one question whose answer would change the advice (for a symptom: where exactly, since when, which movements provoke it). No list of specific exercises or products. A referral alone is not an answer.",
      ];
    default:
      return [];
  }
}

const CRITERION_LABEL: Record<RankingCriterion, string> = {
  PERSONAL: "what is most worth it for this user",
  PURCHASE: "what is worth buying first (need and value, not evidence strength alone)",
  LEAST_NECESSARY: "what is least necessary for this user (skip first)",
  HYPERTROPHY: "muscle growth",
  PERFORMANCE: "training performance",
  GENERAL_HEALTH: "general health",
  OUTCOME: "the outcome named",
  UNSPECIFIED: "not stated",
};

const PRIORITY_LABEL: Record<CandidatePriority["tier"], string> = {
  HIGH_UTILITY: "high priority (strong support, still optional)",
  CONDITIONAL: "context-dependent",
  LOW_VALUE: "low priority / usually skip",
  OUTSIDE_SCOPE: "outside safe coaching scope: acknowledge it by name, give no ranking detail, dose, sourcing or use guidance",
  NOT_ASSESSED: "not in the project's knowledge: place it on general coaching practice for the criterion, labelled as practice",
};

/** A rank / buy / skip decision: every candidate, its priority class and what would move it. Conditional, never fake 1..N. */
function renderCandidates(brief: Omit<IntelligenceBrief, "promptBlock">): string[] {
  const decision = brief.candidates;
  if (!decision) return [];
  const { request, priorities } = decision;
  const criterion = request.criterion === "OUTCOME" ? `"${request.criterionPhrase}"` : CRITERION_LABEL[request.criterion];
  const lines = [`CANDIDATE DECISION (${request.task}) — rank by: ${criterion}. Weigh necessity (what food and current intake already cover), redundancy, evidence, safety and value; evidence strength alone is not the order.`];
  if (request.candidates.length > 0) {
    lines.push(`The user named ${request.candidates.length} options: ${request.candidates.map((candidate) => candidate.label).join(", ")}. Account for EVERY one by name with its reason; none may be dropped, merged or swapped for a different product.`);
  }
  lines.push("PRIORITY FOR THIS USER, most worth it first (derived from the claims below and what is known; give each reason in plain words):");
  for (const priority of priorities) {
    const moves = [priority.movesUp.length ? `up if ${priority.movesUp.join(" or ")}` : "", priority.movesDown.length ? `down if ${priority.movesDown.join(" or ")}` : ""].filter(Boolean).join("; ");
    lines.push(`  - ${priority.candidate}: ${PRIORITY_LABEL[priority.tier]} (${priority.reasons.join(", ")})${moves ? ` — ${moves}` : ""}`);
  }
  if (priorities.some((priority) => priority.reasons.some((reason) => reason.startsWith("subset_of:")))) {
    lines.push("A product whose contents are a subset of another listed one (subset_of) never ranks above it.");
  }
  lines.push(decision.exactOrderJustified
    ? "ORDER: what is known justifies this order; a numbered list is fine."
    : `ORDER: give priority groups, not a numbered 1..${priorities.length} ranking: ${decision.dependsOnUnknown ? "the order depends on facts not known yet" : "options tie within a group"}.${request.exactOrderRequested ? " The user asked for an exact order: say in one line that an exact order would be misleading here and why, then give the groups." : ""}`);
  if (request.personal && decision.dependsOnUnknown) {
    lines.push("PERSONALISATION: only what is listed as known about the user is known. Say the priority is based on what you know so far, state it conditionally (\"if your protein is already covered, …\"), and name what would move items. Do not present it as tailored beyond that.");
  }
  if (request.criterion === "UNSPECIFIED") {
    lines.push("CRITERION: nothing says what to rank by. Rank by the most likely meaning, say which in one line, and ask the one question that would change the order.");
  }
  if (request.task === "BUY" || request.task === "SKIP" || request.antiWaste || request.criterion === "PURCHASE" || request.criterion === "LEAST_NECESSARY") {
    lines.push("PURCHASE DECISION, not education: the user is deciding what to spend money on and wants to avoid waste. Optimise for not buying what they don't need: say plainly \"you probably don't need X\" where the groups support it, keep each item to its reason, and ask only the one fact that would change a purchase. Brand choice is not the question.");
  }
  if (priorities.some((priority) => priority.tier !== "NOT_ASSESSED")) {
    lines.push("FOUNDATION: food covers the foundation; a supplement earns a place by filling a specific gap or by a well-supported performance use. Never call a product fake food, never treat natural as better by default, and never claim food replaces every supplement use.");
  }
  return lines;
}

function renderPolicy(brief: Omit<IntelligenceBrief, "promptBlock">): string[] {
  const { knowledge, need, options, posture, coach } = brief;
  const lines: string[] = renderRecommendation(brief);
  const supplementTurn = options.length > 0 || knowledge.gaps.length > 0 || knowledge.openSupplementRequest || knowledge.requestedOutcome?.targetClass === "SUPPLEMENT";
  if (supplementTurn) {
    lines.push("SUPPLEMENT POLICY — decide NEED before USE: goal → diet adequacy → protein and energy → training context → age → what they already take → medical or medication context → evidence → expected benefit → necessity.");
    const known = [
      need.ageYears !== null ? `age ${need.ageYears}` : null,
      need.goal ? `goal ${need.goal}` : null,
      need.proteinAdequate !== "UNKNOWN" ? `protein adequate: ${need.proteinAdequate.toLowerCase()}` : null,
      need.lowFishIntake !== "UNKNOWN" ? `low fish intake: ${need.lowFishIntake.toLowerCase()}` : null,
      need.poorDiet === "YES" ? "diet: poor or restricted (nutrient gap possible)" : need.poorDiet === "NO" ? "diet: varied" : null,
      need.poorSleep !== "UNKNOWN" ? `poor sleep: ${need.poorSleep.toLowerCase()}` : null,
      need.highStimulantUse === "YES" ? "stimulant use: high" : null,
      need.medication ? "takes medication" : null,
      need.medicalCondition ? "medical condition mentioned" : null,
      need.pregnancy ? "pregnant, trying to conceive or breastfeeding" : null,
    ].filter(Boolean);
    lines.push(`KNOWN ABOUT THE USER: ${known.length ? known.join("; ") : "nothing relevant yet"}.`);
    if (knowledge.openSupplementRequest && personalPickBlocked(posture)) {
      const clinician = posture.contexts.includes("PREGNANCY") ? "their midwife or doctor" : posture.contexts.includes("MEDICATION_CONTEXT") ? "their doctor or pharmacist" : "their doctor";
      lines.push(`OPEN REQUEST UNDER A SAFETY BOUNDARY — the user's situation (SAFETY POSTURE above) puts the personal supplement pick with ${clinician}. Do NOT list, rank or recommend supplements, not even with a 'check with your doctor' caveat: a list is a recommendation. Instead, in this order: one line on why the pick belongs to ${clinician} for this situation; the useful, safe help you can give now (food, training, sleep — within the rules above); then offer to explain any specific product they want to ask about. No dose, timing or stack.`);
      return lines;
    }
    if (options.length > 0 && !brief.candidates) {
      lines.push("WHERE EACH OPTION SITS FOR THIS USER (derived from the claims above and what is known; explain the reason, do not just list):");
      for (const tier of ["HIGH_UTILITY", "CONDITIONAL", "LOW_VALUE", "OUTSIDE_SCOPE"] as OptionTier[]) {
        const inTier = options.filter((option) => option.tier === tier);
        if (inTier.length) lines.push(`  ${TIER_LABEL[tier]}: ${inTier.map((option) => `${option.topic} (${option.reasons.join(", ")})`).join("; ")}`);
      }
      lines.push("Nothing in the low-value group may be offered as a default pick. Nothing is mandatory: say 'optional' where it is. These group names are for your reasoning; use plain words with the user.");
    }
    if (brief.missingContext.length > 0) {
      // CHANGES_PRIORITY: conditional baseline first, then at most ONE question — the most decision-changing unknown.
      // Any other unknown is stated as a condition ("if …"), never asked as a questionnaire.
      const [ask, ...conditions] = brief.missingContext;
      lines.push(`STILL UNKNOWN AND WOULD CHANGE THE ANSWER: ${ASK[ask]}. Give the conditional answer first, then ask this as your ONE short question.${conditions.length ? ` State the rest as conditions, not questions: ${conditions.map((dependency) => ASK[dependency]).join("; ")}.` : ""}`);
    }
    lines.push(coach === "DANTE"
      ? "YOUR LENS (Dante): expected training and performance value. Whether the diet already covers a nutrient is Gemma's call — name the dependency, do not build a meal plan."
      : "YOUR LENS (Gemma): dietary adequacy and food-first alternatives. Whether to train, how hard, and performance programming are Dante's.");
  }
  if (brief.otherCoachOwns) {
    lines.push(coach === "DANTE"
      ? "AUTHORITY: this topic is nutrition, which Gemma owns — refer to her by name (Gemma, the nutrition coach), never as 'a nutrition coach' or 'a professional'. Answer the concept from the canonical claims; personal targets, meal building and food logging go to Gemma, and any personal number comes only from the canonical nutrition targets you were given."
      : "AUTHORITY: this topic is training or recovery, which Dante owns. You may explain the nutrition side; the training decision is Dante's.");
  }
  return lines;
}

/** Safety rules lead the brief: the route keeps a long brief's head, so they can never be the part condensed away. */
function renderPosture(brief: Omit<IntelligenceBrief, "promptBlock">): string[] {
  const { posture } = brief;
  if (posture.directives.length === 0) return [];
  return [
    `SAFETY POSTURE: ${posture.decision}${posture.contexts.length ? ` [${posture.contexts.join(", ")}]` : ""}${posture.noDosing ? " — NO DOSE, TIMING, STACK OR CYCLE" : ""}`,
    ...posture.directives.map((directive) => `- ${directive}`),
    "These are rules for what the answer contains. A closing 'ask your doctor' line does not replace following them, and is not needed when the rules already cover the case.",
  ];
}

function compose(brief: Omit<IntelligenceBrief, "promptBlock">, context: { previousUserQuestion: string | null; previousReply: string | null }): string {
  const control = controlDirectives(brief.control, context);
  // The candidate decision leads: the route keeps a long brief's head, so it never falls out of a condensed middle.
  const knowledge = [...renderCandidates(brief), ...renderKnowledge(brief.knowledge, brief.coach, personalPickBlocked(brief.posture))];
  const policy = renderPolicy(brief);
  const contextLines = renderContextWorkingSet(brief.context);
  const posture = renderPosture(brief);
  if (control.length + knowledge.length + policy.length + contextLines.length + posture.length === 0) return "";
  return [
    "PERFORMANCE INTELLIGENCE BRIEF (deterministic; never quote or mention this block)",
    ...(control.length ? ["CONVERSATION CONTROL — outranks persona, topic and earlier turns; only safety outranks it:", ...control.map((line) => `- ${line}`)] : []),
    ...contextLines,
    ...posture,
    ...knowledge,
    ...(knowledge.length || policy.length ? REASONING_RULES : []),
    ...policy,
  ].join("\n");
}

/**
 * One prompt block for a multi-obligation call: the turn's conversation control once, then each obligation's own
 * knowledge and policy under its label. A sibling's knowledge gap is never stated as if it governed this request.
 */
export function scopedPromptBlock(control: ConversationControl, scoped: Array<{ label: string; brief: IntelligenceBrief }>): string {
  const controlLines = controlDirectives(control, {});
  const sections = scoped
    .map(({ label, brief }) => ({ label, lines: [...renderPosture(brief), ...renderCandidates(brief), ...renderKnowledge(brief.knowledge, brief.coach, personalPickBlocked(brief.posture)), ...renderPolicy(brief)] }))
    .filter((section) => section.lines.length > 0);
  // The context working set is the turn's, not a request's: rendered once, above every request.
  const contextLines = renderContextWorkingSet(scoped[0]?.brief.context);
  if (controlLines.length + sections.length + contextLines.length === 0) return "";
  return [
    "PERFORMANCE INTELLIGENCE BRIEF (deterministic; never quote or mention this block)",
    ...(controlLines.length ? ["CONVERSATION CONTROL — outranks persona, topic and earlier turns; only safety outranks it:", ...controlLines.map((line) => `- ${line}`)] : []),
    ...contextLines,
    ...(sections.length ? REASONING_RULES : []),
    ...sections.flatMap((section) => [`FOR ${section.label} ONLY (does not apply to any other request):`, ...section.lines]),
  ].join("\n");
}

export function buildIntelligenceBrief(input: BriefInput): IntelligenceBrief {
  const priorUserMessages = input.priorUserMessages ?? [];
  const control = input.control ?? resolveConversationControl({ message: input.message, priorUserMessages, safetyActive: input.hardSafetyTriggered });
  const knowledge = resolveKnowledge({ message: input.message, priorUserMessages, canRetrieve: input.canRetrieve ?? false });
  const context = input.context ?? buildContextWorkingSet({ priorUserMessages, message: input.message });
  const need = extractNeedContext({ message: input.message, priorUserMessages, athlete: input.athlete, context });
  const options = assessOptions(knowledge.records, need);
  const candidates = decideCandidates(knowledge, need);
  const posture = decideSafetyPosture({ knowledge, need, hardSafetyTriggered: input.hardSafetyTriggered, supplementScreen: input.supplementScreen, message: input.message, context });
  const owners = new Set(knowledge.records.map((record) => OWNER[record.domain]));
  const base = {
    coach: input.coach,
    control,
    knowledge,
    need,
    options,
    missingContext: knowledge.openSupplementRequest || options.some((option) => option.tier === "CONDITIONAL") || candidates?.dependsOnUnknown
      ? missingContext(knowledge.records, need, knowledge.gaps)
      : [],
    posture,
    otherCoachOwns: owners.size > 0 && !owners.has(input.coach) && !owners.has("BOTH"),
    recommendation: decideRecommendation({ knowledge, posture, options }),
    candidates,
    context,
    message: input.message,
  };
  return { ...base, promptBlock: compose(base, { previousUserQuestion: priorUserMessages.at(-1) ?? null, previousReply: input.previousReply ?? null }) };
}

/** Re-render after retrieval ran, so an empty retrieval reaches the prompt as uncertainty and a failed one as FAILED. */
export function settleBrief(
  brief: IntelligenceBrief,
  input: BriefInput,
  retrievalReturnedEvidence: boolean,
  retrievalRun?: "EMPTY" | "FAILED" | "IRRELEVANT",
  populations: readonly StudyPopulation[] = [],
): IntelligenceBrief {
  const knowledge = settleKnowledgeState(brief.knowledge, retrievalReturnedEvidence, retrievalRun, populations);
  if (knowledge === brief.knowledge) return brief;
  const posture = decideSafetyPosture({ knowledge, need: brief.need, hardSafetyTriggered: input.hardSafetyTriggered, supplementScreen: input.supplementScreen, message: input.message, context: brief.context });
  const settled = { ...brief, knowledge, posture, recommendation: decideRecommendation({ knowledge, posture, options: brief.options }) };
  return { ...settled, promptBlock: compose(settled, { previousUserQuestion: input.priorUserMessages?.at(-1) ?? null, previousReply: input.previousReply ?? null }) };
}
