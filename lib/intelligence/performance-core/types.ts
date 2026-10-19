/**
 * ICH-1 Shared Performance Intelligence Core — pure types. Provider-free, persistence-free, I/O-free.
 *
 * One substrate (knowledge, evidence, need policy, safety posture, conversation control) that Dante and Gemma both
 * consume. It owns NO domain authority: Dante still owns training/recovery/performance, Gemma nutrition/food, and the
 * existing safety layers own every hard stop. This layer only decides what may be SAID and how strongly.
 */

export type Coach = "DANTE" | "GEMMA";
export type KnowledgeDomain = "TRAINING" | "NUTRITION" | "SUPPLEMENT";

/** What kind of statement a claim is. A MECHANISM is never a benefit; a CONDITIONAL holds only under its `conditions`. */
export type KnowledgeClaimType = "MECHANISM" | "ESTABLISHED_GUIDANCE" | "REASONABLE_INFERENCE" | "CONDITIONAL" | "UNCERTAIN" | "UNKNOWN";

/** Qualitative only — deliberately no numeric confidence. Belongs to ONE claim x outcome x population x context. */
export type EvidenceStrength = "HIGH" | "MODERATE" | "LIMITED" | "THEORETICAL" | "INSUFFICIENT";

/** Direction of the evidence for the claim's outcome. DOES_NOT_SUPPORT is how an unsupported popular claim is recorded. */
export type ClaimStance = "SUPPORTS" | "DOES_NOT_SUPPORT" | "MIXED";

export type SourceClass =
  | "POSITION_STAND" | "CONSENSUS_STATEMENT" | "GUIDELINE" | "META_ANALYSIS" | "SYSTEMATIC_REVIEW" | "NARRATIVE_REVIEW" | "PRIMARY_STUDY";

export type KnowledgeSource = {
  id: string;
  title: string;
  /** First authors as PubMed lists them, "et al." when truncated. */
  authors: string;
  journal: string;
  year: number;
  pmid: string;
  doi: string;
  sourceClass: SourceClass;
  /** How this entry was checked. Only the abstract was read: claims may not go beyond it. */
  verifiedVia: "PUBMED_ABSTRACT";
  verifiedAt: string;
};

/** Which coach's reasoning a claim primarily serves. Shared evidence, different lens. */
export type ClaimLens = "PERFORMANCE" | "DIETARY";

export type KnowledgeClaim = {
  claim: string;
  claimType: KnowledgeClaimType;
  evidenceStrength: EvidenceStrength;
  stance: ClaimStance;
  outcome: string;
  population: string;
  context: string;
  conditions: string[];
  limitations: string[];
  uncertainty: string;
  sourceClass: SourceClass;
  sourceIds: string[];
  lens?: ClaimLens;
};

/** Safety contexts a topic can raise. Enforcement stays in the existing safety layers; these only select a posture. */
export type SafetyContextTag =
  | "AGE_CONTEXT" | "MEDICATION_CONTEXT" | "MEDICAL_CONTEXT" | "PREGNANCY" | "EATING_DISORDER_RISK" | "STIMULANT_RISK"
  | "HORMONAL_PED" | "EXTREME_DIET" | "SUPPLEMENT_INTERACTION" | "TREATMENT_CLAIM" | "INJURY_CONTEXT" | "ALLERGY_CONTEXT" | "SYMPTOM_CONTEXT";

/** What a supplement's usefulness depends on. Unknown dependencies are what the coach asks about. */
export type NeedDependency = "PROTEIN_INTAKE" | "FISH_INTAKE" | "DIET_QUALITY" | "LAB_STATUS" | "SWEAT_LOSS" | "SLEEP_AND_STIMULANT_LOAD";

export type SupplementCategory = "ERGOGENIC" | "PROTEIN_SOURCE" | "AMINO_ACID" | "ESSENTIAL_NUTRIENT" | "HERBAL" | "CONNECTIVE_TISSUE" | "OTHER";

/** Facts about a supplement that are not claims: what it is, what its value depends on. Never a final answer. */
export type SupplementProfile = {
  category: SupplementCategory;
  dependsOn: NeedDependency[];
  /** Its job is already done by this, when present. */
  redundantWith?: "ADEQUATE_COMPLETE_PROTEIN";
  /** A record whose contents include all of this one (BCAA ⊂ EAA): never ranked above it without a stated reason. */
  subsetOf?: string;
  /** Considered when the user asks an open "what should I take" question. */
  baseline: boolean;
};

export type KnowledgeRecord = {
  id: string;
  topic: string;
  domain: KnowledgeDomain;
  claims: KnowledgeClaim[];
  contraindicationTags: SafetyContextTag[];
  /** Folded (lower-case, no diacritics) terms that select this record. */
  retrievalTags: string[];
  /** Source ids in the registry. Every claim's sourceIds must be a subset. */
  sources: string[];
  version: number;
  /** Human review date. Absent = abstract-verified only, not yet reviewed by a person. */
  reviewedAt?: string;
  supplement?: SupplementProfile;
  identity?: Identity;
  /** Folded names that ARE this entity (exact alias, abbreviation, true synonym). Only these bind `identity`. */
  aliases?: string[];
  /** Different entities this record's retrieval tags reach (sibling, symptom, product class, drug). Never inherit `identity`. */
  related?: RelatedEntity[];
};

/** Anything a DEFINE answer can be about: a record, a gap, or a related entity with its own identity. */
export type DefinedEntity = { topic: string; aliases?: string[]; identity?: Identity };

/** A term retrieval routes to a parent topic but that is not the parent: it carries its own identity. */
export type RelatedEntity = { topic: string; aliases: string[]; identity: Identity };

/**
 * What a topic IS — a deterministic internal definition, never a benefit, dose or effect. Grounds a DEFINE answer
 * independently of the evidence for any claim about it: a known identity is not a proven benefit.
 */
export type Identity = { en: string; vi: string };

/** Whether a DEFINE answer can be grounded. Separate from EntityStatus: recognising a name is not knowing what it is. */
export type IdentityGrounding = "GROUNDED" | "PARTIAL" | "ABSENT" | "NOT_ASSESSED";

/** A topic the project deliberately has NO canonical knowledge for. It must lower certainty, never be filled from model memory. */
export type KnowledgeGap = { topic: string; domain: KnowledgeDomain; retrievalTags: string[]; reason: string;
  /** Set for hormonal products: a marketed "booster" downgrades the claim, a PED drug is outside coaching scope. */
  boundary?: "HORMONAL_BOOSTER" | "PED_DRUG";
  /** A gap has no verified benefit evidence, but what it is can still be defined. */
  identity?: Identity;
  aliases?: string[];
  related?: RelatedEntity[];
  /** What its usefulness depends on (an essential mineral: intake adequacy). A fact about need, never a benefit claim. */
  dependsOn?: NeedDependency[];
};

export type KnowledgeState = "CANONICAL_KNOWLEDGE_AVAILABLE" | "RETRIEVAL_REQUIRED" | "KNOWLEDGE_INSUFFICIENT";

/** Whether a retrieval call ran. Empty search is SUCCESS + no coverage, not FAILED. */
export type RetrievalStatus = "NOT_REQUESTED" | "SUCCESS" | "PARTIAL" | "FAILED";

/** What the search covered. NO_MATCH is not a finding that evidence does not exist. */
export type EvidenceCoverage = "DIRECT" | "INDIRECT" | "NO_MATCH_IN_SEARCHED_CORPUS" | "NOT_ASSESSED";

/** Conclusion for one claim scope. UNKNOWN is not INSUFFICIENT and not a refutation. */
export type EvidenceConclusion = "SUPPORTED" | "LIMITED" | "CONFLICTING" | "INSUFFICIENT" | "UNKNOWN";

/** RELATED_TOPIC = retrieval reached registry topics, but the question names none of them by an alias. */
export type EntityStatus = "KNOWN" | "RELATED_TOPIC" | "UNKNOWN_ENTITY" | "AMBIGUOUS_ENTITY" | "VARIANT_REQUIRED" | "NOT_ASSESSED";

export type KnowledgeResolution = {
  /** null = the turn asks nothing the knowledge layer covers or knows it lacks. */
  state: KnowledgeState | null;
  records: KnowledgeRecord[];
  gaps: KnowledgeGap[];
  /** An open "what should I take" request with no supplement named. */
  openSupplementRequest: boolean;
  /** Why retrieval is (not) warranted. Tokens only. */
  retrievalReasons: string[];
  retrievalStatus?: RetrievalStatus;
  coverage?: EvidenceCoverage;
  /** Turn-level summary only. Per-claim conclusions stay on each claim via claimEvidenceScopes. */
  evidenceConclusion?: EvidenceConclusion;
  entityStatus?: EntityStatus;
  /** Named products in the question that matched no record and no gap. */
  unresolvedEntities?: string[];
  /** GROUNDED = every named entity has an identity; PARTIAL = a canonical record without one; ABSENT = none can be defined. */
  identityGrounding?: IdentityGrounding;
  /** Entities the question names by alias, in question order. Retrieval matches (records/gaps) are a separate, broader set. */
  identityMatches?: DefinedEntity[];
  /** What a "best / what should I take" request is FOR. null = no outcome named. When set, records are scoped to it. */
  requestedOutcome?: RequestedOutcome | null;
  /** Who the RELEVANT retrieved documents studied. Relevant is not applicable: a mouse study is never direct human support. */
  populationApplicability?: TurnApplicability;
  /** A decision over options (rank / buy / skip / worth it), with the explicit candidate set when the user gave one. */
  candidateRequest?: CandidateRequest | null;
};

/* ---------- candidate decisions (rank / buy / skip) ---------- */

/** What the user wants decided about a set of options. EDUCATION ("what is X") is none of these. */
export type DecisionTask = "RANK" | "BUY" | "SKIP" | "WORTH_IT" | "NECESSARY";

/**
 * What the ranking is BY. Never assumed to be generic evidence strength. PERSONAL = "for me"; PURCHASE = what to buy
 * first / anti-waste; LEAST_NECESSARY = what to skip first; OUTCOME = a named outcome ("for chest growth").
 * UNSPECIFIED = nothing says what decides the order.
 */
export type RankingCriterion = "PERSONAL" | "PURCHASE" | "LEAST_NECESSARY" | "HYPERTROPHY" | "PERFORMANCE" | "GENERAL_HEALTH" | "OUTCOME" | "UNSPECIFIED";

/** One option the user named. `entity` = the registry topic it binds to by alias; absent = not in the registry. */
export type Candidate = { label: string; entity?: string; terms: string[] };

export type CandidateRequest = {
  task: DecisionTask;
  /** Distinct, in the user's order. Empty = a purchase / skip decision with no list ("which supps should I buy"). */
  candidates: Candidate[];
  criterion: RankingCriterion;
  /** The criterion's own words ("pre-workout", "chest growth"), when the user gave one. */
  criterionPhrase: string | null;
  /** "for me", "my", "should I": the answer claims to be about this person. */
  personal: boolean;
  /** "I don't want to waste money", "things I don't need": optimise for not buying. */
  antiWaste: boolean;
  /** "exact order", "from 1 to 8". */
  exactOrderRequested: boolean;
};

/** Priority for one candidate. Tier reuses OptionTier; NOT_ASSESSED = outside the registry, ranked on coaching practice. */
export type CandidatePriority = {
  candidate: string;
  entity: string | null;
  tier: OptionTier | "NOT_ASSESSED";
  reasons: string[];
  /** Facts that would move it up / down. Plain phrases, for the prompt and for structured rendering. */
  movesUp: string[];
  movesDown: string[];
};

export type CandidateDecision = {
  request: CandidateRequest;
  /** Every requested candidate, in priority order (most worth it first; least necessary first for LEAST_NECESSARY). */
  priorities: CandidatePriority[];
  /** False when an order depends on unknown context or ties inside a tier: give priority classes, not a 1..N list. */
  exactOrderJustified: boolean;
  /** At least one tier depends on a fact this user has not given. */
  dependsOnUnknown: boolean;
};

/** One retrieved document's study population. UNKNOWN = not determinable from what was retrieved; never guessed. */
export type StudyPopulation = "HUMAN_RELEVANT" | "ANIMAL_PRECLINICAL" | "IN_VITRO" | "MIXED" | "UNKNOWN";
/** The turn's retrieved evidence as a whole. PRECLINICAL_ONLY = animal/cell only: background, not support for a human claim. */
export type TurnApplicability = "HUMAN_RELEVANT" | "MIXED" | "PRECLINICAL_ONLY" | "UNKNOWN" | "NOT_ASSESSED";

/** What kind of thing the user asks to have picked. UNSPECIFIED = "what should I do for X". */
export type TargetClass = "SUPPLEMENT" | "EXERCISE" | "FOOD" | "UNSPECIFIED";

/**
 * The outcome a recommendation request names ("best supplement for sleep" → SUPPLEMENT × "sleep"). A best request is
 * not automatically a ranking: the outcome decides which claims may support a pick, and a health-sensitive outcome
 * (symptom, organ, lab marker, hormone) is not resolved by naming it.
 */
export type RequestedOutcome = {
  /** PICK = "best X for Y" / "what should I take for Y"; EFFECT = "does X reduce Y?" (an evidence question about a named entity). */
  ask: "PICK" | "EFFECT";
  phrase: string;
  targetClass: TargetClass;
  healthSensitive: boolean;
};

/**
 * Whether a recommendation request may be answered with a pick. One decision, derived from outcome, evidence and
 * safety posture. CAN_RANK = a scoped pick is allowed; CAN_EDUCATE = explain candidates, no winner;
 * NEEDS_CLARIFICATION = the outcome is health-sensitive or unresolved; OUTSIDE_AUTHORITY = safety owns the turn.
 * Comparison of named entities stays with the COMPARE obligation; personalisation with option tiers + missingContext.
 */
export type RecommendationEligibility = "NOT_REQUESTED" | "CAN_RANK" | "CAN_EDUCATE" | "NEEDS_CLARIFICATION" | "OUTSIDE_AUTHORITY";
export type RecommendationDecision = { eligibility: RecommendationEligibility; reasons: string[] };

/** How a claim relates to what was asked: DIRECT = about the asked entity/outcome; BACKGROUND = general framing only. */
export type ClaimSupport = "DIRECT" | "BACKGROUND";

/** One claim's evidence scope: what it is about, which sources back it. The claim ↔ source linkage sources are shown from. */
export type ClaimEvidenceScope = {
  recordId: string;
  entity: string;
  outcome: string;
  population: string;
  context: string;
  conclusion: EvidenceConclusion;
  support: ClaimSupport;
  sourceIds: string[];
};

/* ---------- conversation control ---------- */

export type ResponseLanguage = "EN" | "VI" | "MATCH_USER";
export type ControlTone = "INFORMAL" | "NEUTRAL" | "FORMAL";
export type ControlVerbosity = "CONCISE" | "NORMAL" | "DETAILED";
export type AssistantFeedback = "NONE" | "CRITICISM" | "FRUSTRATION" | "STYLE_CONTROL";

export type ConversationControl = {
  responseLanguage: ResponseLanguage;
  /** CURRENT_TURN outranks PERSISTED (an earlier explicit request still in force). */
  languageSource: "CURRENT_TURN" | "PERSISTED" | "NONE";
  tone: ControlTone;
  verbosity: ControlVerbosity;
  /** Forms of address the user asked the coach to stop using ("bro"). */
  addressBans: string[];
  userCorrection: { present: boolean; restatement: string | null };
  assistantFeedback: AssistantFeedback;
  /** The message carries only control/feedback and no new question of its own. */
  controlOnly: boolean;
};

/* ---------- need + recommendation policy ---------- */

export type Tri = "YES" | "NO" | "UNKNOWN";
export type AgeBand = "MINOR" | "YOUNG_ADULT" | "ADULT" | "UNKNOWN";

/** What is known about the person that changes a recommendation. USER_STATED never outranks canonical state. */
export type NeedContext = {
  ageYears: number | null;
  ageBand: AgeBand;
  goal: string | null;
  proteinAdequate: Tri;
  lowFishIntake: Tri;
  poorDiet: Tri;
  medication: boolean;
  medicalCondition: boolean;
  pregnancy: boolean;
  poorSleep: Tri;
  highStimulantUse: Tri;
  heavySweatLoss: Tri;
};

/** Facts the caller already holds from canonical state. All optional; absent = unknown. */
export type AthleteFacts = {
  goal?: string | null;
  ageYears?: number | null;
  avgSleepHours?: number | null;
  /** From the canonical nutrition authority only. */
  proteinTargetG?: number | null;
  proteinLoggedTodayG?: number | null;
};

export type OptionTier = "HIGH_UTILITY" | "CONDITIONAL" | "LOW_VALUE" | "OUTSIDE_SCOPE";

export type SupplementOption = {
  recordId: string;
  topic: string;
  tier: OptionTier;
  /** Token reasons for the tier, e.g. "redundant_with_adequate_protein", "depends_on:FISH_INTAKE:unknown". */
  reasons: string[];
};

export type SafetyDecision =
  | "ALLOW" | "ALLOW_WITH_CONTEXT" | "CLARIFY" | "DOWNGRADE_CLAIM" | "DEFER_TO_SPECIALIST" | "MEDICAL_ESCALATION" | "HARD_STOP";

export type SafetyPosture = {
  decision: SafetyDecision;
  contexts: SafetyContextTag[];
  /** Execution rules for the reply, not disclaimers. */
  directives: string[];
  /** True when no dose, timing, stack or cycle may be stated. */
  noDosing: boolean;
  /** What a hormonal/drug-product turn asks for; null/absent when the turn is not about one. */
  substanceIntent?: SubstanceIntent | null;
};

export type RestrictedSubstanceUse = "USE_OPTIMIZATION" | "SOURCING" | "EVASION";
/** INTENT_RISK of a hormonal/drug-product turn. The product (ENTITY_RISK) is the knowledge gap's boundary, not this. */
export type SubstanceIntentClass = "INFORMATION" | RestrictedSubstanceUse | "SYMPTOM_OR_ADVERSE_EFFECT" | "CESSATION_OR_CHANGE" | "MIXED" | "AMBIGUOUS";
/** What a use-optimisation ask targets (H0 cluster B): the targeted refusal and its safe continuation are written per facet. */
export type OptimizationFacet = "DOSING" | "SUPPORT_SUPPLEMENTS" | "ORGAN_PROTECTION" | "SIDE_EFFECTS" | "TRAINING" | "NUTRITION" | "PCT" | "GENERAL";
export type SubstanceIntent = { intentClass: SubstanceIntentClass; restricted: RestrictedSubstanceUse[]; information: boolean; symptom: boolean; cessation: boolean; facets?: OptimizationFacet[]; rankingWithPed?: boolean };

export type IntelligenceBrief = {
  coach: Coach;
  control: ConversationControl;
  knowledge: KnowledgeResolution;
  need: NeedContext;
  options: SupplementOption[];
  /** Context that would change the answer and is still unknown. At most two are worth asking. */
  missingContext: NeedDependency[];
  posture: SafetyPosture;
  /** True when the topic belongs to the other coach: answer the concept, leave the specialist work to them. */
  otherCoachOwns: boolean;
  recommendation: RecommendationDecision;
  /** Present on a rank / buy / skip turn: the structured per-candidate decision (Batch C renders from this). */
  candidates?: CandidateDecision | null;
  /** The words of the turn this brief was built for (integrity checks judge topic relevance on them). */
  message?: string;
  /** H0 cluster A: what the user said earlier in this chat that still matters (user-authored, bounded). */
  context: import("./context-working-set").ContextWorkingSet;
  /** Compact prompt block. Empty string when there is nothing to add. */
  promptBlock: string;
};

export type IntegrityCode =
  | "LANGUAGE_CONTROL" | "ADDRESS_BAN" | "LOW_VALUE_RECOMMENDED" | "NECESSITY_OVERCLAIM" | "CERTAINTY_EXCEEDS_EVIDENCE"
  | "DOSE_UNDER_NO_DOSING" | "TREATMENT_CLAIM" | "UNVERIFIED_BENEFIT" | "NEED_BEFORE_USE" | "RANKING_NOT_ELIGIBLE"
  | "CLAIM_SCOPE_BROADENED" | "SAFE_CONTINUATION_MISSING"
  | "CANDIDATE_OMITTED" | "UNCONDITIONAL_PRIORITY" | "RANKING_ORDER_UNSUPPORTED" | "RANKING_CRITERION_MISSING"
  | "TIER_PROSE_CONTRADICTION" | "NEGATIVE_CLAIM_UNSUPPORTED" | "RECOMMENDED_UNDER_BOUNDARY" | "INJURY_SITE_LOADED" | "CONTEXT_FACT_IGNORED"
  | "ALLERGEN_RECOMMENDED" | "LOW_INTAKE_LOAD_ENDORSED";

export type IntegrityViolation = { code: IntegrityCode; detail: string };
