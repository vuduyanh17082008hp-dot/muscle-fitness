import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import type { CurrentTurnState } from "@/lib/dante-core/current-turn-state";
import type { MemoryClaimCheck } from "@/lib/dante-core/epistemic-integrity";
import { evaluateClaimConfidence } from "@/lib/dante-core/confidence-engine/evaluator";
import type {
  ClaimConfidence,
  ConfidenceAssessmentContext,
  ConfidenceLogFields,
  EvidenceStrength,
  ProvenanceQuality,
} from "@/lib/dante-core/confidence-engine/types";
import type { RiskEvaluationResult } from "@/lib/dante-core/risk-accumulator/types";

export type TurnConfidenceAssessment = {
  claims: ClaimConfidence[];
  logs: ConfidenceLogFields[];
  /** True when the turn is a simple normal day — keep confidence mostly invisible. */
  keepMostlyInvisible: boolean;
};

export type AssessTurnConfidenceInput = {
  message: string;
  currentState?: CurrentTurnState | null;
  safetyTriggered?: boolean;
  safetyCategory?: string | null;
  memoryCheck?: MemoryClaimCheck | null;
  /** Optional wearable/tool conflict with self-reported recovery. */
  recoveryContradiction?: boolean;
  /** Clean comparable observation count from Phase 4 / caller when available. */
  comparableObservations?: number;
  /** Explicit material confounders already counted by caller. */
  materialConfounderCount?: number;
  userSpecificEvidence?: boolean;
  evidenceStrengthOverride?: EvidenceStrength;
  /** Derived risk signals from Predictive Risk Accumulator V1 (optional). */
  riskEvaluation?: RiskEvaluationResult | null;
};

function countMaterialConfounders(message: string): number {
  const text = normalizeSafetyText(message);
  const markers = [
    /(?:volume|volume\s*(?:giam|down|reduced|reduction|-)\s*\d*|giam\s*volume)/i.test(text),
    /(?:sleep|ngu).{0,24}(?:\+|plus|more|nhieu|tang|up|better)|(?:ngu|sleep).{0,20}(?:\d+(?:[.,]\d+)?)\s*(?:h|gio|tieng|hours?)/i.test(
      text,
    ) && /(?:volume|calories|calorie|stress|an\s+nhieu|an\s+them)/i.test(text),
    /(?:calories?|kcal|an\s+nhieu|an\s+them|surplus|surplus).{0,24}(?:\+|plus|more|tang|up)/i.test(text),
    /(?:stress).{0,24}(?:thap|low|giam|down|reduced|better)|stress\s+thap/i.test(text),
  ];
  // Count distinct material domains mentioned as changing together with an outcome.
  const changingTogether =
    /(?:performance|hieu\s*suat|ket\s*qua).{0,40}(?:tot|tot\s+len|improved|better|up)|(?:tot\s+len|improved|better).{0,40}(?:performance|hieu\s*suat)/i.test(
      text,
    ) || /(?:co\s+phai|was|is).{0,40}(?:nguyen\s+nhan|reason|cause|caused)/i.test(text);

  if (!changingTogether && !/(?:nguyen\s+nhan|attribut|cause|caused|because of|do\s+giam)/i.test(text)) {
    return 0;
  }

  return markers.filter(Boolean).length;
}

function asksCaffeinePerformance(message: string): boolean {
  const text = normalizeSafetyText(message);
  return (
    /(?:caffeine|cafe(?:in)?).{0,60}(?:stronger|strength|bench|performance|khoe\s+hon|manh\s+hon|tot\s+hon)/i.test(
      text,
    ) ||
    /(?:stronger|strength|bench|performance|khoe\s+hon|manh\s+hon).{0,60}(?:caffeine|cafe(?:in)?)/i.test(text) ||
    /(?:will|chac|definitely|sure).{0,40}(?:stronger|bench|performance|khoe)/i.test(text)
  );
}

function asksCausalAttribution(message: string): boolean {
  const text = normalizeSafetyText(message);
  return /(?:nguyen\s+nhan|was\s+(?:lower\s+)?volume\s+the\s+reason|attribut|cause[sd]?|because\s+of|co\s+phai.{0,40}(?:volume|ngu|stress|calorie))/i.test(
    text,
  );
}

function asksInjuryDiagnosis(message: string): boolean {
  const text = normalizeSafetyText(message);
  return /(?:rotator\s+cuff|rach\s+(?:vai|rotator)|sap\s+rach|tear(?:ing)?|developing\s+(?:an?\s+)?injury|chan\s+thuong|injury\s+risk|\d{2,3}\s*%|chac\s+(?:toi|tôi)\s+sap)/i.test(
    text,
  );
}

function isNormalDay(state: CurrentTurnState | null | undefined, message: string): boolean {
  if (!state) return false;
  const text = normalizeSafetyText(message);
  const mentionsActivePain =
    /(?:\bpain\b|\bdau\b|\birritat\b|\bcan\b)/i.test(text) &&
    !/(?:khong\s+dau|no\s+pain|khong\s+dau\s+gi|pain-?free|khong\s+irritat)/i.test(text);
  const simple =
    !state.shoulderIrritated &&
    !asksCaffeinePerformance(message) &&
    !asksCausalAttribution(message) &&
    (state.recoveryStatus === "GOOD" || (state.sleepHours != null && state.sleepHours >= 7)) &&
    !mentionsActivePain &&
    !/\b(?:max|1\s*rm|\bpr\b)\b/i.test(text);
  return simple && (state.wantsSubmax || /submax|normal\s+session|tap\s+submax|binh\s+thuong/i.test(text));
}

function baseCtx(partial: Partial<ConfidenceAssessmentContext>): ConfidenceAssessmentContext {
  return {
    evidenceStrength: partial.evidenceStrength ?? "NONE",
    userSpecificEvidence: partial.userSpecificEvidence ?? false,
    comparableObservations: partial.comparableObservations ?? 0,
    currentStateComplete: partial.currentStateComplete ?? false,
    provenanceQuality: partial.provenanceQuality ?? "UNVERIFIED",
    materialConfounderCount: partial.materialConfounderCount ?? 0,
    contradictions: partial.contradictions ?? [],
    missingInformation: partial.missingInformation ?? [],
  };
}

/**
 * Build decision-relevant claim confidences for the current turn.
 * Deterministic; uses already-resolved state / provenance / safety signals.
 */
export function assessTurnConfidence(input: AssessTurnConfidenceInput): TurnConfidenceAssessment {
  const claims: ClaimConfidence[] = [];
  const state = input.currentState ?? null;
  const message = input.message;
  const text = normalizeSafetyText(message);

  const materialConfounderCount =
    input.materialConfounderCount ?? countMaterialConfounders(message);
  const comparableObservations = input.comparableObservations ?? 0;
  const userSpecificEvidence = input.userSpecificEvidence ?? false;

  const contradictions: string[] = [];
  if (input.recoveryContradiction) {
    contradictions.push("self_report_recovery_vs_wearable");
  }

  // --- SAFETY ACTION (never diagnosis) ---
  if (input.safetyTriggered) {
    claims.push(
      evaluateClaimConfidence(
        "SAFETY_ACTION",
        baseCtx({
          evidenceStrength: "STRONG",
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          currentStateComplete: true,
        }),
        `safety_action:${input.safetyCategory ?? "triggered"}`,
      ),
    );
    claims.push(
      evaluateClaimConfidence(
        "CAUSAL_ATTRIBUTION",
        baseCtx({
          evidenceStrength: "NONE",
          provenanceQuality: "UNVERIFIED",
          comparableObservations: 0,
        }),
        "diagnosis_or_medical_cause",
      ),
    );
  }

  // --- Unverified provenance / false memory ---
  if (input.memoryCheck && !input.memoryCheck.mayStateAsVerifiedFact) {
    if (
      input.memoryCheck.userAssertedPastMemory ||
      input.memoryCheck.personalizedPhysiologicalClaim ||
      input.memoryCheck.unverifiedPriorPerformanceClaim
    ) {
      claims.push(
        evaluateClaimConfidence(
          "STRATEGY_PREDICTION",
          baseCtx({
            evidenceStrength: "NONE",
            provenanceQuality: "UNVERIFIED",
            currentStateComplete: false,
          }),
          "unverified_memory_strategy",
        ),
      );
      claims.push(
        evaluateClaimConfidence(
          "CAUSAL_ATTRIBUTION",
          baseCtx({
            evidenceStrength: "NONE",
            provenanceQuality: "UNVERIFIED",
            comparableObservations: 0,
          }),
          "unverified_tolerance_or_past_claim",
        ),
      );
    }
  }

  // --- Current-state facts from explicit reports ---
  const reportProvenance: ProvenanceQuality = contradictions.length
    ? "PARTIAL"
    : "EXPLICIT_CURRENT_REPORT";

  if (state?.sleepHours != null) {
    claims.push(
      evaluateClaimConfidence(
        "CURRENT_STATE_FACT",
        baseCtx({
          evidenceStrength: "STRONG",
          provenanceQuality: reportProvenance,
          contradictions,
          currentStateComplete: true,
        }),
        "sleep_hours_reported",
      ),
    );
  }

  if (state?.recoveryStatus != null) {
    claims.push(
      evaluateClaimConfidence(
        "CURRENT_STATE_FACT",
        baseCtx({
          evidenceStrength: contradictions.length ? "MIXED" : "STRONG",
          provenanceQuality: reportProvenance,
          contradictions,
          currentStateComplete: true,
        }),
        "recovery_self_report",
      ),
    );
  }

  if (state?.caffeineMg != null) {
    claims.push(
      evaluateClaimConfidence(
        "CURRENT_STATE_FACT",
        baseCtx({
          evidenceStrength: "STRONG",
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          currentStateComplete: true,
        }),
        "caffeine_consumed_mg",
      ),
    );
  }

  if (state?.shoulderIrritated) {
    claims.push(
      evaluateClaimConfidence(
        "CURRENT_STATE_FACT",
        baseCtx({
          evidenceStrength: "STRONG",
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          currentStateComplete: true,
        }),
        "shoulder_irritation_reported",
      ),
    );
    claims.push(
      evaluateClaimConfidence(
        "SAFETY_ACTION",
        baseCtx({
          evidenceStrength: "STRONG",
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          currentStateComplete: true,
        }),
        "no_max_irritating_overhead",
      ),
    );
  }

  // --- Caffeine → performance ---
  if (asksCaffeinePerformance(message) || (state?.caffeineMg != null && /stronger|bench|performance|khoe|manh\s+hon/i.test(text))) {
    const strength: EvidenceStrength =
      input.evidenceStrengthOverride ??
      (userSpecificEvidence && comparableObservations >= 3 ? "MIXED" : "NONE");
    claims.push(
      evaluateClaimConfidence(
        "CAUSAL_ATTRIBUTION",
        baseCtx({
          evidenceStrength: strength,
          userSpecificEvidence,
          comparableObservations,
          provenanceQuality: userSpecificEvidence ? "PARTIAL" : "UNVERIFIED",
          materialConfounderCount: 0,
        }),
        "caffeine_performance_effect",
      ),
    );
  }

  // --- Confounded / clean causal attribution ---
  if (asksCausalAttribution(message) || materialConfounderCount >= 2) {
    const strength: EvidenceStrength =
      input.evidenceStrengthOverride ??
      (userSpecificEvidence && comparableObservations >= 3 && materialConfounderCount === 0
        ? "STRONG"
        : materialConfounderCount >= 2
          ? "WEAK"
          : "MIXED");
    claims.push(
      evaluateClaimConfidence(
        "CAUSAL_ATTRIBUTION",
        baseCtx({
          evidenceStrength: strength,
          userSpecificEvidence,
          comparableObservations,
          provenanceQuality: userSpecificEvidence ? "PARTIAL" : "EXPLICIT_CURRENT_REPORT",
          materialConfounderCount,
        }),
        "multi_factor_performance_cause",
      ),
    );
  } else if (
    userSpecificEvidence &&
    comparableObservations >= 3 &&
    (input.evidenceStrengthOverride === "STRONG" || comparableObservations >= 3)
  ) {
    // Cleaner repeated pattern path (TEST F) when caller supplies counts.
    claims.push(
      evaluateClaimConfidence(
        "CAUSAL_ATTRIBUTION",
        baseCtx({
          evidenceStrength: input.evidenceStrengthOverride ?? "STRONG",
          userSpecificEvidence: true,
          comparableObservations,
          provenanceQuality: "VERIFIED",
          materialConfounderCount: input.materialConfounderCount ?? 0,
        }),
        "repeated_comparable_volume_pattern",
      ),
    );
  }

  // --- Conditional pressing strategy ---
  if (state?.shoulderIrritated && state.trainingDecisionRequested && !state.wantsMax) {
    const complete =
      state.recoveryStatus != null || state.sleepHours != null;
    claims.push(
      evaluateClaimConfidence(
        "STRATEGY_PREDICTION",
        baseCtx({
          evidenceStrength: "MIXED",
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          currentStateComplete: complete,
          materialConfounderCount: 0,
          userSpecificEvidence: false,
        }),
        "conditional_horizontal_press_submax",
      ),
    );
  }

  // Incomplete state strategy ask
  if (
    !input.safetyTriggered &&
    /(?:what should i train|tap gi|feel terrible|cam thay te)/i.test(text) &&
    !(state?.sleepHours != null || state?.recoveryStatus != null)
  ) {
    claims.push(
      evaluateClaimConfidence(
        "STRATEGY_PREDICTION",
        baseCtx({
          evidenceStrength: "WEAK",
          provenanceQuality: "PARTIAL",
          currentStateComplete: false,
          missingInformation: ["sleep", "recovery", "pain", "recent_load"],
        }),
        "incomplete_state_strategy",
      ),
    );
  }

  // --- Risk Accumulator derived pattern vs forbidden injury diagnosis ---
  const risk = input.riskEvaluation ?? null;
  const elevatedIrritation = risk?.signals.find(
    (signal) => signal.type === "REPEATED_IRRITATION" && signal.level === "ELEVATED" && !signal.resolvedAt,
  );
  if (elevatedIrritation) {
    claims.push(
      evaluateClaimConfidence(
        "CURRENT_STATE_FACT",
        baseCtx({
          evidenceStrength: elevatedIrritation.observationCount >= 2 ? "STRONG" : "MIXED",
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          currentStateComplete: true,
          comparableObservations: elevatedIrritation.observationCount,
          userSpecificEvidence: true,
        }),
        "repeated_irritation_pattern",
      ),
    );
    claims.push(
      evaluateClaimConfidence(
        "STRATEGY_PREDICTION",
        baseCtx({
          evidenceStrength: "MIXED",
          provenanceQuality: "EXPLICIT_CURRENT_REPORT",
          currentStateComplete: true,
          comparableObservations: elevatedIrritation.observationCount,
          userSpecificEvidence: true,
        }),
        "conservative_session_trade",
      ),
    );
  }

  if (asksInjuryDiagnosis(message)) {
    claims.push(
      evaluateClaimConfidence(
        "CAUSAL_ATTRIBUTION",
        baseCtx({
          evidenceStrength: "NONE",
          provenanceQuality: "UNVERIFIED",
          comparableObservations: 0,
        }),
        "injury_diagnosis_or_prediction",
      ),
    );
  }

  const logs: ConfidenceLogFields[] = claims.map((claim) => ({
    claimType: claim.claimType,
    claimId: claim.claimId,
    confidenceLevel: claim.level,
    evidenceStrength:
      claim.claimType === "SAFETY_ACTION"
        ? "STRONG"
        : claim.level === "INSUFFICIENT_EVIDENCE"
          ? "NONE"
          : claim.level === "HIGH"
            ? "STRONG"
            : claim.level === "MODERATE"
              ? "MIXED"
              : "WEAK",
    provenanceQuality:
      claim.level === "INSUFFICIENT_EVIDENCE" && claim.claimId.includes("unverified")
        ? "UNVERIFIED"
        : claim.claimType === "CURRENT_STATE_FACT" || claim.claimType === "SAFETY_ACTION"
          ? "EXPLICIT_CURRENT_REPORT"
          : "PARTIAL",
    materialConfounderCount,
    comparableObservations,
  }));

  return {
    claims,
    logs,
    keepMostlyInvisible: isNormalDay(state, message) && !input.safetyTriggered && !asksInjuryDiagnosis(message),
  };
}
