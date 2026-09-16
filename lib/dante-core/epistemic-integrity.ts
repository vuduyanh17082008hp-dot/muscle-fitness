/**
 * Phase 2 epistemic integrity — deterministic provenance, causal
 * humility, citation alignment, and persistence honesty.
 *
 * Application-enforced (not prompt-only). The LLM may interpret;
 * these helpers decide what may be treated as verified fact, what
 * may update learned strategies, and which citations may attach.
 */

import type { DanteMemory } from "@/lib/dante-core/memory";
import type { OutcomeClass } from "@/lib/dante-core/recommendation-outcome";
import {
  MIN_SAMPLES_FOR_PATTERN,
  POLICY_PROMOTION_CONFIDENCE,
  type DanteLearnedPattern,
} from "@/lib/dante-core/memory-hierarchy/types";

export type EpistemicClass =
  | "VERIFIED_CURRENT_STATE"
  | "VERIFIED_STORED_MEMORY"
  | "DIRECT_USER_STATEMENT"
  | "USER_ASSERTED_PAST_MEMORY"
  | "INFERRED_PATTERN"
  | "EXTERNAL_EVIDENCE"
  | "UNVERIFIED_CLAIM"
  | "LEARNED_STRATEGY_EVIDENCE";

export type VerifiedMemorySnapshot = {
  preferredExercises: string[];
  dislikedExercises: string[];
  weakPointPriorities: string[];
  coachingPreference: string | null;
  /** Explicitly verified physiological/tolerance facts — empty unless a real store provides them. */
  verifiedToleranceClaims: string[];
};

export type MemoryClaimCheck = {
  userAssertedPastMemory: boolean;
  personalizedPhysiologicalClaim: boolean;
  /** User asserts prior personal performance success (e.g. 1RM under similar conditions). */
  unverifiedPriorPerformanceClaim: boolean;
  hasMatchingVerifiedMemory: boolean;
  mayStateAsVerifiedFact: boolean;
  epistemicClass: EpistemicClass;
  reason: string;
};

export type MemoryWriteKind =
  | "preference"
  | "observation"
  | "causal_belief"
  | "physiological_tolerance"
  | "none";

export type MemoryWriteAuthorization = {
  allowed: boolean;
  kind: MemoryWriteKind;
  mayClaimPersistence: boolean;
  reason: string;
};

export type ConfounderSignals = {
  sleepChangedHours: number | null;
  calorieChangeKcal: number | null;
  stressDecreased: boolean | null;
  volumeChangePercent: number | null;
  intensityChanged: boolean | null;
  otherMeaningfulChanges: string[];
};

export type OutcomeDimensions = {
  recoveryDelta: number | null;
  performanceDeltaPercent: number | null;
  adherenceDelta: number | null;
  painIncreased: boolean | null;
};

export type CausalEvaluation = {
  outcomeClass: OutcomeClass | "UNCERTAIN";
  confounderCount: number;
  causalConfidenceDelta: number;
  mayMarkSuccessfulStrategy: boolean;
  mayCreateAutomaticPolicy: boolean;
  reasons: string[];
};

export type CitationCandidate = {
  type: string;
  title: string;
  url: string;
};

export type PersistenceClaimKind =
  | "remember"
  | "update_profile"
  | "auto_apply"
  | "learned";

const ASSERTED_PAST_MEMORY_PATTERNS: RegExp[] = [
  /\b(you|dante)\s+(told|said|mentioned|recommended)\b/i,
  /\b(l[aâ]n\s+tr[uư][oớ]c|tr[uư][oớ]c\s+[dđ][aâ]y).{0,40}\b(b[aạ]n|dante)\s+(n[oó]i|b[aả]o|khuy[eê]n)\b/i,
  /\bi\s+(remember|recall)\s+you\b/i,
  /\bt[oô]i\s+(nh[oớ]|nh[ớo])\s+(b[aạ]n|dante)\b/i,
  /\byou\s+(previously|once|earlier)\s+(said|told|mentioned)\b/i,
  /\bas\s+you\s+(said|told|mentioned)\s+before\b/i,
];

const PHYSIOLOGICAL_PERSONAL_PATTERNS: RegExp[] = [
  /\b(caffeine|creatine|stimulant|pre-?workout)\b.{0,40}\b(tolerat|fine|ok|okay|no problem|safe for me)\b/i,
  /\b(tolerat|ch[iị]u\s+[dđ][uư][oợ]c).{0,40}\b(caffeine|cafein|caffein)\b/i,
  /\b\d{2,4}\s*mg\b.{0,30}\b(caffeine|cafein|no problem|fine|ok)\b/i,
  /\b(injury|pain|medication|drug|steroid|clen|sarms?)\b.{0,40}\b(tolerat|safe for me|ok for me)\b/i,
  /\b(sleep\s+deprivation|4\s*hours?\s+sleep).{0,40}\b(tolerat|can still|fine)\b/i,
  /\b(calorie|calories|deficit).{0,40}\b(tolerat|fine for me)\b/i,
];

/** User asserts THEY previously succeeded at a max effort / similar conditions. */
const PRIOR_PERFORMANCE_CLAIM_PATTERNS: RegExp[] = [
  /\b(i|I've|i've|we)\s+(previously|once|before|earlier).{0,40}\b(1\s*rm|one[- ]rep|pr|personal record|succeeded|successful)\b/i,
  /\b(1\s*rm|one[- ]rep).{0,50}\b(before|previously|last time|under similar|same conditions)\b/i,
  /\b(l[aâ]n\s+tr[uư][oớ]c).{0,40}\b(1\s*rm|test).{0,30}\b(th[aà]nh\s+c[oô]ng|thanh cong)\b/i,
  /\bc[uứ]\s+coi\s+[dđ][oó]\s+l[aà]\s+b[aằ]ng\s+ch[uứ]ng\b/i,
  /\bcoi\s+[dđ][oó]\s+l[aà]\s+b[aằ]ng\s+ch[uứ]ng\b/i,
  /\btreat\s+that\s+as\s+(evidence|proof)\b/i,
  /\bif\s+.{0,40}(successful|succeeded).{0,40}(similar|same).{0,20}(condition|before)\b/i,
];

const PREFERENCE_PATTERNS: RegExp[] = [
  /\bi\s+(want|prefer|like)\s+you\s+to\b/i,
  /\bprefer\s+(reducing|reduce|shorter|volume)\b/i,
  /\bt[oô]i\s+mu[oố]n\s+b[aạ]n\b/i,
  /\buser\s+prefer/i,
];

const CAUSAL_SUCCESS_REMEMBER_PATTERNS: RegExp[] = [
  /\b(remember|note|update).{0,40}\b(worked|effective|successful|hi[eệ]u\s+qu[aả]|th[aà]nh\s+c[oô]ng)\b/i,
  /\bch[iỉ]\s+nh[ớo]\s+l[aà].{0,40}\b(hi[eệ]u\s+qu[aả]|worked|effective)\b/i,
  /\bonly\s+remember\s+that.{0,40}\b(worked|effective|successful)\b/i,
  /\bgi[aả]m\s+volume\s+[dđ][aã]\s+hi[eệ]u\s+qu[aả]\b/i,
];

const MEANINGFUL_SLEEP_HOURS = 1;
const MEANINGFUL_CALORIE_DELTA = 200;
const MEANINGFUL_VOLUME_PERCENT = 10;

export function toVerifiedMemorySnapshot(memory: DanteMemory | null | undefined): VerifiedMemorySnapshot {
  if (!memory) {
    return {
      preferredExercises: [],
      dislikedExercises: [],
      weakPointPriorities: [],
      coachingPreference: null,
      verifiedToleranceClaims: [],
    };
  }

  return {
    preferredExercises: memory.preferredExercises ?? [],
    dislikedExercises: memory.dislikedExercises ?? [],
    weakPointPriorities: memory.weakPointPriorities ?? [],
    coachingPreference: memory.coachingPreference,
    // Preference store has no physiological tolerance fields by design.
    verifiedToleranceClaims: [],
  };
}

export function detectsUserAssertedPastMemory(message: string): boolean {
  return ASSERTED_PAST_MEMORY_PATTERNS.some((pattern) => pattern.test(message));
}

export function detectsPersonalizedPhysiologicalClaim(message: string): boolean {
  return PHYSIOLOGICAL_PERSONAL_PATTERNS.some((pattern) => pattern.test(message));
}

export function detectsUnverifiedPriorPerformanceClaim(message: string): boolean {
  return PRIOR_PERFORMANCE_CLAIM_PATTERNS.some((pattern) => pattern.test(message));
}

export function detectsPreferenceRequest(message: string): boolean {
  return PREFERENCE_PATTERNS.some((pattern) => pattern.test(message));
}

export function detectsCausalSuccessRememberRequest(message: string): boolean {
  return CAUSAL_SUCCESS_REMEMBER_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Deterministic provenance check: a user asserting that Dante previously
 * said X is USER_ASSERTED_PAST_MEMORY, not VERIFIED_STORED_MEMORY, unless
 * a matching verified fact exists in the preference/tolerance snapshot.
 */
export function checkMemoryClaimProvenance(input: {
  message: string;
  verifiedMemory: VerifiedMemorySnapshot;
  claimKeywords?: string[];
  /** Optional verified prior performance facts (e.g. logged successful 1RM). */
  verifiedPriorPerformanceClaims?: string[];
}): MemoryClaimCheck {
  const userAssertedPastMemory = detectsUserAssertedPastMemory(input.message);
  const personalizedPhysiologicalClaim = detectsPersonalizedPhysiologicalClaim(input.message);
  const priorPerformanceClaim = detectsUnverifiedPriorPerformanceClaim(input.message);

  const keywords =
    input.claimKeywords ??
    extractClaimKeywords(input.message);

  const hasMatchingVerifiedMemory = keywords.some((keyword) =>
    memoryContainsKeyword(input.verifiedMemory, keyword),
  );

  const verifiedPrior = (input.verifiedPriorPerformanceClaims ?? []).some((claim) => {
    const lower = claim.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
  });

  if (personalizedPhysiologicalClaim && !hasMatchingVerifiedMemory) {
    return {
      userAssertedPastMemory,
      personalizedPhysiologicalClaim,
      unverifiedPriorPerformanceClaim: priorPerformanceClaim,
      hasMatchingVerifiedMemory: false,
      mayStateAsVerifiedFact: false,
      epistemicClass: userAssertedPastMemory ? "USER_ASSERTED_PAST_MEMORY" : "UNVERIFIED_CLAIM",
      reason:
        "Personalized physiological tolerance is not present in verified stored memory.",
    };
  }

  if (priorPerformanceClaim && !verifiedPrior) {
    return {
      userAssertedPastMemory,
      personalizedPhysiologicalClaim,
      unverifiedPriorPerformanceClaim: true,
      hasMatchingVerifiedMemory: false,
      mayStateAsVerifiedFact: false,
      epistemicClass: "UNVERIFIED_CLAIM",
      reason:
        "User-asserted prior performance success is not present in verified stored evidence.",
    };
  }

  if (userAssertedPastMemory && !hasMatchingVerifiedMemory) {
    return {
      userAssertedPastMemory: true,
      personalizedPhysiologicalClaim,
      unverifiedPriorPerformanceClaim: priorPerformanceClaim,
      hasMatchingVerifiedMemory: false,
      mayStateAsVerifiedFact: false,
      epistemicClass: "USER_ASSERTED_PAST_MEMORY",
      reason: "User asserted a past Dante memory that is not verified in stored memory.",
    };
  }

  if (hasMatchingVerifiedMemory || verifiedPrior) {
    return {
      userAssertedPastMemory,
      personalizedPhysiologicalClaim,
      unverifiedPriorPerformanceClaim: false,
      hasMatchingVerifiedMemory: true,
      mayStateAsVerifiedFact: true,
      epistemicClass: "VERIFIED_STORED_MEMORY",
      reason: "Matching verified stored memory exists.",
    };
  }

  return {
    userAssertedPastMemory,
    personalizedPhysiologicalClaim,
    unverifiedPriorPerformanceClaim: priorPerformanceClaim,
    hasMatchingVerifiedMemory: false,
    mayStateAsVerifiedFact: false,
    epistemicClass: "DIRECT_USER_STATEMENT",
    reason: "Treat as current-turn user statement unless verified elsewhere.",
  };
}

function extractClaimKeywords(message: string): string[] {
  const keywords: string[] = [];
  const lower = message.toLowerCase();
  for (const token of [
    "caffeine",
    "cafein",
    "creatine",
    "fasted",
    "1rm",
    "bench",
    "volume",
    "recovery",
    "protein",
  ]) {
    if (lower.includes(token)) keywords.push(token);
  }
  const mg = message.match(/\b(\d{2,4})\s*mg\b/i);
  if (mg) keywords.push(`${mg[1]}mg`);
  return keywords;
}

function memoryContainsKeyword(memory: VerifiedMemorySnapshot, keyword: string): boolean {
  const haystacks = [
    ...memory.preferredExercises,
    ...memory.dislikedExercises,
    ...memory.weakPointPriorities,
    memory.coachingPreference ?? "",
    ...memory.verifiedToleranceClaims,
  ]
    .join(" ")
    .toLowerCase();
  return haystacks.includes(keyword.toLowerCase());
}

export function countMeaningfulConfounders(signals: ConfounderSignals): number {
  let count = 0;
  if (
    signals.sleepChangedHours !== null &&
    Math.abs(signals.sleepChangedHours) >= MEANINGFUL_SLEEP_HOURS
  ) {
    count += 1;
  }
  if (
    signals.calorieChangeKcal !== null &&
    Math.abs(signals.calorieChangeKcal) >= MEANINGFUL_CALORIE_DELTA
  ) {
    count += 1;
  }
  if (signals.stressDecreased === true) count += 1;
  if (
    signals.volumeChangePercent !== null &&
    Math.abs(signals.volumeChangePercent) >= MEANINGFUL_VOLUME_PERCENT
  ) {
    count += 1;
  }
  if (signals.intensityChanged === true) count += 1;
  count += signals.otherMeaningfulChanges.length;
  return count;
}

/**
 * Classify multi-dimensional outcomes with causal humility.
 * Confounders reduce causal confidence; mixed metrics block SUCCESS.
 */
export function evaluateCausalOutcome(input: {
  dimensions: OutcomeDimensions;
  confounders: ConfounderSignals;
  /** When true, volumeChangePercent is treated as the intervention, not a confounder. */
  interventionIsVolumeReduction?: boolean;
  userDemandsSuccess?: boolean;
  userDemandsAutoPolicy?: boolean;
}): CausalEvaluation {
  const reasons: string[] = [];
  const confounderCount = countMeaningfulConfounders({
    ...input.confounders,
    volumeChangePercent: input.interventionIsVolumeReduction
      ? null
      : input.confounders.volumeChangePercent,
  });

  // Explicitly count sleep/calories/stress/other already; if intervention
  // is volume reduction, also note co-occurring non-intervention changes.
  if (
    input.interventionIsVolumeReduction &&
    input.confounders.volumeChangePercent !== null &&
    Math.abs(input.confounders.volumeChangePercent) >= MEANINGFUL_VOLUME_PERCENT
  ) {
    reasons.push("Volume changed as the nominated intervention.");
  }

  if (confounderCount > 0) {
    reasons.push(`${confounderCount} meaningful confounder(s) co-changed in the outcome window.`);
  }

  const recoveryImproved =
    input.dimensions.recoveryDelta !== null && input.dimensions.recoveryDelta >= 5;
  const recoveryWorsened =
    input.dimensions.recoveryDelta !== null && input.dimensions.recoveryDelta <= -5;
  const performanceImproved =
    input.dimensions.performanceDeltaPercent !== null &&
    input.dimensions.performanceDeltaPercent >= 2;
  const performanceWorsened =
    input.dimensions.performanceDeltaPercent !== null &&
    input.dimensions.performanceDeltaPercent <= -2;

  let outcomeClass: CausalEvaluation["outcomeClass"] = "UNKNOWN";

  if (input.dimensions.recoveryDelta === null && input.dimensions.performanceDeltaPercent === null) {
    outcomeClass = "UNKNOWN";
    reasons.push("Insufficient outcome metrics.");
  } else if (recoveryImproved && performanceWorsened) {
    outcomeClass = "PARTIAL_SUCCESS";
    reasons.push("Mixed outcome: recovery improved while performance declined.");
  } else if (recoveryImproved && performanceImproved && confounderCount === 0) {
    outcomeClass = "SUCCESS";
    reasons.push("Aligned positive metrics without detected confounders.");
  } else if (recoveryImproved && confounderCount > 0) {
    outcomeClass = "UNCERTAIN";
    reasons.push("Positive recovery change is confounded; causal attribution withheld.");
  } else if (recoveryWorsened || (performanceWorsened && !recoveryImproved)) {
    outcomeClass = "FAILURE";
    reasons.push("Primary metrics moved unfavorably.");
  } else if (
    input.dimensions.recoveryDelta !== null &&
    Math.abs(input.dimensions.recoveryDelta) < 5 &&
    (input.dimensions.performanceDeltaPercent === null ||
      Math.abs(input.dimensions.performanceDeltaPercent) < 2)
  ) {
    outcomeClass = "NEUTRAL";
    reasons.push("Changes were within noise thresholds.");
  } else if (recoveryImproved) {
    outcomeClass = "PARTIAL_SUCCESS";
    reasons.push("Recovery improved; supporting metrics incomplete.");
  } else {
    outcomeClass = "UNCERTAIN";
    reasons.push("Outcome cannot be cleanly attributed.");
  }

  if (input.userDemandsSuccess) {
    reasons.push("User pressure to mark success ignored for epistemic classification.");
  }
  if (input.userDemandsAutoPolicy) {
    reasons.push("User pressure for automatic future policy ignored.");
  }

  let causalConfidenceDelta = 0;
  if (outcomeClass === "SUCCESS" && confounderCount === 0) {
    causalConfidenceDelta = 0.08;
  } else if (outcomeClass === "PARTIAL_SUCCESS" && confounderCount === 0) {
    causalConfidenceDelta = 0.03;
  } else if (outcomeClass === "UNCERTAIN" || confounderCount > 0) {
    causalConfidenceDelta = 0;
  } else if (outcomeClass === "FAILURE") {
    causalConfidenceDelta = -0.08;
  }

  const mayMarkSuccessfulStrategy = outcomeClass === "SUCCESS" && confounderCount === 0;

  // Even clean SUCCESS from one event cannot create automatic policy.
  const mayCreateAutomaticPolicy = false;

  return {
    outcomeClass,
    confounderCount,
    causalConfidenceDelta,
    mayMarkSuccessfulStrategy,
    mayCreateAutomaticPolicy,
    reasons,
  };
}

/**
 * Strategy / automatic-policy promotion gate. One observation is never enough.
 */
export function canPromoteAutomaticPolicy(input: {
  pattern: Pick<DanteLearnedPattern, "sampleCount" | "confidence" | "status" | "tier"> | null;
  causal: CausalEvaluation;
}): { allowed: boolean; reason: string } {
  if (input.causal.mayCreateAutomaticPolicy !== false && input.causal.confounderCount > 0) {
    return { allowed: false, reason: "Confounded evidence cannot create automatic policy." };
  }

  if (!input.pattern) {
    return { allowed: false, reason: "No learned pattern exists yet." };
  }

  if (input.pattern.status === "forgotten" || input.pattern.status === "demoted") {
    return { allowed: false, reason: "Pattern is not active." };
  }

  if (input.pattern.sampleCount < MIN_SAMPLES_FOR_PATTERN) {
    return {
      allowed: false,
      reason: `Need at least ${MIN_SAMPLES_FOR_PATTERN} comparable observations before policy promotion.`,
    };
  }

  if (input.pattern.confidence < POLICY_PROMOTION_CONFIDENCE) {
    return {
      allowed: false,
      reason: `Confidence ${input.pattern.confidence} is below policy threshold ${POLICY_PROMOTION_CONFIDENCE}.`,
    };
  }

  if (input.causal.confounderCount > 0 || input.causal.outcomeClass === "UNCERTAIN") {
    return { allowed: false, reason: "Latest evidence is confounded or uncertain." };
  }

  if (input.causal.outcomeClass !== "SUCCESS") {
    return { allowed: false, reason: "Latest outcome is not a clean SUCCESS." };
  }

  // Even when thresholds are met, Phase 2 epistemic integrity forbids
  // one-shot permanent auto-rules of the form "always when recovery < 50".
  // Promotion to an actionable *policy candidate* still requires the
  // autonomy/orchestrator path — this helper never authorizes blind auto-apply.
  return {
    allowed: false,
    reason:
      "Automatic threshold policies are not created from learning events; re-evaluate current state each time.",
  };
}

/**
 * Citations must support the *specific claim class* and topic.
 * Generic pharmacology cannot verify personalized tolerance.
 * Food-database hits must not attach to training/outcome questions
 * merely because the word "recovery" overlaps.
 */
export function filterCitationsForClaim(input: {
  message: string;
  sources: CitationCandidate[];
  memoryCheck: MemoryClaimCheck;
}): CitationCandidate[] {
  const relevanceFiltered = filterCitationsByTopicRelevance({
    message: input.message,
    sources: input.sources,
  });

  const personalized =
    input.memoryCheck.personalizedPhysiologicalClaim ||
    (input.memoryCheck.userAssertedPastMemory && !input.memoryCheck.hasMatchingVerifiedMemory) ||
    input.memoryCheck.unverifiedPriorPerformanceClaim;

  if (!personalized) {
    return relevanceFiltered;
  }

  // Personalized / unverified physiological or past-performance claims:
  // strip generic compound identity sources that do not establish THIS athlete.
  return relevanceFiltered.filter((source) => {
    const type = source.type.toLowerCase();
    const title = source.title.toLowerCase();
    const genericCompound =
      type.includes("pubchem") ||
      type.includes("openfda") ||
      title === "caffeine" ||
      /^caffeine\b/i.test(source.title);

    if (genericCompound) return false;

    if (!input.memoryCheck.hasMatchingVerifiedMemory) {
      return false;
    }

    return true;
  });
}

/**
 * Topic-level citation gate. Lexical overlap on "recovery" alone is
 * not enough to attach USDA food/drink rows to a training-outcome turn.
 */
export function filterCitationsByTopicRelevance(input: {
  message: string;
  sources: CitationCandidate[];
}): CitationCandidate[] {
  const lower = input.message.toLowerCase();

  // Explicit food-product / meal-planning asks only — incidental "kcal" /
  // "ăn thêm" inside an outcome narrative is NOT a food citation request.
  const asksFoodProduct =
    /\b(food|meal|recipe|usda|brand|barcode|snack|breakfast|lunch|dinner|protein powder|food log|what should i eat|macros? for)\b/i.test(
      lower,
    ) ||
    /\b(món ăn|thực phẩm|ăn gì|dinh dưỡng|bữa sáng|bữa trưa|bữa tối)\b/i.test(lower);

  const trainingOutcomeFocus =
    /\b(volume|1\s*rm|bench|sets?|reps?|training|workout|strategy|performance|recovery|sleep|stress)\b/i.test(
      lower,
    ) || /\b(giảm\s+volume|giam\s+volume)\b/i.test(lower);

  const strategyOrLearningFocus =
    /strategy|tự động|tu dong|automatically|profile|cập nhật|cap nhat|forget|quên|quen|confound|chỉ nhớ|chi nho|thành công|thanh cong/i.test(
      lower,
    );

  return input.sources.filter((source) => {
    const type = source.type.toLowerCase();
    const title = source.title.toLowerCase();
    const isFoodDb =
      type.includes("usda") ||
      type.includes("food data") ||
      type.includes("open food") ||
      type.includes("fooddata");

    if (isFoodDb) {
      if (/recovery\s*(water|drink|beverage|shake)/i.test(title) && !asksFoodProduct) {
        return false;
      }
      if ((trainingOutcomeFocus || strategyOrLearningFocus) && !asksFoodProduct) {
        return false;
      }
      if (!asksFoodProduct) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Authorize what may be persisted from a user instruction.
 * Preference ≠ causal fact. Forget-confounders cannot rewrite evidence.
 */
export function authorizeMemoryWrite(input: {
  message: string;
  causal: CausalEvaluation | null;
  persistenceSucceeded?: boolean;
}): MemoryWriteAuthorization {
  const forget = /forget\s+(sleep|calories|stress|confound)|quên\s+mấy|quen may|chỉ nhớ|chi nho|only\s+remember/i.test(
    input.message,
  );
  const wantsCausalRemember = detectsCausalSuccessRememberRequest(input.message);
  const wantsPreference = detectsPreferenceRequest(input.message) && !wantsCausalRemember;
  const confounded =
    input.causal !== null &&
    (input.causal.confounderCount > 0 ||
      input.causal.outcomeClass === "UNCERTAIN" ||
      input.causal.outcomeClass === "PARTIAL_SUCCESS" ||
      !input.causal.mayMarkSuccessfulStrategy);

  if (wantsCausalRemember && (forget || confounded || !input.causal?.mayMarkSuccessfulStrategy)) {
    return {
      allowed: true,
      kind: "preference",
      mayClaimPersistence: false,
      reason:
        "User requested causal success memory; only a preference note is eligible. Confounders/history stay intact. Do not claim persistence of effectiveness.",
    };
  }

  if (wantsPreference && !wantsCausalRemember) {
    return {
      allowed: true,
      kind: "preference",
      mayClaimPersistence: Boolean(input.persistenceSucceeded),
      reason: "Preference request may be stored separately from empirical evidence.",
    };
  }

  if (wantsCausalRemember && input.causal?.mayMarkSuccessfulStrategy && !forget) {
    return {
      allowed: false,
      kind: "causal_belief",
      mayClaimPersistence: false,
      reason:
        "Causal belief promotion requires durable learning path with clean evidence; chatbot turn cannot claim it persisted.",
    };
  }

  if (detectsPersonalizedPhysiologicalClaim(input.message)) {
    return {
      allowed: false,
      kind: "physiological_tolerance",
      mayClaimPersistence: false,
      reason: "Physiological tolerance writes require verified provenance.",
    };
  }

  return {
    allowed: false,
    kind: "none",
    mayClaimPersistence: false,
    reason: "No authorized memory write for this turn.",
  };
}

/**
 * Forget-confounders pressure must not mutate raw evidence or causal confidence.
 */
export function applyForgetConfoundersPressure<T extends Record<string, unknown>>(input: {
  rawEvidence: T;
  causal: CausalEvaluation;
}): {
  rawEvidence: T;
  causal: CausalEvaluation;
  preferenceAllowed: boolean;
  causalRewriteBlocked: boolean;
} {
  const immutability = assertRawEvidenceImmutable(input.rawEvidence, { ...input.rawEvidence });
  if (!immutability.intact) {
    // Defensive: never return mutated evidence from this helper.
  }
  return {
    rawEvidence: input.rawEvidence,
    causal: {
      ...input.causal,
      causalConfidenceDelta: Math.min(0, input.causal.causalConfidenceDelta),
      mayMarkSuccessfulStrategy: false,
      mayCreateAutomaticPolicy: false,
      reasons: [
        ...input.causal.reasons,
        "Forget-confounders request ignored for evidence rewrite; raw history preserved.",
      ],
    },
    preferenceAllowed: true,
    causalRewriteBlocked: true,
  };
}

export function persistenceClaimAllowed(input: {
  kind: PersistenceClaimKind;
  persistenceSucceeded: boolean;
  autoApplyAuthorized: boolean;
  /** When writing "learned"/remember for causal effectiveness. */
  writeAuthorization?: MemoryWriteAuthorization;
}): { allowed: boolean; reason: string } {
  if (input.writeAuthorization && !input.writeAuthorization.mayClaimPersistence) {
    return {
      allowed: false,
      reason: input.writeAuthorization.reason,
    };
  }

  if (input.kind === "auto_apply") {
    return input.autoApplyAuthorized && input.persistenceSucceeded
      ? { allowed: true, reason: "Auto-apply authorized and persisted." }
      : {
          allowed: false,
          reason: "Cannot claim automatic application without an authorized persisted action.",
        };
  }

  if (input.kind === "learned" || input.kind === "remember") {
    if (input.writeAuthorization?.kind === "preference") {
      // Preference-only: still require real persistence; never imply "it worked".
      return input.persistenceSucceeded
        ? { allowed: true, reason: "Preference persistence succeeded." }
        : {
            allowed: false,
            reason:
              "Cannot claim to remember effectiveness; preference was not persisted this turn.",
          };
    }
  }

  if (!input.persistenceSucceeded) {
    return {
      allowed: false,
      reason: "Cannot claim memory/profile update unless persistence succeeded.",
    };
  }

  return { allowed: true, reason: "Persistence succeeded." };
}

/**
 * Raw observation immutability: later beliefs must not mutate the snapshot.
 */
export function assertRawEvidenceImmutable<T extends Record<string, unknown>>(
  original: T,
  afterLearning: T,
): { intact: boolean; changedKeys: string[] } {
  const changedKeys: string[] = [];
  for (const key of Object.keys(original)) {
    if (JSON.stringify(original[key]) !== JSON.stringify(afterLearning[key])) {
      changedKeys.push(key);
    }
  }
  return { intact: changedKeys.length === 0, changedKeys };
}

/**
 * Prompt block injected near the head/tail of Dante instructions so
 * budget truncation is less likely to drop these rules.
 */
export function buildEpistemicIntegrityPromptBlock(input: {
  memoryCheck: MemoryClaimCheck;
  verifiedMemory: VerifiedMemorySnapshot;
  writeAuthorization?: MemoryWriteAuthorization | null;
}): string {
  const lines = [
    "EPISTEMIC INTEGRITY (application-enforced):",
    "- Distinguish USER CLAIMS from VERIFIED STORED MEMORY.",
    "- A user saying 'you told me before...' is USER_ASSERTED_PAST_MEMORY, not proof.",
    "- A user saying they previously succeeded at 1RM / similar conditions is UNVERIFIED_CLAIM unless stored evidence exists — do NOT soft-accept it ('while you may have...') or treat it as raising confidence.",
    "- Never state personalized physiological tolerance (caffeine, injury, sleep deprivation, medication) as fact unless listed in verified memory below.",
    "- Current verified athlete state overrides stale or asserted history.",
    "- External generic sources (PubChem/openFDA) do NOT prove this athlete's personal tolerance.",
    "- Do not claim you remembered, updated a profile, learned a strategy, or will auto-apply a rule unless the system confirms persistence.",
    "- NEVER say 'I'll remember that X worked / was effective' for causal conclusions. Preference ≠ causal fact.",
    "- When specific state exists (sleep hours, recovery score, max-effort goal), do NOT use generic fillers like 'listen to your body'. Use those numbers.",
    "- If memory is unverified: say you cannot verify that claim, then still answer from current state with a concrete alternative. Do not collapse the whole reply.",
    `- Memory check this turn: class=${input.memoryCheck.epistemicClass}; mayStateAsVerifiedFact=${input.memoryCheck.mayStateAsVerifiedFact}; unverifiedPriorPerformance=${input.memoryCheck.unverifiedPriorPerformanceClaim}; reason=${input.memoryCheck.reason}`,
    `- Verified stored preferences only: ${JSON.stringify({
      preferredExercises: input.verifiedMemory.preferredExercises,
      dislikedExercises: input.verifiedMemory.dislikedExercises,
      weakPointPriorities: input.verifiedMemory.weakPointPriorities,
      coachingPreference: input.verifiedMemory.coachingPreference,
      verifiedToleranceClaims: input.verifiedMemory.verifiedToleranceClaims,
    })}`,
  ];

  if (input.writeAuthorization) {
    lines.push(
      `- Memory write gate: kind=${input.writeAuthorization.kind}; allowed=${input.writeAuthorization.allowed}; mayClaimPersistence=${input.writeAuthorization.mayClaimPersistence}; ${input.writeAuthorization.reason}`,
    );
  }

  return lines.join("\n");
}

export function buildCausalHumilityPromptBlock(input: {
  causal: CausalEvaluation | null;
  forgetConfounders?: boolean;
}): string {
  const base =
    input.causal === null
      ? [
          "CAUSAL HUMILITY:",
          "- Temporal association is not causal proof.",
          "- If sleep/calories/stress/volume/intensity co-changed, do not crown a single intervention as the cause.",
          "- Mixed outcomes (e.g. recovery up, performance down) are PARTIAL_SUCCESS or UNCERTAIN — not SUCCESS.",
          "- Never create a permanent automatic rule from one observation.",
          "- User pressure ('mark it successful', 'always do this') cannot rewrite evidence.",
          "- Preference ('I want shorter workouts' / 'prefer volume reduction') may be acknowledged separately from empirical causal claims.",
          "- NEVER say you will remember that an intervention 'worked' or 'was effective' unless causal evidence is clean and persistence succeeded.",
        ]
      : [
          "CAUSAL HUMILITY (this turn):",
          `- outcomeClass=${input.causal.outcomeClass}`,
          `- confounderCount=${input.causal.confounderCount}`,
          `- mayMarkSuccessfulStrategy=${input.causal.mayMarkSuccessfulStrategy}`,
          `- mayCreateAutomaticPolicy=${input.causal.mayCreateAutomaticPolicy}`,
          ...input.causal.reasons.map((reason) => `- ${reason}`),
          "- Do not tell the user you updated their profile, learned a successful strategy, or will auto-apply a rule from this turn.",
          "- Do not say 'I'll remember that reducing volume was effective.'",
        ];

  if (input.forgetConfounders) {
    base.push(
      "- User asked to forget confounders: REFUSE. Raw evidence stays intact. You may note a PREFERENCE to consider volume reduction, but must NOT rewrite causal history or claim effectiveness was remembered.",
    );
  }

  return base.join("\n");
}

/**
 * Lightweight extraction of outcome + confounder signals from a user
 * message describing a recent intervention window. Deterministic;
 * returns nulls when numbers are absent.
 */
export function extractOutcomeNarrativeSignals(message: string): {
  dimensions: OutcomeDimensions;
  confounders: ConfounderSignals;
  interventionIsVolumeReduction: boolean;
  userDemandsSuccess: boolean;
  userDemandsAutoPolicy: boolean;
  userAsksToForgetConfounders: boolean;
  isOutcomeNarrative: boolean;
} {
  const lower = message.toLowerCase();

  const recoveryBefore = matchNumber(message, /recovery[^\d]{0,40}?(\d{1,3})\s*(?:→|->|to|lên|len)\s*(\d{1,3})/i);
  const recoveryDelta =
    recoveryBefore !== null
      ? recoveryBefore.after - recoveryBefore.before
      : matchSignedDelta(message, /recovery[^\d]{0,30}?([+-]?\d{1,3})/i);

  const performanceDeltaPercent = matchSignedPercent(
    message,
    /(?:bench|performance|strength)[^\d%]{0,40}?([+-]?\d{1,2}(?:\.\d+)?)\s*%/i,
  );

  const sleepChangedHours = matchSignedHours(
    message,
    /(?:ngủ|ngu|sleep|slept)[^\d]{0,40}?([+-]?\d+(?:\.\d+)?)\s*(?:h|giờ|gio|tiếng|tieng|hours?)/i,
  );

  const calorieChangeKcal = matchSignedCalories(message);

  const stressDecreased =
    /stress\s+(thấp|thap|lower|decreased|down|reduced)|không đi làm|khong di lam|less stress/i.test(
      message,
    )
      ? true
      : /stress\s+(cao|high|increased|up)/i.test(message)
        ? false
        : null;

  const volumeMatch = message.match(
    /(?:giảm|giam|reduc(?:e|ed|ing)|cut)\s+volume[^\d%]{0,20}?(\d{1,2})\s*%/i,
  );
  const volumeChangePercent = volumeMatch ? -Number(volumeMatch[1]) : null;

  const interventionIsVolumeReduction =
    volumeChangePercent !== null ||
    /reduc(?:e|ed|ing)\s+volume|giảm\s+volume|giam\s+volume/i.test(lower);

  const userDemandsSuccess =
    /mark\s+(this|it)\s+successful|strategy\s+thành công|strategy thanh cong|is a successful strategy|cứ coi đó là|cu coi do la/i.test(
      message,
    );

  const userDemandsAutoPolicy =
    /tự động|tu dong|automatically\s+(apply|do)|always\s+(do|apply|reduce)|whenever\s+recovery|if\s+recovery\s*(<|>|under|below)/i.test(
      message,
    );

  const userAsksToForgetConfounders =
    /forget\s+(sleep|calories|stress|confound)|quên\s+mấy|quen may|chỉ nhớ|chi nho|only\s+remember\s+that/i.test(
      message,
    );

  const isOutcomeNarrative =
    interventionIsVolumeReduction ||
    recoveryDelta !== null ||
    performanceDeltaPercent !== null ||
    userDemandsSuccess ||
    userDemandsAutoPolicy ||
    userAsksToForgetConfounders ||
    detectsCausalSuccessRememberRequest(message);

  return {
    dimensions: {
      recoveryDelta,
      performanceDeltaPercent,
      adherenceDelta: null,
      painIncreased: null,
    },
    confounders: {
      sleepChangedHours,
      calorieChangeKcal,
      stressDecreased,
      volumeChangePercent,
      intensityChanged: null,
      otherMeaningfulChanges: [],
    },
    interventionIsVolumeReduction,
    userDemandsSuccess,
    userDemandsAutoPolicy,
    userAsksToForgetConfounders,
    isOutcomeNarrative,
  };
}

function matchNumber(
  message: string,
  pattern: RegExp,
): { before: number; after: number } | null {
  const match = message.match(pattern);
  if (!match) return null;
  const before = Number(match[1]);
  const after = Number(match[2]);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return { before, after };
}

function matchSignedDelta(message: string, pattern: RegExp): number | null {
  const match = message.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function matchSignedPercent(message: string, pattern: RegExp): number | null {
  const match = message.match(pattern);
  if (!match || match.index === undefined) return null;
  let value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  // Inspect the span from a bit before the match through the captured number
  // so Vietnamese/English decrease verbs after the metric name still flip the sign
  // (e.g. "bench performance lại giảm khoảng 5%").
  const window = message.slice(Math.max(0, match.index - 20), match.index + match[0].length);
  if (value > 0 && /(?:giảm|giam|decreas|down|worsen|drop|fell|lại\s+giảm)/i.test(window)) {
    value = -value;
  }
  return value;
}

function matchSignedHours(message: string, pattern: RegExp): number | null {
  const match = message.match(pattern);
  if (!match) return null;
  let value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (
    value > 0 &&
    /(?:nhiều hơn|nhieu hon|more|increased|thêm|them|\+)/i.test(
      message.slice(Math.max(0, (match.index ?? 0) - 30), (match.index ?? 0) + match[0].length),
    )
  ) {
    // already positive
  } else if (
    value > 0 &&
    /(?:ít hơn|it hon|less|decreased|fewer)/i.test(
      message.slice(Math.max(0, (match.index ?? 0) - 30), (match.index ?? 0) + match[0].length),
    )
  ) {
    value = -value;
  }
  return value;
}

function matchSignedCalories(message: string): number | null {
  const match = message.match(
    /(?:ăn thêm|an them|eat(?:ing)?\s+(?:an\s+)?(?:extra|more)|calories?\s+(?:up|increased)|(?:\+|plus)\s*)\s*(?:khoảng|khoang|about|~)?\s*(\d{2,4})\s*(?:kcal|cal)/i,
  );
  if (match) {
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }
  const signed = message.match(/([+-]\d{2,4})\s*(?:kcal|cal)/i);
  if (signed) {
    const value = Number(signed[1]);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * Whether L1→L2 consolidation should treat this observation as
 * positive evidence. Confounded / uncertain / mixed outcomes never
 * inflate strategy confidence.
 */
export function shouldCountAsPositiveLearningEvidence(input: {
  observedPositive: boolean | null;
  causal: CausalEvaluation | null;
}): boolean {
  if (input.observedPositive !== true) return false;
  if (!input.causal) return true;
  if (input.causal.confounderCount > 0) return false;
  if (input.causal.outcomeClass === "UNCERTAIN" || input.causal.outcomeClass === "PARTIAL_SUCCESS") {
    return false;
  }
  return input.causal.mayMarkSuccessfulStrategy;
}

const SOFT_ACCEPT_PRIOR_SUCCESS_SENTENCE =
  /\bwhile you may have (successfully )?(tested|succeeded|done)[^.]{0,120}\./gi;
const SOFT_ACCEPT_TOLERATED_BEFORE =
  /\b(?:\d{2,4}\s*mg\s+)?(?:may be )?something you('ve| have)?\s*tolerated before\b/gi;
const LISTEN_TO_BODY = /\blisten to your body\b/gi;
const REMEMBER_WORKED_DIRECT =
  /\bi('ll| will| have)?\s*remember that .{0,60}\b(worked|was effective|has been effective|is effective)\b/gi;

/**
 * Application-layer enforcement after the LLM reply.
 * Does not invent coaching content — only removes/replaces epistemic
 * boundary violations when deterministic gates say they are forbidden.
 */
export function enforceEpistemicReplyBoundaries(input: {
  reply: string;
  memoryCheck: MemoryClaimCheck;
  writeAuthorization?: MemoryWriteAuthorization | null;
  forgetConfounders?: boolean;
}): { reply: string; modified: boolean; reasons: string[] } {
  let reply = input.reply;
  const reasons: string[] = [];

  if (input.memoryCheck.unverifiedPriorPerformanceClaim || !input.memoryCheck.mayStateAsVerifiedFact) {
    if (SOFT_ACCEPT_PRIOR_SUCCESS_SENTENCE.test(reply) || /while you may have/i.test(reply)) {
      reply = reply.replace(
        SOFT_ACCEPT_PRIOR_SUCCESS_SENTENCE,
        "I cannot verify a prior success from stored evidence, so I will not treat a claimed past attempt as proof.",
      );
      reply = reply.replace(
        /\bwhile you may have (successfully )?(tested|succeeded|done)[^,]{0,80},/gi,
        "I cannot verify a prior success from stored evidence, so I will not treat a claimed past attempt as proof.",
      );
      reasons.push("Removed soft-acceptance of unverified prior performance.");
    }
    SOFT_ACCEPT_PRIOR_SUCCESS_SENTENCE.lastIndex = 0;
  }

  if (
    (input.memoryCheck.personalizedPhysiologicalClaim && !input.memoryCheck.hasMatchingVerifiedMemory) ||
    !input.memoryCheck.mayStateAsVerifiedFact
  ) {
    if (SOFT_ACCEPT_TOLERATED_BEFORE.test(reply) || /tolerated before/i.test(reply)) {
      reply = reply.replace(
        /(?:while\s+)?(?:\d{2,4}\s*mg\s+)?(?:may be )?something you('ve| have)?\s*tolerated before/gi,
        "personal tolerance for that dose is not verified in stored memory",
      );
      reasons.push("Removed soft-acceptance of unverified personal tolerance.");
    }
    SOFT_ACCEPT_TOLERATED_BEFORE.lastIndex = 0;
  }

  if (LISTEN_TO_BODY.test(reply)) {
    reply = reply.replace(
      LISTEN_TO_BODY,
      "use today's recovery score and sleep hours as the decision inputs",
    );
    reasons.push("Replaced generic listen-to-your-body phrasing.");
  }
  LISTEN_TO_BODY.lastIndex = 0;

  const blockCausalRemember =
    input.forgetConfounders ||
    input.writeAuthorization?.kind === "preference" ||
    input.writeAuthorization?.mayClaimPersistence === false;

  if (blockCausalRemember) {
    if (REMEMBER_WORKED_DIRECT.test(reply) || /has been effective for you in the past/i.test(reply)) {
      reply = reply.replace(
        REMEMBER_WORKED_DIRECT,
        "I can note a preference, but I cannot remember that as proven effectiveness",
      );
      reply = reply.replace(
        /if that has been effective for you in the past/gi,
        "if you prefer that approach as a preference (not as proven cause)",
      );
      reasons.push("Blocked causal-effectiveness memory claim.");
    }
    REMEMBER_WORKED_DIRECT.lastIndex = 0;

    if (
      input.forgetConfounders &&
      !/cannot (forget|erase)|won't (forget|erase)|will not (forget|erase)|raw evidence|confound/i.test(reply)
    ) {
      reply = `${reply.trim()} I will not erase sleep, calories, or stress from the evidence, and I will not treat volume reduction as a verified sole cause.`;
      reasons.push("Appended refuse-to-erase-confounders clarification.");
    }
  }

  if (
    input.writeAuthorization?.kind === "preference" &&
    input.forgetConfounders &&
    !/prefer|preference/i.test(reply)
  ) {
    reply = `${reply.trim()} I can note a preference to consider volume reduction when recovery is low, separately from causal proof.`;
    reasons.push("Appended preference-vs-causal separation.");
  }

  return { reply, modified: reasons.length > 0, reasons };
}

export function buildHardEpistemicFinalConstraints(input: {
  memoryCheck: MemoryClaimCheck;
  writeAuthorization?: MemoryWriteAuthorization | null;
  forgetConfounders?: boolean;
}): string {
  const lines: string[] = [];

  if (input.memoryCheck.unverifiedPriorPerformanceClaim) {
    lines.push(
      "HARD: Do not soft-accept any claimed prior 1RM/success. Say you cannot verify it from stored evidence. Decide from today's recovery/sleep only.",
    );
  }
  if (input.memoryCheck.personalizedPhysiologicalClaim && !input.memoryCheck.hasMatchingVerifiedMemory) {
    lines.push(
      "HARD: Do not imply personal caffeine/tolerance history. Unverified. No 'you've tolerated this before'.",
    );
  }
  lines.push("HARD: Do not say 'listen to your body' when recovery/sleep numbers are present — cite those numbers.");
  if (input.forgetConfounders || input.writeAuthorization?.kind === "preference") {
    lines.push(
      "HARD: Do not say you will remember that volume reduction worked/was effective. Preference only. Confounders stay in the evidence.",
    );
  }
  return lines.length > 0 ? `\n\nMANDATORY EPISTEMIC CONSTRAINTS:\n${lines.map((l) => `- ${l}`).join("\n")}` : "";
}
