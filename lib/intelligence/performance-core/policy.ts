import { activeFacts, clinicallyBounded, hasActive, type ContextFact, type ContextWorkingSet } from "./context-working-set";
import { fold } from "./text";
import type {
  AgeBand, AthleteFacts, CandidateDecision, CandidatePriority, CandidateRequest, KnowledgeGap, EvidenceStrength, KnowledgeRecord, KnowledgeResolution, NeedContext, NeedDependency, OptimizationFacet, OptionTier, RecommendationDecision,
  RecommendationEligibility, RestrictedSubstanceUse, SafetyContextTag, SafetyDecision, SafetyPosture, SubstanceIntent, SubstanceIntentClass, SupplementOption, Tri,
} from "./types";

/**
 * Recommendation / need policy and safety posture (ICH-1). Deterministic and answer-free: it derives WHAT may be
 * recommended and HOW STRONGLY from the knowledge records and what is known about the person. It writes no sentences
 * for the user and it stops nothing — hard stops remain with lib/dante-core/safety-layer.ts and the nutrition coach's
 * screenSafety, whose results are passed IN here.
 *
 *   USER REQUEST != NEED   ·   "Do I need this?" is answered before "How do I use this?"
 */

/* ---------- need context ---------- */

const AGE = /(?<![a-z0-9])(?:i'?m|i am|im|age|aged|tao|toi|minh|em)?\s*(\d{1,2})\s*(?:-|\s)?(?:years?[- ]old|yrs?[- ]old|year old|y\/o|yo|tuoi)(?![a-z])|(?<![a-z0-9])(?:i'?m|i am|im)\s+(\d{1,2})(?![0-9a-z%])/;

const CUES: Record<string, { yes?: RegExp; no?: RegExp }> = {
  proteinAdequate: {
    yes: /(?:eat|get|getting|hit|hitting|have|having)[^.?!]{0,24}(?:enough|plenty of|adequate|a lot of|lots of)\s+(?:complete\s+)?protein|hit(?:ting)? my protein|protein (?:is|intake is|target is)\s+(?:fine|good|covered|on point|sorted|met)|du (?:protein|dam)|an du (?:protein|dam)/,
    no: /(?:don'?t|do not|can'?t|cannot|struggle to|barely|hard to|never)[^.?!]{0,24}(?:eat|get|hit|reach)[^.?!]{0,18}protein|(?:low|not enough|too little) protein|thieu (?:protein|dam)|khong du (?:protein|dam)/,
  },
  lowFishIntake: {
    yes: /(?:barely|rarely|never|don'?t|do not|hardly|almost never)\s+(?:ever\s+)?(?:eat|have|like)\s+(?:any\s+)?(?:fish|seafood)|no (?:fish|seafood)|(?:vegan|vegetarian)|khong an ca|it an ca|ghet ca/,
    no: /eat (?:a lot of|plenty of|lots of)?\s*(?:fish|salmon|seafood|sardines|mackerel|tuna)\s+(?:often|regularly|every|most|twice|several|a few|\d)|(?:fish|salmon|sardines|mackerel) (?:\d|two|three|four|five|several) times|an ca thuong xuyen/,
  },
  // YES = the diet likely leaves a micronutrient gap: poor, or restricted (vegan, cut-out food groups). NO = varied.
  poorDiet: {
    yes: /(?:diet|eating|nutrition) (?:is|has been|'s)?\s*(?:really\s+)?(?:bad|poor|terrible|trash|awful|a mess|restricted|limited)|eat like (?:crap|shit|garbage|trash)|mostly junk|junk food|(?:barely|rarely|never|don'?t) eat (?:any\s+)?(?:veg|vegetables|veggies|fruit|meat|dairy)|(?<![a-z])(?:vegan|vegetarian|restricted diet|picky eater|elimination diet)(?![a-z])|an uong (?:te|thieu chat|linh tinh|that thuong)|an chay/,
    no: /(?:diet|eating) (?:is|'s)?\s*(?:already\s+|pretty\s+|quite\s+|very\s+|really\s+)?(?:varied|balanced|diverse|good|healthy|solid|decent|clean)|(?:eat|have) (?:a\s+)?(?:pretty\s+|very\s+|really\s+)?(?:varied|balanced|diverse|healthy) diet|eat (?:plenty of|lots of|a lot of) (?:fruit|veg)|an uong (?:da dang|can bang|lanh manh)/,
  },
  poorSleep: {
    yes: /(?:poor|bad|terrible|little|not enough|lack of|no)\s+sleep|sleep (?:is|has been|'s)?\s*(?:really\s+)?(?:bad|poor|terrible|trash|awful)|can'?t sleep|insomnia|slee?pt? (?:badly|poorly|like crap)|(?:only\s+)?[2-5](?:\.\d)?\s*(?:h|hrs?|hours?)\s+(?:of\s+)?sleep|sle(?:ep|pt)(?:ing)?\s+(?:only\s+|about\s+|around\s+|like\s+)?[2-5](?:\.\d)?\s*(?:h|hrs?|hours?)|ngu (?:it|te|kem|khong du)|mat ngu|thieu ngu/,
  },
  highStimulantUse: {
    yes: /(?:[3-9]|\d{2})\s*(?:cups?|cans?|energy drinks?|coffees?|monsters?|red ?bulls?|scoops?)|(?:a lot of|lots of|tons of|too much|high|heavy|so much)\s+(?:caffeine|coffee|energy drinks?|stims?|pre[- ]?workout)|(?:caffeine|coffee|energy drinks?) (?:all day|every few hours)|nhieu (?:ca phe|caffeine|nuoc tang luc)/,
  },
  heavySweatLoss: {
    yes: /sweat(?:ing)? (?:a lot|heavily|buckets|like crazy)|heavy sweater|(?:hot|humid) (?:weather|climate|gym|days?)|in the heat|(?:long|2|two|3|three)[- ]?(?:hour|hr|h)\s+(?:sessions?|workouts?|runs?|training)|marathon|do mo hoi nhieu|troi nong/,
  },
};

const MEDICATION = /(?<![a-z])(?:medication|medications|medicine|prescription|prescribed|meds|antidepress\w*|ssri|blood thinners?|warfarin|metformin|statins?|insulin|accutane|isotretinoin|adderall|ritalin|levothyroxine|lithium|uong thuoc|dang dung thuoc|thuoc (?:ke don|huyet ap|tieu duong|tay|dieu tri))(?![a-z])/;
const MEDICAL = /(?<![a-z])(?:diabet\w*|kidney (?:disease|problems?|issues?|stones?)|renal|liver (?:disease|problems?|issues?|enzymes?)|heart (?:condition|disease|problems?)|hypertension|high blood pressure|thyroid|epilep\w*|asthma|benh (?:than|gan|tim|tieu duong)|huyet ap cao|tieu duong)(?![a-z])/;
const PREGNANCY = /(?<![a-z])(?:pregnan\w*|breast-?feeding|mang thai|co bau|cho con bu)(?![a-z])/;

function triOf(text: string, cue: { yes?: RegExp; no?: RegExp }): Tri {
  if (cue.no?.test(text)) return "NO";
  return cue.yes?.test(text) ? "YES" : "UNKNOWN";
}

const ageBand = (age: number | null): AgeBand => (age === null ? "UNKNOWN" : age < 18 ? "MINOR" : age <= 20 ? "YOUNG_ADULT" : "ADULT");

/**
 * What the person has told us (this message and the bounded history) plus what canonical state already knows.
 * Canonical facts win over what the user says about the same thing: verified state outranks recollection.
 */
export function extractNeedContext(input: { message: string; priorUserMessages?: string[]; athlete?: AthleteFacts; context?: ContextWorkingSet }): NeedContext {
  const messages = [...(input.priorUserMessages ?? []).slice(-12), input.message].map(fold);
  const text = messages.join(" . ");
  // A correction outranks what it corrects: the newest message that settles a fact decides it.
  const tri = (cue: { yes?: RegExp; no?: RegExp }): Tri => messages.map((message) => triOf(message, cue)).findLast((value) => value !== "UNKNOWN") ?? "UNKNOWN";
  const athlete = input.athlete ?? {};
  const ageMatch = text.match(AGE);
  const statedAge = ageMatch ? Number(ageMatch[1] ?? ageMatch[2]) : null;
  const age = athlete.ageYears ?? (statedAge !== null && statedAge >= 10 && statedAge <= 90 ? statedAge : null);
  const statedSleep = tri(CUES.poorSleep);
  const sleep: Tri = typeof athlete.avgSleepHours === "number" ? (athlete.avgSleepHours < 6.5 ? "YES" : "NO") : statedSleep;
  return {
    ageYears: age,
    ageBand: ageBand(age),
    goal: athlete.goal ?? null,
    proteinAdequate: tri(CUES.proteinAdequate),
    // An allergy settles intake: someone allergic to fish eats none.
    lowFishIntake: input.context && activeFacts(input.context).some((fact) => fact.key === "ALLERGY:fish" || fact.key === "ALLERGY:shellfish") ? "YES" : tri(CUES.lowFishIntake),
    poorDiet: tri(CUES.poorDiet),
    // Safety facts come from the working set when there is one: an ended or corrected fact no longer counts, an old one still does.
    medication: input.context ? MEDICATION.test(fold(input.message)) || hasActive(input.context, "MEDICATION") : MEDICATION.test(text),
    medicalCondition: input.context ? MEDICAL.test(fold(input.message)) || hasActive(input.context, "CONDITION") : MEDICAL.test(text),
    pregnancy: input.context ? hasActive(input.context, "PREGNANCY") : PREGNANCY.test(text),
    poorSleep: sleep,
    highStimulantUse: tri(CUES.highStimulantUse),
    heavySweatLoss: tri(CUES.heavySweatLoss),
  };
}

/* ---------- options ---------- */

const RANK: Record<EvidenceStrength, number> = { HIGH: 4, MODERATE: 3, LIMITED: 2, THEORETICAL: 1, INSUFFICIENT: 0 };

/**
 * Strongest evidence that the supplement does something useful — never a universal grade. Only claims that SUPPORT an
 * outcome and are guidance (established or conditional) count: a mechanism, an inference or "may" never does.
 */
export function strongestSupport(record: KnowledgeRecord): EvidenceStrength | null {
  const supporting = record.claims.filter((c) => c.stance === "SUPPORTS" && (c.claimType === "ESTABLISHED_GUIDANCE" || c.claimType === "CONDITIONAL") && RANK[c.evidenceStrength] >= RANK.MODERATE);
  if (supporting.length === 0) return null;
  return supporting.reduce((best, c) => (RANK[c.evidenceStrength] > RANK[best] ? c.evidenceStrength : best), "MODERATE" as EvidenceStrength);
}

/** YES = the dependency says the supplement is worth considering; NO = already covered; UNKNOWN = ask. */
function dependencyStatus(dependency: NeedDependency, need: NeedContext): Tri {
  switch (dependency) {
    case "PROTEIN_INTAKE": return need.proteinAdequate === "YES" ? "NO" : need.proteinAdequate === "NO" ? "YES" : "UNKNOWN";
    case "FISH_INTAKE": return need.lowFishIntake;
    case "DIET_QUALITY": return need.poorDiet;
    case "SWEAT_LOSS": return need.heavySweatLoss;
    case "SLEEP_AND_STIMULANT_LOAD": return need.poorSleep === "YES" || need.highStimulantUse === "YES" ? "NO" : need.poorSleep === "NO" ? "YES" : "UNKNOWN";
    case "LAB_STATUS": return "UNKNOWN";
  }
}

/** One supplement → where it sits for THIS person. Derived from evidence and dependencies; nothing here is a stored answer. */
export function assessOption(record: KnowledgeRecord, need: NeedContext): SupplementOption | null {
  const profile = record.supplement;
  if (!profile) return null;
  const option = (tier: OptionTier, reasons: string[]): SupplementOption => ({ recordId: record.id, topic: record.topic, tier, reasons });

  if (profile.redundantWith) {
    return option("LOW_VALUE", ["redundant_with_adequate_complete_protein", ...(need.proteinAdequate === "NO" ? ["fix_total_protein_first"] : [])]);
  }
  const statuses = profile.dependsOn.map((dependency) => ({ dependency, status: dependencyStatus(dependency, need) }));
  const covered = statuses.find((entry) => entry.status === "NO" && entry.dependency !== "SLEEP_AND_STIMULANT_LOAD");
  if (covered) return option("LOW_VALUE", [`not_needed:${covered.dependency}`]);
  if (profile.dependsOn.includes("LAB_STATUS")) return option("CONDITIONAL", ["lab_dependent_do_not_assume_deficiency"]);

  const support = strongestSupport(record);
  if (!support) return option("LOW_VALUE", ["no_established_support_in_registry"]);

  const minorHold = need.ageBand === "MINOR" && (profile.category === "ERGOGENIC" || profile.category === "HERBAL");
  if (statuses.length > 0) {
    const stimulantCaution = statuses.some((entry) => entry.dependency === "SLEEP_AND_STIMULANT_LOAD" && entry.status === "NO");
    return option("CONDITIONAL", [
      ...statuses.map((entry) => `depends_on:${entry.dependency}:${entry.status === "YES" ? "applies" : entry.status === "NO" ? "caution" : "unknown"}`),
      ...(stimulantCaution ? ["poor_sleep_or_high_stimulant_load"] : []),
      ...(minorHold ? ["minor_food_first"] : []),
    ]);
  }
  if (minorHold) return option("CONDITIONAL", ["minor_food_first"]);
  return support === "HIGH" ? option("HIGH_UTILITY", ["strong_support_but_optional"]) : option("CONDITIONAL", ["outcome_specific_moderate_support"]);
}

export function assessOptions(records: readonly KnowledgeRecord[], need: NeedContext): SupplementOption[] {
  return records.map((record) => assessOption(record, need)).filter((option): option is SupplementOption => option !== null);
}

const ASK_ORDER: NeedDependency[] = ["PROTEIN_INTAKE", "SLEEP_AND_STIMULANT_LOAD", "FISH_INTAKE", "DIET_QUALITY", "SWEAT_LOSS"];

/** Only the unknowns that would actually move an option, most material first, at most two. Never an interrogation. */
export function missingContext(records: readonly KnowledgeRecord[], need: NeedContext, gaps: readonly KnowledgeGap[] = []): NeedDependency[] {
  const unknown = new Set<NeedDependency>();
  const dependencies = [
    ...records.flatMap((record) => (record.supplement && !record.supplement.redundantWith ? record.supplement.dependsOn : [])),
    ...gaps.flatMap((gap) => gap.dependsOn ?? []),
  ];
  for (const dependency of dependencies) {
    if (dependency !== "LAB_STATUS" && dependencyStatus(dependency, need) === "UNKNOWN") unknown.add(dependency);
  }
  return ASK_ORDER.filter((dependency) => unknown.has(dependency)).slice(0, 2);
}

/* ---------- candidate decisions ---------- */

// What would move a candidate, per dependency. Phrases for the prompt and for structured rendering, never claims.
const MOVES: Record<NeedDependency, { up: string; down: string }> = {
  PROTEIN_INTAKE: { up: "protein is below target and hard to reach from food", down: "protein target already met from food" },
  FISH_INTAKE: { up: "oily fish is rarely eaten", down: "oily fish about twice a week or more" },
  DIET_QUALITY: { up: "the diet is restricted or low in variety", down: "the diet is varied" },
  LAB_STATUS: { up: "a blood test shows low status", down: "a blood test is normal" },
  SWEAT_LOSS: { up: "sessions are long, hot or very sweaty", down: "sessions are short and cool" },
  SLEEP_AND_STIMULANT_LOAD: { up: "sleep is good and caffeine is low", down: "sleep is poor or caffeine is already high" },
};
const TIER_ORDER: Array<CandidatePriority["tier"]> = ["HIGH_UTILITY", "CONDITIONAL", "NOT_ASSESSED", "LOW_VALUE", "OUTSIDE_SCOPE"];
const PERFORMANCE_ORDER = ["ERGOGENIC", "PROTEIN_SOURCE", "AMINO_ACID", "ESSENTIAL_NUTRIENT"];
const HEALTH_ORDER = ["ESSENTIAL_NUTRIENT", "PROTEIN_SOURCE"];

function supplementPriority(record: KnowledgeRecord, need: NeedContext, criterion: CandidateRequest["criterion"]): Omit<CandidatePriority, "candidate" | "entity"> {
  const profile = record.supplement!;
  const option = assessOption(record, need)!;
  const reasons = [...option.reasons];
  let tier: CandidatePriority["tier"] = option.tier;
  if (criterion === "GENERAL_HEALTH" && (profile.category === "ERGOGENIC" || profile.category === "AMINO_ACID") && tier !== "LOW_VALUE") {
    tier = "LOW_VALUE";
    reasons.push("criterion:general_health:performance_aid_not_a_health_need");
  }
  if ((criterion === "HYPERTROPHY" || criterion === "PERFORMANCE") && profile.category === "ESSENTIAL_NUTRIENT") {
    if (tier === "HIGH_UTILITY") tier = "CONDITIONAL";
    reasons.push(`criterion:${criterion.toLowerCase()}:not_a_direct_lever_unless_intake_is_low`);
  }
  const movesUp = profile.redundantWith ? ["total protein can't be met from food or a protein powder"] : profile.dependsOn.map((dependency) => MOVES[dependency].up);
  const movesDown = profile.redundantWith ? [] : profile.dependsOn.map((dependency) => MOVES[dependency].down);
  if (profile.dependsOn.length === 0 && profile.category === "ERGOGENIC") movesDown.push("the goal is not strength, power or muscle gain");
  return { tier, reasons, movesUp, movesDown };
}

function gapPriority(gap: KnowledgeGap, need: NeedContext, scopedAway: boolean): Omit<CandidatePriority, "candidate" | "entity"> {
  const evidence = scopedAway ? "no_canonical_claim_for_this_outcome" : "no_verified_benefit_in_registry";
  const dependencies = gap.dependsOn ?? [];
  if (dependencies.length === 0) return { tier: "LOW_VALUE", reasons: [evidence], movesUp: [], movesDown: [] };
  const statuses = dependencies.map((dependency) => dependencyStatus(dependency, need));
  const moves = { movesUp: dependencies.map((dependency) => MOVES[dependency].up), movesDown: dependencies.map((dependency) => MOVES[dependency].down) };
  // Adequacy-sensitive: no universal benefit is not no value when intake is short, and unknown intake is not a deficiency.
  if (statuses.includes("NO")) return { tier: "LOW_VALUE", reasons: [`intake_likely_adequate:${dependencies.join("+")}`, evidence], ...moves };
  if (statuses.includes("YES")) return { tier: "CONDITIONAL", reasons: [`possible_intake_gap:${dependencies.join("+")}`, evidence, "do_not_assume_deficiency"], ...moves };
  return { tier: "CONDITIONAL", reasons: [...dependencies.map((dependency) => `depends_on:${dependency}:unknown`), evidence, "do_not_assume_deficiency"], ...moves };
}

/**
 * Every requested candidate → a priority class for THIS person under THIS criterion. Conditional priority, not a fake
 * absolute ranking: the order is exact only when nothing it depends on is unknown and no two candidates tie.
 * Evidence is one input; necessity (what food already covers), redundancy and the criterion are the others.
 */
export function decideCandidates(knowledge: KnowledgeResolution, need: NeedContext): CandidateDecision | null {
  const request = knowledge.candidateRequest;
  if (!request) return null;
  // A purchase decision with nothing named weighs the open baseline set.
  const candidates = request.candidates.length > 0
    ? request.candidates
    : knowledge.records.filter((record) => record.supplement).map((record) => ({ label: record.topic, entity: record.topic, terms: [] as string[] }));
  const boundaryOf = (terms: string[]) => knowledge.gaps.find((gap) => gap.boundary && terms.some((term) => gap.retrievalTags.includes(fold(term))));
  const category = new Map<string, string>();
  const subsetOf = new Map<string, string>();
  const priorities = candidates.map((candidate): CandidatePriority => {
    const base = { candidate: candidate.label, entity: candidate.entity ?? null };
    const boundary = boundaryOf([candidate.label, ...candidate.terms]);
    if (boundary?.boundary === "PED_DRUG") return { ...base, tier: "OUTSIDE_SCOPE", reasons: ["hormonal_or_drug_product_outside_coaching"], movesUp: [], movesDown: [] };
    if (boundary) return { ...base, tier: "LOW_VALUE", reasons: ["no_verified_evidence_any_otc_booster_works"], movesUp: [], movesDown: [] };
    const record = knowledge.records.find((entry) => entry.topic === candidate.entity);
    if (record?.supplement) {
      category.set(candidate.label, record.supplement.category);
      const superset = record.supplement.subsetOf ? candidates.find((entry) => entry.entity && getTopic(knowledge, record.supplement!.subsetOf!) === entry.entity) : undefined;
      const priority = supplementPriority(record, need, request.criterion);
      if (superset) {
        subsetOf.set(candidate.label, superset.label);
        priority.reasons.push(`subset_of:${superset.entity}:narrower_amino_acid_coverage`);
      }
      return { ...base, ...priority };
    }
    // An outcome-scoped candidate with no claim for that outcome becomes the gap "<topic> for <outcome>".
    const gap = knowledge.gaps.find((entry) => !entry.boundary && (entry.topic === candidate.entity || entry.topic.startsWith(`${candidate.entity} for `)));
    if (gap) {
      category.set(candidate.label, "ESSENTIAL_NUTRIENT");
      return { ...base, ...gapPriority(gap, need, gap.topic !== candidate.entity) };
    }
    return { ...base, tier: "NOT_ASSESSED", reasons: [candidate.entity ? `related_entity_not_its_parent_product:${candidate.entity}` : "outside_registry:rank_on_coaching_practice_for_the_criterion"], movesUp: [], movesDown: [] };
  });
  const order = request.criterion === "GENERAL_HEALTH" ? HEALTH_ORDER : request.criterion === "HYPERTROPHY" || request.criterion === "PERFORMANCE" ? PERFORMANCE_ORDER : [];
  const relevance = (label: string) => ((at) => (at < 0 ? order.length : at))(order.indexOf(category.get(label) ?? ""));
  const applies = (priority: CandidatePriority) => (priority.reasons.some((reason) => reason.endsWith(":applies") || reason.startsWith("possible_intake_gap")) ? 0 : 1);
  const sorted = priorities
    .map((priority, index) => ({ priority, index }))
    .sort((a, b) => TIER_ORDER.indexOf(a.priority.tier) - TIER_ORDER.indexOf(b.priority.tier)
      || applies(a.priority) - applies(b.priority)
      || relevance(a.priority.candidate) - relevance(b.priority.candidate)
      || a.index - b.index)
    .map((entry) => entry.priority);
  // A subset never sits above the product that contains it (BCAA ⊂ EAA).
  for (const [subset, superset] of subsetOf) {
    const at = sorted.findIndex((priority) => priority.candidate === subset);
    const above = sorted.findIndex((priority) => priority.candidate === superset);
    if (above > at) sorted.splice(above, 0, sorted.splice(at, 1)[0]);
  }
  if (request.criterion === "LEAST_NECESSARY") sorted.reverse();
  const dependsOnUnknown = priorities.some((priority) => priority.reasons.some((reason) => reason.endsWith(":unknown") || reason === "lab_dependent_do_not_assume_deficiency"));
  const assessed = priorities.filter((priority) => priority.tier !== "NOT_ASSESSED");
  const ties = assessed.some((priority, index) => assessed.some((other, otherIndex) => otherIndex !== index && other.tier === priority.tier));
  return { request, priorities: sorted, exactOrderJustified: !dependsOnUnknown && !ties, dependsOnUnknown };
}

/** A record id → its topic, when that record is in the turn. */
function getTopic(knowledge: KnowledgeResolution, id: string): string | undefined {
  return knowledge.records.find((record) => record.id === id)?.topic;
}

/* ---------- safety posture ---------- */

const SEVERITY: SafetyDecision[] = ["ALLOW", "ALLOW_WITH_CONTEXT", "CLARIFY", "DOWNGRADE_CLAIM", "DEFER_TO_SPECIALIST", "MEDICAL_ESCALATION", "HARD_STOP"];

/** Result of the existing nutrition safety screen (screenSafety), when the caller ran it. */
export type SupplementScreenKind = "supplement_medical" | "supplement_claim" | "medication" | null;

export type PostureInput = {
  knowledge: KnowledgeResolution;
  need: NeedContext;
  /** The existing hard-safety layer already owns this turn. */
  hardSafetyTriggered?: boolean;
  supplementScreen?: SupplementScreenKind;
  /** This turn's words: what is asked ABOUT a hormonal/drug product (substanceIntentOf). */
  message?: string;
  /** H0 cluster A: the user's own earlier disclosures that still hold. */
  context?: ContextWorkingSet;
};

/* ---------- substance intent: ENTITY_RISK != INTENT_RISK ---------- */

// Slang names with no registry alias (plain "tren" folds from Vietnamese "trên"), matched on the raw lower-case text only.
// H0 cluster B: blast/cruise, "enhanced", PCT ancillaries (SERMs, AIs, hCG) and DNP/clen/GH are PED-turn vocabulary too.
const PED_SLANG = /\b(?:trenbolone|dbol|deca|winstrol|winny|anadrol|masteron|primobolan|peds?|aas|roids|juic(?:e|ing)|on gear|on (?:a |my )?(?:cycle|blast|cruise)|(?:my|this|first|next|current) (?:cycle|blast)|start(?:ed|ing)? a cycle|blast and cruise|blasting(?! (?:my |the |your )?(?:chest|legs?|arms?|back|shoulders?|abs|quads|glutes|delts|music|it))|cruising|enhanced|pct|post[- ]cycle(?: therapy)?|nolvadex|tamoxifen|clomid|clomiphene|hcg|serms?|arimidex|anastrozole|aromasin|exemestane|letrozole|caber(?:goline)?|dnp|dinitrophenol|clen(?:buterol)?|hgh|growth hormone|mk-?677|test (?:e|c|cyp|enanthate|cypionate|prop|\d{2,4})|(?:on|running|pinning|inject\w*) test(?:osterone)?)\b/;
// Prescribed testosterone is medical treatment, not PED use: a TRT turn is never a PED-optimization turn by itself.
const PRESCRIBED = /\b(?:prescribed|prescription|(?:i'?m|im|i am|been) on trt|my (?:doctor|endo\w*|gp|urologist) (?:put|has|started) me on)\b/;
// What an optimisation ask targets: the refusal and its safe continuation are written for THAT ask.
const ADVICE = /\b(?:how (?:should|do|can|would|to|could) (?:i|we|my)|should (?:i|my)|can i|could i|what (?:should|can|do|would) (?:i|my)|look like|best|tips?|advice|give me|recommend|suggest|plan|program|need to|have to|any(?:thing)?\b[^.?!]{0,12}\bfor|keep|nen|co nen|lam sao|the nao|sao cho|ra sao|lam gi|can (?:gi|lam gi))\b/;
// Vietnamese current-use phrasing, on folded text ("đang chạy cycle", "xài tren").
const PED_VI = /\b(?:chay|dang|xai|dung|chich|tiem) (?:cycle|steroid|tren|deca|anavar|gear)\b/;
const FACETS: Array<[OptimizationFacet, RegExp]> = [
  ["PCT", /\b(?:pct|post[- ]cycle(?: therapy)?|nolvadex|tamoxifen|clomid|clomiphene|hcg|serms?|restart (?:my )?(?:natural )?(?:test|hormones?|production)|kick ?start)\b/],
  ["SIDE_EFFECTS", /\b(?:avoid|prevent|minimi[sz]e|reduce|manage|control|block|counter|deal with|handle)\b[^.?!]{0,25}\b(?:side effects?|sides|gyno|hair loss|acne|estrogen|e2|shutdown|bloat|water retention)\b|\b(?:arimidex|anastrozole|aromasin|exemestane|letrozole|caber(?:goline)?|ai)\b/],
  ["ORGAN_PROTECTION", /\b(?:keep|protect|support|lower|manage|control|bring down|fix|reduce|look after|healthy|good|safe|values?|markers?|tudca|nac|milk thistle|cardarine)\b[^.?!]{0,30}\b(?:liver|kidneys?|heart|lipids?|cholesterol|blood pressure|bp|hematocrit|haematocrit|rbc|prostate|organs?|gan|than|tim)\b|\b(?:liver|kidneys?|heart|lipids?|cholesterol|blood pressure|bp|hematocrit|haematocrit|organs?|gan)\b[^.?!]{0,30}\b(?:support|protect\w*|values?|markers?|healthy|safe|good|in check)\b|\bfor (?:the |my |your )?(?:liver|kidneys?|heart|lipids?|cholesterol|blood pressure|bp|organs?|gan)\b/],
  ["SUPPORT_SUPPLEMENTS", /\b(?:supps?|supplements?|vitamins?|support|what (?:should|can) i (?:add|take)|add to (?:it|my))\b/],
  ["TRAINING", /\b(?:train\w*|workouts?|program\w*|split|volume|frequency|lift\w*|rest periods?|sets?|reps?|cardio|recover\w*|tap luyen|tap)\b/],
  ["NUTRITION", /\b(?:eat\w*|diet|nutrition|macros?|calories|protein|carbs?|meals?|food|an gi|an uong|che do an)\b/],
];
const MSK_PAIN = /\b(?:shoulders?|knees?|elbows?|wrists?|back|hips?|ankles?|neck|hamstrings?|tendons?|joints?|muscles?|pecs?|quads?|vai|goi|lung)\b[^.?!]{0,15}\b(?:pain|hurts?|hurting|sore|aches?|dau)\b|\b(?:pain|hurts?|aches?|dau)\b[^.?!]{0,15}\b(?:shoulders?|knees?|elbows?|wrists?|back|hips?|ankles?|neck|vai|goi|lung)\b/g;
// "So if I'm on a cycle, what should I do?" — an open ask while using: health first, never cycle coaching.
const OPEN_ASK = /\b(?:what (?:should|do|can|would) i (?:do|know|watch|focus on)|what now|tips|advice|anything i should|how (?:do|should) i (?:approach|handle|manage) (?:it|this)|nen lam gi|lam gi bay gio|can luu y gi|luu y gi)\b/;
// Bare "tren" is also Vietnamese "trên" (on/upper) typed without accents: it counts only outside unaccented Vietnamese.
const BARE_TREN = /\btren\b/;
const UNACCENTED_VI = /\b(?:bao nhieu|nen|khong|duoc|minh|toi|tap|cua|la gi|the nao|nguc|vai|bung|lung)\b/;
// "not asking for a dose" names the dose to rule it out: drop the negated span before the use cues read the text.
const NEGATED_USE = /\b(?:not|no|don'?t|never|without)\s+(?:(?:asking|looking|want(?:ing)?|need(?:ing)?|going)\s+)?(?:for\s+|to\s+)?(?:a |any )?(?:dos\w*|cycles?|stacks?|sources?|use it|take it|run it)\b/g;
// Vietnamese use cues: only with a registry entity, since unaccented "tren" (Vietnamese "trên") also reaches PED_SLANG.
const VI_USE_CUE = /\b(?:nen (?:dung|uong|chich|tiem)|bao nhieu|co nen)\b/;
// A prescription hormone (insulin) is a performance-drug turn only in a physique / performance context.
const PERFORMANCE_USE = /\b(?:bodybuild\w*|gains?|muscle|bulk\w*|cutting|lifters?|gym|physique|mass|cycle|steroids?|peds?|tang co)\b/;
// Restricted use, on folded text. Asking what a thing is, how it works, its risks or how to stop is not on these lists.
const USE_CUES = [
  /(?<![a-z])(?:dos(?:e|es|age|ing)|mg|mcg|ml|iu|lieu)(?![a-z])/,
  /\bhow (?:much|many)(?: [a-z'-]+){0,3} (?:should|do|can|would|to) (?:i |you |we |people |beginners? )?(?:take|use|run|inject|pin|dose|start|need)\b/,
  /\b(?:build|design|make|plan|write|give|create|run|start|recommend|suggest)\b[^.?!]{0,30}\bcycles?\b/,
  /\b(?:first|beginner|starter|standard|good|best|typical|basic|safe|safest|cutting|bulking|my|next)\s+(?:[a-z-]+\s+)?cycles?\b|\bcycle (?:for|length|plan)\b/,
  /\bstack\w*\b|\b(?:should|can|how (?:do|to|should|would)|best way to) (?:i |you |we )?combine\b/,
  /\b(?:should|can|could|would) i (?:take|use|run|try|start|hop on|get on|inject|cycle)\b|\bi (?:want|plan|am planning|'m planning|am going|'m going) to (?:take|use|run|try|start|hop on|get on)\b/,
  /\bhow (?:do|should|would|to|can) (?:i |you |we )?(?:take|use|run|inject|pin|cycle|dose|start)\b|\bhow do (?:bodybuilders|lifters|people|athletes|guys) (?:use|take|run|dose|cycle)\b/,
  /\bwhat (?:do|does) (?:forums?|reddit|people|bodybuilders|lifters|guys|pros|coaches)\b[^.?!]{0,20}\b(?:recommend|use|run|take|suggest)\b/,
  /\b(?:best|most|strongest|safest|mildest|top)\b[^.?!]{0,30}\b(?:gains?|results?|for (?:mass|cutting|bulking|size|strength|muscle|fat loss|beginners?)|compound|steroids?|sarms?|ones?)\b|\bwhich (?:one|steroid|sarm|compound|is)\b[^.?!]{0,30}\b(?:best|most|better|strongest)\b|\brank\w*\b|\bworth (?:it|taking|trying|running)\b|\b(?:which|what)\b[^.?!]{0,30}\b(?:are|is) (?:good|best|better|worth|safe(?:st)?)\b/,
  // H0 final closure: a goal pursued ON the drug ("how do I cut on clen") or "safe use" of it is a use ask too.
  /\bhow (?:do|should|can|would|to|could) (?:i |you |we )?(?:cut|bulk|lean out|shred|dry out|get (?:lean|shredded|big|huge|ripped))\b[^.?!]{0,25}\b(?:on|with|using)\b|\b(?:use|take|run|cut|bulk|start)\b[^.?!]{0,25}\bsafe(?:ly)?\b(?! to (?:stop|quit|come off))|\bsafe(?:ly| way to| ways to)\b[^.?!]{0,10}\b(?:use|take|run|cut|bulk|start)\b/,
  /\b(?:avoid|prevent|minimi[sz]e|reduce|manage|control|block|counter)\b[^.?!]{0,25}\b(?:side effects?|sides|gyno|hair loss|acne|estrogen|shutdown|bloat)\b/,
];
const SOURCING_CUE = /\b(?:buy|purchase|order(?:ing)?|vendors?|suppliers?|sellers?|ugl|legit|pharma grade|mua)\b|\bwhere (?:can|do|to|should|could) (?:i |you |we )?(?:get|find|buy|order|source|cop)\b|\b(?:safest|best|good|legit|reliable|trusted|reputable|cheap\w*)\s+(?:[a-z-]+\s+)?sources?\b/;
const EVASION_CUE = /\b(?:avoid|beat|pass|evade|dodge|cheat|fool|hide|mask|get around|without getting)\b[^.?!]{0,25}\b(?:detect\w*|drug tests?|tests?|testing|caught|wada|usada|screen\w*)\b|\bdetection (?:time|window)\b|\bclear (?:my|the|your) system\b|\btranh bi phat hien\b/;
const CESSATION_CUE = /\b(?:stop|stopping|quit|quitting|come off|coming off|get off|getting off|cease)\b|\bregret\b|\b(?:tell|talk to|mention|say|disclose|admit)\b[^.?!]{0,30}\b(?:doctor|gp|physician|clinician)\b|\bmedical help\b|\breduce harm\b|\bharm reduction\b|\b(?:ngung|dung lai|bo)\b[^.?!]{0,20}\b(?:steroid|thuoc)\b/;
const IN_USE = /\b(?:i'?m on|i am on|im on|on (?:gear|cycle|a cycle|tren|test|anavar|steroids?|sarms?|clen)|(?:been )?using|i (?:used|took|take|started|inject\w*)|since (?:starting|i started)|dang dung|da dung)\b/;
const SYMPTOM_CUE = /\b(?:yellow|jaundice|dark (?:urine|pee)|(?:urine|pee) (?:is|was|looks) dark|chest (?:pain|hurts?|tight\w*)|heart (?:is )?(?:racing|pounding|fluttering|skipping)|pounding heart|palpitation\w*|nose ?bleeds?|passed out|faint\w*|dizz\w*|depress\w*|anxious|anxiety|suicid\w*|rage|can'?t sleep|insomnia|swollen|swelling|lump|pain|hurts?|blood|vomit\w*|shak\w*|tremor\w*|headache|short of breath|vang da|dau nguc|tim dap nhanh|tram cam)\b/;
const INFORMATION_CUE = /(?<![a-z])(?:what(?: even| exactly)?(?:'s| is| are| does| do| can| happens)|whats|why|how (?:does|do|is|are|can)(?! (?:i|you|we)\b)|explain|affect\w*|caus\w*|effects?|risks?|dangers?|dangerous|signs?|symptoms?|difference|differ|compare|vs|versus|same as|legal|works?|mean|la gi|nguy hiem|tac hai|tac dung phu|khac|the nao)(?![a-z])/;

/**
 * What a turn about a hormonal/drug product asks FOR, separate from the product's own risk. null = not such a turn.
 * Restriction is decided on the ask (dose, cycle, stack, personal use, ranking, sourcing, evasion), never on the name:
 * "what is anavar" is INFORMATION, "how much anavar" is USE_OPTIMIZATION, both together are MIXED. "Hypothetically" or
 * "for research" changes nothing — the cue lists ignore framing words.
 * ponytail: cue lists over folded text, not a parser; upgrade path is a classifier over the same classes.
 */
/**
 * H0 cluster B: a follow-up that names no drug ("anything for liver?", "what should I do?") while the user's own earlier
 * words say they are CURRENTLY using one. Only the asks that are use-optimisation whatever they name — organ protection, an
 * open "what now", and (for insulin) carbohydrate timing — are restricted here; ordinary questions stay with the model
 * under the current-use context rule.
 */
function contextOnlyIntent(folded: string, context: ContextWorkingSet): SubstanceIntent | null {
  const current = activeFacts(context).find((fact) => fact.kind === "PED_USE" && fact.temporal === "CURRENT");
  if (!current || current.turnsAgo === 0) return null;
  // H0 final closure: a possible adverse effect reported while currently using ("my heart is pounding at night") is the
  // substance-symptom case even when this turn names no drug. Joint/muscle pain stays an injury.
  if (SYMPTOM_CUE.test(folded.replace(MSK_PAIN, " ").replace(/\bblood ?(?:work|tests?|panels?)\b/g, " "))) {
    return { intentClass: "SYMPTOM_OR_ADVERSE_EFFECT", restricted: [], information: false, symptom: true, cessation: false, facets: [] };
  }
  const facets: OptimizationFacet[] = [];
  const organ = FACETS.find(([facet]) => facet === "ORGAN_PROTECTION")![1];
  if (organ.test(folded) && ADVICE.test(folded)) facets.push("ORGAN_PROTECTION");
  if (/insulin/.test(current.label) && /\b(?:carbs?|carbohydrates?|sugar|meals?|eat\w*|timing|time)\b/.test(folded) && ADVICE.test(folded)) facets.push("NUTRITION");
  if (facets.length === 0 && OPEN_ASK.test(folded) && folded.split(/\s+/).length <= 8 && !CESSATION_CUE.test(folded)) facets.push("GENERAL");
  if (facets.length === 0) return null;
  return { intentClass: "USE_OPTIMIZATION", restricted: ["USE_OPTIMIZATION"], information: false, symptom: false, cessation: false, facets };
}

export function substanceIntentOf(message: string, knowledge: KnowledgeResolution, context?: ContextWorkingSet): SubstanceIntent | null {
  const raw = message.toLowerCase();
  const folded = fold(message);
  const registryEntity = knowledge.gaps.some((gap) => gap.boundary === "PED_DRUG");
  // Prescribed TRT is treatment: not a PED turn unless a non-prescribed compound or a cycle is named too.
  if (PRESCRIBED.test(folded) && !/\b(?:cycle|blast|tren|deca|anavar|dbol|sarms?|stack|gear)\b/.test(folded)) {
    return { intentClass: "INFORMATION", restricted: [], information: true, symptom: false, cessation: CESSATION_CUE.test(folded), facets: [] };
  }
  // Bare "tren" is Vietnamese "trên" only when the user types WITHOUT accents; "tren là gì" (accents elsewhere) is trenbolone.
  const typesAccents = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(raw);
  const slang = PED_SLANG.test(raw) || PED_VI.test(folded) || (BARE_TREN.test(raw) && (typesAccents || !UNACCENTED_VI.test(folded))) || (/\btestosterone\b/.test(folded) && /\b(?:stack|cycle|inject|pin|run|blast)\w*\b/.test(folded));
  const insulinSymptom = /\binsulin\b/.test(folded) && IN_USE.test(folded) && SYMPTOM_CUE.test(folded);
  if (!registryEntity && !slang && !insulinSymptom && !(/\binsulin\b/.test(folded) && PERFORMANCE_USE.test(folded))) {
    return context ? contextOnlyIntent(folded, context) : null;
  }
  const asked = folded.replace(NEGATED_USE, " ");
  const restricted: RestrictedSubstanceUse[] = [];
  const useCues = registryEntity ? [...USE_CUES, VI_USE_CUE] : USE_CUES;
  const facets: OptimizationFacet[] = [];
  // Dose / cycle / stack / ranking cues are DOSING outright; a generic "should I take / how do I use" is DOSING only when no
  // more specific facet below names what is being optimised (PCT, support stack, training…).
  // A ranking of a list that also names ordinary supplements ("rank creatine, whey, ostarine and anavar") is a candidate
  // decision, not a use ask: the safe items are ranked and each drug product is named as outside scope (decideCandidates).
  // Restricted content limits the drug items; it never erases the safe ones (H0 cluster B/G).
  const rankingOnly = USE_CUES[8].test(asked) && !USE_CUES.some((cue, index) => index !== 8 && cue.test(asked)) && !SOURCING_CUE.test(asked) && !EVASION_CUE.test(asked);
  const safeCandidates = (knowledge.candidateRequest?.candidates ?? []).filter((candidate) => !knowledge.gaps.some((gap) => gap.boundary === "PED_DRUG" && [candidate.label, ...candidate.terms].some((term) => gap.retrievalTags.includes(fold(term)))));
  if (rankingOnly && safeCandidates.length > 0) {
    return { intentClass: "MIXED", restricted: [], information: true, symptom: false, cessation: false, facets: [], rankingWithPed: true };
  }
  const SPECIFIC_DOSING = [0, 1, 2, 3, 4, 8];
  const dosing = USE_CUES.some((cue, index) => SPECIFIC_DOSING.includes(index) && cue.test(asked)) || (registryEntity && VI_USE_CUE.test(asked));
  const genericUse = useCues.some((cue) => cue.test(asked));
  if (genericUse) restricted.push("USE_OPTIMIZATION");
  if (USE_CUES[USE_CUES.length - 1].test(asked)) facets.push("SIDE_EFFECTS");
  else if (dosing) facets.push("DOSING");
  // H0 cluster B: an ask that optimises USE without naming a dose — support stacks, organ protection, side-effect
  // management, training or diet built around the drug, PCT — is still use optimisation. INFORMATION about the same
  // topic ("what does tren do to the liver?") has no advice verb and stays INFORMATION.
  const cessationAsk = CESSATION_CUE.test(folded);
  for (const [facet, cue] of FACETS) {
    if (!cue.test(asked) || facets.includes(facet)) continue;
    if (facet === "PCT" ? !(ADVICE.test(asked) || /\b(?:run|do|use|need|start|take|plan|protocol)\b/.test(asked)) : !ADVICE.test(asked)) continue;
    if (facet === "TRAINING" && cessationAsk && !/\b(?:on|while|during)\b/.test(asked)) continue; // training after stopping is not optimising use
    facets.push(facet);
  }
  // A cessation ask ("I want to stop, what should I do") is supported, never treated as an open ask about continuing.
  const usingNow = IN_USE.test(folded) || /\b(?:i'?m|im|i am)\s+(?:enhanced|blasting|cruising|juicing)\b/.test(folded) || hasActive(context, "PED_USE");
  if (facets.length === 0 && !cessationAsk && usingNow && OPEN_ASK.test(asked)) facets.push("GENERAL");
  if (facets.length === 0 && genericUse) facets.push("DOSING");
  if (facets.length > 0 && !restricted.includes("USE_OPTIMIZATION")) restricted.push("USE_OPTIMIZATION");
  if (SOURCING_CUE.test(asked)) restricted.push("SOURCING");
  if (EVASION_CUE.test(asked)) restricted.push("EVASION");
  // A safe ask is judged on what is left once the restricted spans are taken out: "how much should I take" is not a question ABOUT it.
  const rest = [...useCues, SOURCING_CUE, EVASION_CUE].reduce((text, cue) => text.replace(new RegExp(cue.source, "g"), " "), asked);
  // Joint or muscle pain while using is an injury (the INJURY context rule trains around it), not a drug adverse effect.
  const symptom = IN_USE.test(folded) && SYMPTOM_CUE.test(folded.replace(MSK_PAIN, " "));
  const cessation = cessationAsk;
  const information = INFORMATION_CUE.test(rest);
  const intentClass: SubstanceIntentClass = symptom
    ? "SYMPTOM_OR_ADVERSE_EFFECT"
    : restricted.length > 0
      ? information || cessation ? "MIXED" : restricted[0]
      : cessation ? "CESSATION_OR_CHANGE" : information ? "INFORMATION" : "AMBIGUOUS";
  return { intentClass, restricted, information, symptom, cessation, facets };
}

const PED_RULE = "Give no dose, cycle, stack, sourcing, detection-avoidance or 'safer use' instructions, and never present it as an option for a natural lifter.";

/* ---------- context rules: the user's own earlier disclosures (H0 cluster A) ---------- */

type ContextRule = { decision: SafetyDecision; tag: SafetyContextTag; directive: string };

/** What loads an injured site: for a diagnosed injury, the movements that wait for clinical clearance. */
const INJURY_LOADS: Record<string, string> = {
  shoulder: "every pressing, push-up, fly, dip, overhead and pulling movement loads the shoulder joint — chest training included",
  knee: "squats, lunges, leg press, leg extensions, jumps and running",
  "lower back": "deadlifts, squats, good mornings, bent-over rows, heavy carries and loaded spinal flexion",
  back: "deadlifts, squats, good mornings, bent-over rows and heavy carries",
  neck: "shrugs, overhead pressing, neck work and anything loaded on the upper back",
  wrist: "push-ups, pressing, front squats and curls",
  elbow: "curls, triceps extensions, pressing, pull-ups and rows",
  hip: "squats, lunges, deadlifts and hip thrusts",
  ankle: "running, jumping, lunges and calf raises",
  hamstring: "deadlifts, leg curls, sprinting and good mornings",
};

const ALLERGY_DETAIL: Record<string, string> = {
  fish: "no fish and no fish oil or fish-derived omega-3; an algae-based omega-3 is the fish-free form, worth checking with their allergist",
  shellfish: "no shellfish or crustacean-derived products (some glucosamine and krill oil come from shellfish)",
  "dairy or lactose": "no milk-based products; whey and casein are milk proteins, so suggest a non-dairy protein (or lactose-free whey isolate only for lactose intolerance, never for a milk allergy)",
  "peanuts or tree nuts": "no peanut or nut products, including nut butters in snacks or bars",
  eggs: "no eggs or egg-white protein",
  soy: "no soy foods or soy protein",
  "gluten or wheat": "no gluten / wheat foods",
  sesame: "no sesame",
};

const MEDICATION_DETAIL: Record<string, string> = {
  ssri: "never suggest St John's wort, 5-HTP, tryptophan, SAMe or other serotonergic products with an SSRI — a serotonin-syndrome risk; say that plainly. Any new supplement is checked with their prescriber or pharmacist.",
  maoi: "MAOIs interact with many supplements and stimulants (including caffeine-heavy pre-workouts and tyramine-rich foods): no supplement or stimulant suggestion without their prescriber.",
  anticoagulant: "with a blood thinner, fish oil, vitamin E, ginkgo, garlic or turmeric supplements can add to bleeding risk, and big changes in vitamin K intake affect warfarin: no such supplement without their prescriber; say why.",
  insulin: "training and carbohydrate timing interact with insulin: they need a glucose-monitoring and low-blood-sugar plan around sessions agreed with their diabetes team; never suggest an insulin dose or dose change.",
  metformin: "a supplement can interact with metformin; new supplements are checked with their pharmacist.",
  statin: "a supplement can interact with a statin (e.g. red yeast rice duplicates it); new supplements are checked with their pharmacist.",
  bp_medication: "no stimulant pre-workout or high-caffeine suggestion; new supplements are checked with their pharmacist.",
  thyroid: "some supplements (iron, calcium, biotin) interfere with thyroid medication or its blood tests: check timing with their pharmacist.",
  isotretinoin: "no vitamin A supplements with isotretinoin, and any supplement is checked with their prescriber.",
  stimulant_adhd: "no caffeine-heavy or stimulant pre-workout on top of an ADHD stimulant; check with their prescriber.",
  lithium: "big changes in fluid, salt or caffeine intake change lithium levels: hydration or supplement changes go through their prescriber.",
  generic: "which medication is unknown: any supplement is a pharmacist's or doctor's interaction check.",
  trt: "prescribed TRT is medical treatment, not PED use: ordinary supplements, training and food are fine to discuss; anything that changes hormones (boosters, 'stacks', extra testosterone, SARMs) goes through their prescriber.",
};

const CONDITION_DETAIL: Record<string, string> = {
  kidney_disease: "no creatine, high-protein, electrolyte or other supplement recommendation without their kidney doctor; protein targets are set by their doctor or renal dietitian. Say why: kidney disease changes what is safe to take.",
  type1_diabetes: "training needs a glucose plan: check glucose before, during and after sessions, carry fast-acting carbohydrate, and know the low-blood-sugar signs; carbohydrate and insulin adjustments are set with their diabetes team. Fuel advice is general, never an insulin instruction.",
  type2_diabetes: "exercise is helpful, but medication can cause low blood sugar around training: check glucose as their care team advises; carbohydrate or medication changes go through them.",
  diabetes: "training needs a glucose plan agreed with their care team (check before/after, fast carbohydrate on hand, low-blood-sugar signs); never an insulin or medication instruction.",
  hypertension: "no stimulant pre-workout or high-caffeine suggestion, avoid maximal breath-hold (Valsalva) efforts and very heavy singles; uncontrolled or very high blood pressure needs medical clearance before hard training.",
  heart_condition: "hard or maximal training and any stimulant need clearance from their cardiologist; chest pain, fainting or palpitations during exercise mean stop and get checked.",
  concussion: "no training until they are symptom-free and medically cleared, then a graded return with no head-impact risk; worsening headache, vomiting, confusion or drowsiness need urgent care.",
  epilepsy: "no stimulant supplements; avoid training alone with heavy loads or in water; follow their neurologist's advice.",
  asthma: "keep the reliever inhaler at hand during training; exercise-triggered symptoms are for their doctor to manage.",
  liver_disease: "no supplement or herbal product without their doctor (several stress the liver); no alcohol-related 'detox' advice.",
  eating_disorder: "no calorie deficit, weight-loss target, macro counting or restrictive plan; support their treatment team and focus on strength and wellbeing.",
};

/** Every ACTIVE safety fact from the working set → one rule for the reply. Facts the user ended or corrected never get here. */
function contextRules(context: ContextWorkingSet | undefined, supplementTurn: boolean): ContextRule[] {
  const rules: ContextRule[] = [];
  const said = (fact: ContextFact) => (fact.turnsAgo === 0 ? "in this message" : "earlier in this chat");
  for (const fact of activeFacts(context).filter((entry) => entry.relevance === "SAFETY")) {
    const id = fact.key.split(":")[1] ?? "";
    switch (fact.kind) {
      case "PED_USE":
        if (fact.temporal === "CURRENT" && /insulin/.test(fact.label)) {
          rules.push({ decision: "DEFER_TO_SPECIALIST", tag: "HORMONAL_PED", directive: `The user said ${said(fact)} that they use insulin to build muscle. Non-medical insulin can drop blood sugar dangerously and has killed people. Never describe it as effective and give no timing, carbohydrate, meal or dosing advice built around it. Name the low-blood-sugar warning signs (shaky, sweaty, confused, faint) and what to do (fast sugar now, don't be alone, emergency services if confused or unresponsive), and that a doctor should know they are using it. ${PED_RULE}` });
        } else if (fact.temporal === "CURRENT") {
          rules.push({ decision: "DEFER_TO_SPECIALIST", tag: "HORMONAL_PED", directive: `The user said ${said(fact)} that they are currently using anabolic steroids or other PEDs. Read every request this turn in that light: give nothing that helps run, sustain, support or optimise the use — no 'support' or 'on-cycle' supplements, no liver, heart or organ-protection protocol, no PCT or hormone-recovery plan, no training or diet changes to get more from it. Answer what is safe to answer (what a supplement is, general health), and say plainly, once and without lecturing, what the use means for the question asked and that a doctor can monitor blood pressure, blood lipids, liver and hormones confidentially. ${PED_RULE}` });
        } else {
          rules.push({ decision: "ALLOW_WITH_CONTEXT", tag: "HORMONAL_PED", directive: `The user used PEDs in the past and is not using now (said ${said(fact)}). Treat them as not currently using; give no PCT or hormone-recovery protocol. If they report low mood, low libido or fatigue since stopping, that is a doctor's hormone check.` });
        }
        break;
      case "PREGNANCY":
        rules.push({ decision: supplementTurn ? "DEFER_TO_SPECIALIST" : "ALLOW_WITH_CONTEXT", tag: "PREGNANCY", directive: `The user ${fact.label.replace(/^is /, "is ")} (said ${said(fact)}). Training advice must be pregnancy-aware and agreed with their midwife or doctor: no new maximal efforts, nothing with fall or abdominal-impact risk, and stop and get checked for bleeding, dizziness, chest pain, fluid leakage or painful contractions. Do not recommend, dose or time any supplement, stimulant or caffeine amount — that belongs to their midwife or doctor. General food guidance is fine.` });
        break;
      case "INJURY": {
        const diagnosed = clinicallyBounded(fact);
        const loads = INJURY_LOADS[id];
        const restriction = fact.label.split("clinician restriction: ")[1];
        rules.push({ decision: "ALLOW_WITH_CONTEXT", tag: "INJURY_CONTEXT", directive: `The user has ${fact.label.includes("diagnosed") ? `a diagnosed ${id} injury` : `${id} pain or an injury`} (said ${said(fact)}${fact.turnsAgo > 0 ? `: "${fact.quote}"` : ""}).${restriction ? ` Their clinician's restriction stands: "${restriction}". Do not endorse any movement that conflicts with it, even with form caveats — name the conflict and offer an alternative that respects it.` : ""} Do not program exercises that load or provoke the ${id}${loads ? ` (${loads})` : ""}; train around it with pain-free alternatives and name each swap. ${diagnosed ? `A diagnosed or clinician-restricted injury is not trained through: if the user asks for a workout whose movements load the ${id}, say plainly that those movements wait for their physio's or doctor's clearance, do not give that workout in a lighter form, and offer what can be trained safely instead.` : "Pain that is sharp, worsening or lasting more than a couple of weeks should be assessed."} Never ignore it in a workout.` });
        break;
      }
      case "ALLERGY":
        rules.push({ decision: "ALLOW_WITH_CONTEXT", tag: "ALLERGY_CONTEXT", directive: /^possible reaction/.test(fact.label)
          ? `Possible food reaction on record — the user reported a ${fact.label.replace(/^possible /, "")} (said ${said(fact)}). Do not call it a confirmed allergy and do not dismiss it: until a doctor or allergist has checked it, never suggest that food or a product made from it, even as "an option": ${ALLERGY_DETAIL[id] ?? "no product containing it"}. Suggest getting the reaction checked.`
          : `Allergy on record — the user ${/^(?:allergic|lactose)/.test(fact.label) ? "is " : ""}${fact.label} (said ${said(fact)}). Never suggest a food or supplement that contains it, even as "an option": ${ALLERGY_DETAIL[id] ?? "no product containing it"}.` });
        break;
      case "MEDICATION":
        rules.push({ decision: supplementTurn ? "DEFER_TO_SPECIALIST" : "ALLOW_WITH_CONTEXT", tag: "MEDICATION_CONTEXT", directive: `The user ${fact.label} (said ${said(fact)}). ${MEDICATION_DETAIL[id] ?? MEDICATION_DETAIL.generic}` });
        break;
      case "CONDITION":
        if (fact.temporal === "HISTORICAL") break;
        rules.push({ decision: id === "concussion" || id === "eating_disorder" || supplementTurn ? "DEFER_TO_SPECIALIST" : "ALLOW_WITH_CONTEXT", tag: id === "eating_disorder" ? "EATING_DISORDER_RISK" : "MEDICAL_CONTEXT", directive: `The user ${fact.label} (said ${said(fact)}). ${CONDITION_DETAIL[id] ?? "Keep advice general and leave personal decisions to their doctor."}` });
        break;
      case "LOW_ENERGY_INTAKE":
        rules.push({ decision: "DEFER_TO_SPECIALIST", tag: "EXTREME_DIET", directive: `The user ${fact.label.replace(/^eats/, "eats").replace(/^reports/, "reports")} (said ${said(fact)}). That is far too little to train on safely. Do not add cardio, a bigger deficit, fasting or a cutting plan, do not program heavy or intense training (no workout with sets and reps, not even "for when you're ready"), and do not help them lose weight faster. Everyday movement they need — walking somewhere, an easy bike commute, stairs — is fine at an easy pace; say so rather than forbidding it. Say so plainly and kindly first, name the risk briefly (muscle loss, fatigue, dizziness, hormonal and heart strain), encourage a doctor or dietitian, and offer a safer next step: Gemma, the nutrition coach, can set a sustainable intake.` });
        break;
      case "SYMPTOM":
        rules.push({ decision: "DEFER_TO_SPECIALIST", tag: "SYMPTOM_CONTEXT", directive: `The user reported ${fact.label.replace(/^reported /, "")} (said ${said(fact)}) and has not said it resolved. Do not clear them to train hard; that symptom needs a medical check first.` });
        break;
      default:
        break;
    }
  }
  const facts = activeFacts(context);
  // Feeling unwell after STOPPING is worth linking: low mood, fatigue or low libido after coming off can be hormonal.
  if (facts.some((fact) => fact.kind === "PED_USE" && fact.temporal === "HISTORICAL") && facts.some((fact) => fact.kind === "SELF_REPORT" && /unwell|exhausted/.test(fact.label))) {
    rules.push({ decision: "ALLOW_WITH_CONTEXT", tag: "HORMONAL_PED", directive: "The user stopped PEDs and now says they feel unwell or exhausted. Link the two plainly and kindly: low mood, fatigue and low libido after coming off can be the body's own hormones recovering, which a doctor can check with a blood test — that is worth doing, especially if it lasts or mood is very low. Keep training light and flexible meanwhile. If they mention hopelessness or thoughts of self-harm, treat that as urgent." });
  }
  // High blood pressure or a red-flag symptom WHILE using is an adverse effect of the use, not a separate training question.
  const using = facts.some((fact) => fact.kind === "PED_USE" && fact.temporal === "CURRENT");
  if (using && facts.some((fact) => fact.key === "CONDITION:hypertension" || fact.kind === "SYMPTOM")) {
    rules.push({ decision: "MEDICAL_ESCALATION", tag: "HORMONAL_PED", directive: "High blood pressure or a red-flag symptom while using PEDs is an adverse effect of the use. Say so plainly: no heavy, maximal or breath-hold training until a doctor has checked it; stopping the drug is the safest step; a severe headache, chest pain, vision changes or shortness of breath is an emergency. Do not give a go-ahead to train heavy, even with caveats." });
  }
  return rules;
}

/**
 * Safety as execution logic: one graded decision plus the rules the reply must follow. A disclaimer is not in here —
 * each directive changes what the answer may contain.
 */
export function decideSafetyPosture(input: PostureInput): SafetyPosture {
  const { knowledge, need } = input;
  let decision: SafetyDecision = "ALLOW";
  const contexts = new Set<SafetyContextTag>();
  const directives: string[] = [];
  const raise = (next: SafetyDecision, context: SafetyContextTag | null, directive: string) => {
    if (SEVERITY.indexOf(next) > SEVERITY.indexOf(decision)) decision = next;
    if (context) contexts.add(context);
    directives.push(directive);
  };

  const supplementTurn = isSupplementTurn(knowledge);
  const tagged = (tag: SafetyContextTag) => knowledge.records.some((record) => record.supplement && record.contraindicationTags.includes(tag));

  if (input.hardSafetyTriggered) {
    raise("HARD_STOP", null, "The safety layer owns this turn. Coaching optimisation does not apply.");
  }
  // ENTITY_RISK != INTENT_RISK: the product's risk sets the boundary; the ask decides whether safety owns the turn.
  const substance = input.message === undefined ? null : substanceIntentOf(input.message, knowledge, input.context);
  if (substance === null && knowledge.gaps.some((gap) => gap.boundary === "PED_DRUG")) {
    raise("HARD_STOP", "HORMONAL_PED", `This is a hormonal or drug product, not a supplement. ${PED_RULE}`);
  } else if (substance && substance.restricted.length > 0) {
    raise("HARD_STOP", "HORMONAL_PED", `This is a hormonal or drug product and the user asks how to use, get or hide it. ${PED_RULE}`);
  } else if (substance?.symptom) {
    const hypo = /\binsulin\b/.test(fold(input.message ?? "")) && /\b(?:faint\w*|dizz\w*|shak\w*|sweat\w*|confus\w*|passed out|blacked out|tremor\w*|weak|chong mat|run)\b/.test(fold(input.message ?? ""));
    raise("MEDICAL_ESCALATION", "HORMONAL_PED", hypo
      ? `The user feels faint/shaky after using insulin: treat it as possible dangerously LOW BLOOD SUGAR. Lead with first aid in plain words: take fast sugar now (juice, a regular soft drink, glucose tablets or sweets) if they can swallow safely; do not stay alone; call emergency services now if they are confused, drowsy, cannot keep sugar down or pass out. Then say insulin used for bodybuilding can kill this way and needs a doctor. Nothing else first. ${PED_RULE}`
      : `The user reports a possible adverse effect while using a hormonal or drug product. Lead with what to do: stop taking it and get a medical assessment today (urgent care if it is severe or getting worse), and tell the clinician exactly what was used — they need that to help. Then explain briefly why the sign matters. ${PED_RULE}`);
  } else if (substance?.cessation) {
    raise("DEFER_TO_SPECIALIST", "HORMONAL_PED", `The user wants to stop, or to get medical help about, a hormonal or drug product. Be supportive and non-judgemental: stopping or telling a doctor is a good decision. Help concretely: what to tell the clinician (what, how much and how long — honestly; clinicians see this often), the symptoms worth mentioning, why hormone recovery after stopping is checked medically (no protocol here), and what they can keep doing with training, food and sleep meanwhile. ${PED_RULE}`);
  } else if (substance && !substance.information && substance.intentClass === "AMBIGUOUS") {
    // A bare disclosure ("I'm on a steroid cycle.") is not a question ABOUT the product: the current-use context rule below
    // carries it. Anything else that is unclear gets no use guidance and one question about what they want to know.
    if (!hasActive(input.context, "PED_USE")) raise("ALLOW_WITH_CONTEXT", "HORMONAL_PED", `The ask about a hormonal or drug product is unclear. Ask in one line what they want to know (what it is, its risks, or stopping). ${PED_RULE}`);
  } else if (substance?.rankingWithPed) {
    raise("ALLOW_WITH_CONTEXT", "HORMONAL_PED", `The list mixes ordinary supplements with hormonal or drug products. Rank the supplements normally. Name each drug product in the list as outside safe coaching, with a one-line reason (a prescription or unapproved drug with serious risks) and no ranking detail. ${PED_RULE}`);
  } else if (substance && PRESCRIBED.test(fold(input.message ?? "")) && !/\bwhat (?:is|are|does)\b|\bla gi\b/.test(fold(input.message ?? ""))) {
    raise("ALLOW_WITH_CONTEXT", "MEDICATION_CONTEXT", "The user is on PRESCRIBED testosterone (TRT) — medical treatment, not PED use. Answer the question normally. Anything that changes hormones (testosterone boosters, 'stacks', extra testosterone, SARMs) or interacts with the treatment goes through their prescriber; ordinary supplements, training and food are fine to discuss.");
  } else if (substance) {
    raise("ALLOW_WITH_CONTEXT", "HORMONAL_PED", `The user asks ABOUT a hormonal or drug product — what it is, how it works, its risks, or how it compares. That is a valid question: answer it. Muscle or performance effects are reported only as claims with their limits: a mechanism (for example raising IGF-1) is not a proven effect in healthy people, and none is presented as an established benefit. Open with what it is; broad mechanism, medical versus non-medical use, and risks or warning signs are fine as general medical knowledge. ${PED_RULE} No doctor line is needed for a plain definition; at most one short risk note. "Steroid" alone can also mean corticosteroids (anti-inflammatory medicines), a different class — say so in one clause if the user did not say anabolic.`);
  }
  for (const rule of contextRules(input.context, supplementTurn)) raise(rule.decision, rule.tag, rule.directive);
  if (knowledge.gaps.some((gap) => gap.boundary === "HORMONAL_BOOSTER")) {
    raise("DOWNGRADE_CLAIM", "HORMONAL_PED", "Do not recommend or name a 'testosterone booster' product. The project holds no verified evidence that any over-the-counter one works; say that plainly, say that suspected low testosterone is a blood-test question for a doctor, and offer what training, sleep, enough dietary fat and energy intake can do instead.");
  }
  if (input.supplementScreen === "supplement_medical") {
    raise("MEDICAL_ESCALATION", "MEDICAL_CONTEXT", "A medical context plus a request to use a supplement: no dose, timing, stack or cycle. That decision belongs to a doctor or pharmacist.");
  }
  if (input.supplementScreen === "supplement_claim") {
    raise("DOWNGRADE_CLAIM", "TREATMENT_CLAIM", "The question asks a supplement to treat, protect or change an organ, lab marker or disease. Do not present any supplement as a treatment; a proposed mechanism is not a clinical benefit.");
  }
  if (supplementTurn && need.pregnancy) {
    raise("DEFER_TO_SPECIALIST", "PREGNANCY", "Pregnancy or breastfeeding: do not recommend, dose or time any supplement; that is a decision for the user's midwife or doctor. General food guidance is fine.");
  }
  if (supplementTurn && (need.medication || input.supplementScreen === "medication")) {
    raise("DEFER_TO_SPECIALIST", "MEDICATION_CONTEXT", "The user takes medication, and which one is unknown. Do not recommend a stack or give any dose or timing: whether a specific supplement is compatible is a pharmacist's or doctor's check, and say WHY (a supplement can change how a medicine works). Ask which medication only if they want to take that to their pharmacist. Still be useful: food, training and sleep need no interaction check, and you may explain the general evidence for a supplement they name.");
  }
  if (supplementTurn && need.medicalCondition) {
    raise("DEFER_TO_SPECIALIST", "MEDICAL_CONTEXT", "The user mentions a medical condition: no supplement dose, timing or stack. Explain the general evidence only and leave the personal decision to their doctor.");
  }
  if (knowledge.gaps.some((gap) => !gap.boundary)) {
    raise(
      "DOWNGRADE_CLAIM",
      null,
      knowledge.state === "RETRIEVAL_REQUIRED"
        ? "The project has no verified evidence for any benefit of this topic; the retrieved evidence is uncurated. What it is comes from the IDENTITY line when there is one. You may say what the product is and what has been STUDIED, in those words and with the study's own limits. Do not say it helps, protects, improves, reduces or supports anything, do not describe a mechanism as an effect, give no dose, and state plainly that no benefit is established here."
        : "The project has no verified evidence for any benefit of this topic. Say so; what it is comes from the IDENTITY line when there is one. Do not fill the gap from memory as if it were established, give no dose, and claim no benefit.",
    );
  }
  if (supplementTurn && need.ageBand === "MINOR") {
    raise("ALLOW_WITH_CONTEXT", "AGE_CONTEXT", `The user is ${need.ageYears}, under 18. The plan is food, training and sleep. Do not recommend ergogenic, stimulant or herbal supplements and give no doses; anything beyond food is a decision for a parent or guardian with a doctor or dietitian.`);
  } else if (supplementTurn && need.ageBand === "YOUNG_ADULT") {
    raise("ALLOW_WITH_CONTEXT", "AGE_CONTEXT", `The user is ${need.ageYears}: a young adult, which is context and not a contraindication. Put food, training and sleep first, suggest the smallest useful set rather than a stack, assume no deficiency, keep stimulant load low and away from sleep, and treat hormonal or PED-like products as outside natural supplement advice.`);
  }
  if (tagged("STIMULANT_RISK") && (need.poorSleep === "YES" || need.highStimulantUse === "YES")) {
    raise("ALLOW_WITH_CONTEXT", "STIMULANT_RISK", "Sleep is poor or stimulant intake is already high. Do not add caffeine or a stimulant pre-workout; total daily stimulant exposure and its distance from bedtime matter more than the product. Fixing sleep is the performance lever here.");
  }
  if (knowledge.openSupplementRequest && SEVERITY.indexOf(decision) < SEVERITY.indexOf("DOWNGRADE_CLAIM")) {
    raise("CLARIFY", null, "An open 'what should I take' request: give a short, useful baseline now and ask at most the one or two missing facts that would change it. Never open with a generic stack list. Reason in this order — what matters more than any supplement (food, training, sleep), in one line; the option with strong support, named as optional; what only makes sense if a still-unknown fact is true; what to skip and why — then end on the question(s). Do not close with a general 'consult a professional' line: no medical context was raised.");
  }

  const noDosing = SEVERITY.indexOf(decision) >= SEVERITY.indexOf("DEFER_TO_SPECIALIST") || (supplementTurn && need.ageBand === "MINOR") || knowledge.gaps.some((gap) => gap.boundary);
  return { decision, contexts: [...contexts], directives, noDosing: Boolean(noDosing), substanceIntent: substance };
}

const PERSONAL_PICK_OWNERS: SafetyContextTag[] = ["PREGNANCY", "HORMONAL_PED", "MEDICAL_CONTEXT", "MEDICATION_CONTEXT", "EXTREME_DIET", "EATING_DISORDER_RISK", "SYMPTOM_CONTEXT"];

/**
 * A safety context that hands the PERSONAL supplement pick to a clinician (pregnancy, current PED use, a condition, a
 * medication, dangerously low intake, an unresolved red-flag symptom). An open "what should I take" then gets no option
 * list: a list is a recommendation whatever caveat follows it. A product the user names may still be explained.
 */
export function personalPickBlocked(posture: SafetyPosture): boolean {
  return SEVERITY.indexOf(posture.decision) >= SEVERITY.indexOf("DEFER_TO_SPECIALIST") && posture.contexts.some((context) => PERSONAL_PICK_OWNERS.includes(context));
}

/** A turn about supplements: one named, a known gap, an open request, or a pick of a supplement for an outcome. */
export function isSupplementTurn(knowledge: KnowledgeResolution): boolean {
  return knowledge.openSupplementRequest || knowledge.gaps.length > 0 || knowledge.records.some((record) => record.supplement) || knowledge.requestedOutcome?.targetClass === "SUPPLEMENT";
}

/* ---------- recommendation eligibility ---------- */

/**
 * BEST REQUEST != AUTOMATIC RANKING. The one decision on whether a "best / what should I take" request may be answered
 * with a pick, from the requested outcome, the evidence scoped to it and the safety posture. Answer-free: it writes no
 * user text. Hard stops stay with the safety layers; this only narrows what a reply may claim.
 */
export function decideRecommendation(input: { knowledge: KnowledgeResolution; posture: SafetyPosture; options: SupplementOption[] }): RecommendationDecision {
  const { knowledge, posture, options } = input;
  // An evidence question ("does X reduce Y?") is not a pick: its outcome scopes the claims, not a recommendation.
  const outcome = knowledge.requestedOutcome?.ask === "PICK" ? knowledge.requestedOutcome : null;
  const candidates = knowledge.candidateRequest ?? null;
  if (!outcome && !knowledge.openSupplementRequest && !candidates) return { eligibility: "NOT_REQUESTED", reasons: [] };
  const decision = (eligibility: RecommendationEligibility, reasons: string[]): RecommendationDecision => ({ eligibility, reasons });
  if (posture.decision === "HARD_STOP" || posture.decision === "MEDICAL_ESCALATION" || (knowledge.gaps.some((gap) => gap.boundary === "PED_DRUG") && !posture.substanceIntent?.rankingWithPed)) {
    return decision("OUTSIDE_AUTHORITY", ["safety_owns_turn"]);
  }
  // A symptom, organ, lab marker or hormone does not say what is wanted (prevention, a condition, a test result, a symptom).
  // Food guidance for it stays general education; a product or an exercise picked "for" it waits for the answer.
  if (posture.contexts.includes("TREATMENT_CLAIM") || (outcome?.healthSensitive && outcome.targetClass !== "FOOD")) {
    return decision("NEEDS_CLARIFICATION", [`health_outcome_unresolved:${outcome?.phrase ?? "treatment_claim"}`]);
  }
  if (outcome?.healthSensitive) return decision("CAN_EDUCATE", [`health_outcome_general_food_guidance:${outcome.phrase}`]);
  if (posture.decision === "DEFER_TO_SPECIALIST") return decision("CAN_EDUCATE", ["specialist_decides_personal_use"]);
  if (knowledge.openSupplementRequest) {
    return decision("CAN_RANK", ["open_baseline_tiers", ...(outcome ? [`purpose:${outcome.phrase}`] : []), ...(candidates ? [`candidate_priority:${candidates.criterion}`] : [])]);
  }
  // Named options under a known criterion: conditional priority classes (decideCandidates), not a winner.
  if (!outcome) return decision("CAN_RANK", [`candidate_priority:${candidates!.criterion}`]);
  if (outcome!.targetClass !== "SUPPLEMENT") return decision("CAN_RANK", [`coaching_practice:${outcome!.targetClass.toLowerCase()}`]);
  // Only claims about THIS outcome were kept on each candidate, so support here is support for the outcome asked.
  const supported = options.filter((option) => (option.tier === "HIGH_UTILITY" || option.tier === "CONDITIONAL") && knowledge.records.some((record) => record.id === option.recordId && strongestSupport(record)));
  return supported.length > 0
    ? decision("CAN_RANK", supported.map((option) => `supported_for_outcome:${option.topic}`))
    : decision("CAN_EDUCATE", [`no_established_option_for:${outcome!.phrase}`]);
}
