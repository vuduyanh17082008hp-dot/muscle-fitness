/**
 * Phase 1 Extension — packages authoritative facts for finalization.
 * MUST NOT derive new facts. Missing → UNKNOWN / null.
 */

import type {
  DanteDecision,
  ProvenanceKind,
  SemanticInterpretation,
  SemanticProposition,
  SignalPolarity,
} from "@/lib/dante-core/adaptive-coach-v2/types";
import { SIDED_NOT_PAINFUL_SPAN, SIDED_PAINFUL_SPAN } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { canonicalizeCausalTarget } from "@/lib/dante-core/runtime-convergence/fingerprint";

export type CanonicalClaim = {
  concept: string;
  polarity: SignalPolarity | "UNKNOWN";
  temporal: "CURRENT" | "HISTORICAL" | "RECENT" | "UNKNOWN";
  provenance: ProvenanceKind | "UNKNOWN";
  laterality: "LEFT" | "RIGHT" | "UNSPECIFIED" | "UNCERTAIN" | "UNKNOWN";
  count: "UNKNOWN" | "UNVERIFIED" | number | null;
  countVerified: boolean;
  /**
   * Set only for a durable user correction carried in from an earlier request (Phase 2). It is the user's own
   * latest accepted statement, so the finalizer may keep its side; it is never a tool-verified fact.
   */
  source?: "PERSISTED_CORRECTION" | "USER_SIDE_STATEMENT";
};

export type ProvenanceConstraint = {
  mayAssertExactCount: boolean;
  mayAssertVerifiedCount: boolean;
  mayAssertLaterality: boolean;
  mayPromoteToCurrent: boolean;
  source: ProvenanceKind | "UNKNOWN";
  countEstimate: number | null;
  countMin?: number | null;
  countMax?: number | null;
};

export type CausalClaim = {
  target: string | null;
  observedOutcome: string | null;
  conclusion: "NOT_ESTABLISHED" | "CONDITIONAL" | "ESTABLISHED" | "UNKNOWN";
};

export type ActionState = {
  permission: "READ" | "PROPOSE" | "CONFIRMATION_REQUIRED" | "DENIED";
  persisted: boolean;
};

export type ExperimentState = {
  conclusion: "SUPPORTS" | "DOES_NOT_SUPPORT" | "INCONCLUSIVE" | "CONFOUNDED" | "NONE" | "UNKNOWN";
};

export type SafetyDecision = {
  action: "NORMAL" | "ESCALATE" | "REDIRECT";
  category: string | null;
};

export type AuthoritativeResponseState = {
  currentStateClaims: CanonicalClaim[];
  historicalClaims: CanonicalClaim[];
  provenanceConstraints: ProvenanceConstraint[];
  causalClaims: CausalClaim[];
  actionState: ActionState | null;
  experimentState: ExperimentState | null;
  safetyDecision: SafetyDecision | null;
};

function mapTemporal(prop: SemanticProposition): CanonicalClaim["temporal"] {
  const anchor = prop.temporalAnchor ?? (prop.temporal === "HISTORICAL" ? "HISTORICAL" : prop.temporal === "RECENT" ? "RECENT" : prop.temporal === "CURRENT" ? "CURRENT" : "UNKNOWN");
  if (anchor === "HISTORICAL") return "HISTORICAL";
  if (anchor === "RECENT_PAST" || anchor === "RECENT") return "RECENT";
  if (anchor === "CURRENT") return "CURRENT";
  return "UNKNOWN";
}

function toCanonical(prop: SemanticProposition): CanonicalClaim {
  const polarity =
    prop.polarity
    ?? (prop.state === "PRESENT" ? "PRESENT" : prop.state === "ABSENT" || prop.state === "RESOLVED" ? "ABSENT" : "UNKNOWN");
  const count = prop.count ?? null;
  const provenance = prop.provenance ?? "UNKNOWN";
  const countVerified =
    provenance === "VERIFIED_TOOL_DATA"
    && typeof count === "number"
    && Number.isFinite(count);
  const sided = prop.rawSpan === SIDED_PAINFUL_SPAN || prop.rawSpan === SIDED_NOT_PAINFUL_SPAN;
  return {
    concept: prop.concept,
    polarity: polarity === "UNCERTAIN" ? "UNKNOWN" : polarity,
    temporal: mapTemporal(prop),
    provenance,
    laterality: prop.laterality ?? "UNKNOWN",
    count: typeof count === "number" ? count : count,
    countVerified,
    ...(sided ? { source: "USER_SIDE_STATEMENT" as const } : {}),
  };
}

/** A claim the user made about ONE named side ("vai trái đau" / "vai phải không đau"). */
export const isSidedStatement = (claim: CanonicalClaim): boolean => claim.source === "USER_SIDE_STATEMENT";

/** Two claims are about the same shoulder unless both name a side and the sides differ. */
function sameShoulderScope(a: CanonicalClaim, b: CanonicalClaim): boolean {
  const named = (c: CanonicalClaim) => c.laterality === "LEFT" || c.laterality === "RIGHT";
  return !(named(a) && named(b) && a.laterality !== b.laterality);
}

/** Extract causal target from user text without inventing conclusions. */
export function extractCausalTargetFromText(text: string): string | null {
  const lower = text.toLowerCase();
  if (/(?:sleep|ngủ|ngu|giấc ngủ|giac ngu).{0,80}(?:nguyên nhân|nguyen nhan|cause|caused)/i.test(lower)
    || /(?:nguyên nhân|nguyen nhan|cause).{0,80}(?:sleep|ngủ|ngu)/i.test(lower)
    || /(?:sleep|ngủ|ngu).{0,40}(?:chắc chắn|chac chan|certainly).{0,40}(?:nguyên nhân|cause)/i.test(lower)) {
    return "SLEEP";
  }
  if (/(?:caffeine|cafe|cà phê).{0,80}(?:nguyên nhân|cause)/i.test(lower)) return "CAFFEINE";
  if (/(?:volume|khối lượng|khoi luong).{0,80}(?:nguyên nhân|cause)/i.test(lower)) return "TRAINING_VOLUME";
  if (/(?:calorie|calo|kcal).{0,80}(?:nguyên nhân|cause)/i.test(lower)) return "CALORIE_INTAKE";
  if (/(?:alcohol|rượu|ruou|nhậu|nhau).{0,80}(?:nguyên nhân|cause)/i.test(lower)) return "ALCOHOL";
  return null;
}

export function extractObservedOutcome(text: string): string | null {
  if (/(?:bench).{0,40}(?:rpe).{0,20}(?:giảm|giam|down|lower|decrease)/i.test(text)
    || /(?:rpe).{0,20}(?:bench).{0,20}(?:giảm|giam|down)/i.test(text)
    || /(?:bench rpe).{0,20}(?:giảm|giam|decrease)/i.test(text)) {
    return "BENCH_RPE_DECREASE";
  }
  return null;
}

/**
 * Build authoritative state from existing semantic interpretation + optional DO.
 * Does not invent facts. Unresolved fields stay UNKNOWN/null.
 */
export function buildAuthoritativeResponseState(input: {
  interpretation: SemanticInterpretation | null;
  decision?: DanteDecision | null;
  toolState?: ActionState | null;
  causalTarget?: string | null;
  causalConclusion?: CausalClaim["conclusion"] | null;
  /**
   * Durable, user-stated facts from earlier requests (Phase 2 persisted corrections). Admitted as historical
   * claims with their own explicit provenance; never used to create current-state or verified-tool claims.
   */
  persistedClaims?: CanonicalClaim[];
}): AuthoritativeResponseState {
  const props = input.interpretation?.propositions ?? [];
  const currentStateClaims: CanonicalClaim[] = [];
  const historicalClaims: CanonicalClaim[] = [];
  const provenanceConstraints: ProvenanceConstraint[] = [];

  for (const prop of props) {
    const claim = toCanonical(prop);
    if (claim.temporal === "CURRENT") currentStateClaims.push(claim);
    else if (claim.temporal === "HISTORICAL" || claim.temporal === "RECENT") historicalClaims.push(claim);
    else if (claim.provenance === "USER_RECALL_UNCERTAIN") historicalClaims.push(claim);

    if (claim.provenance === "USER_RECALL_UNCERTAIN" || claim.count === "UNKNOWN" || claim.count === "UNVERIFIED") {
      const estimateFromSpan = prop.rawSpan?.match(/uncertain_count_(\d+)/)?.[1];
      const rangeFromSpan = prop.rawSpan?.match(/uncertain_range_(\d+)_(\d+)/);
      const estimateFromText = input.interpretation?.rawText.match(/\b(?:khoảng|khoang|about|roughly|~)?\s*(\d+)\s*(?:lần|lan|times|episodes)\b/i)?.[1];
      const estimate = rangeFromSpan
        ? Number(rangeFromSpan[1])
        : estimateFromSpan
          ? Number(estimateFromSpan)
          : estimateFromText
            ? Number(estimateFromText)
            : typeof claim.count === "number" ? claim.count : null;
      provenanceConstraints.push({
        mayAssertExactCount: false,
        mayAssertVerifiedCount: false,
        mayAssertLaterality: claim.laterality === "LEFT" || claim.laterality === "RIGHT",
        mayPromoteToCurrent: false,
        source: claim.provenance === "UNKNOWN" ? "USER_RECALL_UNCERTAIN" : claim.provenance,
        countEstimate: estimate != null && Number.isFinite(estimate) ? estimate : null,
        ...(rangeFromSpan
          ? { countMin: Number(rangeFromSpan[1]), countMax: Number(rangeFromSpan[2]) }
          : {}),
      });
    } else if (claim.provenance === "VERIFIED_TOOL_DATA" && typeof claim.count === "number") {
      provenanceConstraints.push({
        mayAssertExactCount: true,
        mayAssertVerifiedCount: true,
        mayAssertLaterality: claim.laterality === "LEFT" || claim.laterality === "RIGHT",
        mayPromoteToCurrent: false,
        source: "VERIFIED_TOOL_DATA",
        countEstimate: claim.count,
      });
    }
  }

  for (const persisted of input.persistedClaims ?? []) {
    if (persisted.temporal === "HISTORICAL") historicalClaims.push(persisted);
  }

  // Prefer explicit current shoulder ABSENT from interpretation over stale PRESENT.
  const currentShoulder = currentStateClaims.filter((c) => c.concept === "SHOULDER_IRRITATION");
  if (currentShoulder.some((c) => c.polarity === "ABSENT")) {
    for (let i = currentStateClaims.length - 1; i >= 0; i -= 1) {
      const c = currentStateClaims[i];
      // "right does not hurt" says nothing about the left one: an ABSENT claim only supersedes a PRESENT claim about the same shoulder.
      if (c.concept === "SHOULDER_IRRITATION" && c.polarity === "PRESENT"
        && currentShoulder.some((a) => a.polarity === "ABSENT" && sameShoulderScope(a, c))) {
        historicalClaims.push({ ...c, temporal: "HISTORICAL" });
        currentStateClaims.splice(i, 1);
      }
    }
  }

  const text = input.interpretation?.rawText ?? "";
  const causalTarget =
    canonicalizeCausalTarget(input.causalTarget)
    ?? extractCausalTargetFromText(text);
  const causalClaims: CausalClaim[] = causalTarget
    ? [{
        target: causalTarget,
        observedOutcome: extractObservedOutcome(text),
        conclusion: input.causalConclusion
          ?? input.decision?.claimConstraints?.sleepCausality
          ?? "NOT_ESTABLISHED",
      }]
    : [];

  const actionState = input.toolState
    ?? (input.decision?.tool
      ? { permission: input.decision.tool.permission, persisted: input.decision.tool.persisted }
      : null);

  const experimentConclusion = input.decision?.claimConstraints?.experimentConclusion;
  const experimentState: ExperimentState | null = experimentConclusion
    ? { conclusion: experimentConclusion }
    : input.decision?.experiment?.internalStatus
      ? { conclusion: (input.decision.experiment.internalStatus as ExperimentState["conclusion"]) || "UNKNOWN" }
      : null;

  const safetyDecision: SafetyDecision | null = input.decision
    ? { action: input.decision.safety.action, category: input.decision.safety.category }
    : null;

  return {
    currentStateClaims,
    historicalClaims,
    provenanceConstraints,
    causalClaims,
    actionState,
    experimentState,
    safetyDecision,
  };
}

/** Structured (non-raw) active-context meaning for anti-manipulation — never raw history. */
export function buildStructuredActiveContextMeaning(input: {
  language: "en" | "vi";
  nof1Variable?: string | null;
  hasActiveExperiment?: boolean;
}): string | null {
  if (input.hasActiveExperiment && input.nof1Variable) {
    return input.language === "vi"
      ? `test ${input.nof1Variable} vẫn đang chạy; nếu nhiều biến đổi cùng lúc thì chưa gán improvement cho một biến`
      : `the ${input.nof1Variable} test is still underway; if too many variables moved together, do not award the improvement to one cause`;
  }
  return null;
}
