import type {
  ClaimLedgerEntry,
  ClaimType,
  CounterEvidenceResult,
  EvidenceItem,
  EvidenceOrigin,
  EvidenceWeight,
  Hypothesis,
  HypothesisStatus,
  IdentifiabilityStatus,
  PromotionDecision,
  UncertaintyClass,
  VerificationStatus,
} from "./types";

/** Authority ordering (higher wins). An ordering, NOT a probability. */
const ORIGIN_RANK: Record<EvidenceOrigin, number> = {
  USER_CORRECTION: 90,
  DETERMINISTIC_RESULT: 85,
  VERIFIED_STATE: 80,
  USER_EXPLICIT: 70,
  RETRIEVED_KNOWLEDGE: 50,
  USER_UNCERTAIN: 40,
  PRIOR_INFERENCE: 30,
  MODEL_INFERENCE: 25,
  SIMULATION: 10,
  UNKNOWN: 0,
};
/** Stale observations are capped below every non-stale inference. */
const STALE_CAP = 20;
const STRENGTH_WEIGHT: Record<EvidenceWeight, number> = { STRONG: 3, MODERATE: 2, WEAK: 1 };
/** One side "dominates" when its mass is at least this multiple of the other. Structural, not an evidence-count threshold. */
const DOMINANCE = 2;
const UNGROUNDED: ReadonlySet<EvidenceOrigin> = new Set<EvidenceOrigin>([
  "MODEL_INFERENCE",
  "PRIOR_INFERENCE",
  "SIMULATION",
  "UNKNOWN",
]);

export function evidenceRank(item: EvidenceItem): number {
  const base = ORIGIN_RANK[item.origin];
  return item.stale ? Math.min(base, STALE_CAP) : base;
}

export function rankEvidence(items: readonly EvidenceItem[]): EvidenceItem[] {
  return [...items].sort((a, b) => evidenceRank(b) - evidenceRank(a) || a.id.localeCompare(b.id));
}

function mass(items: readonly EvidenceItem[]): number {
  return items.reduce((sum, i) => sum + STRENGTH_WEIGHT[i.strength] * (evidenceRank(i) / 100), 0);
}

/** Grounded = fresh and not purely inferred/simulated/unknown. */
export function isGrounded(item: EvidenceItem): boolean {
  return !UNGROUNDED.has(item.origin) && !item.stale;
}

/** Only VERIFIED may be mutation truth. ESTIMATED/UNRESOLVED/PROPOSED/SIMULATED never are. */
export function canActAsMutationTruth(v: VerificationStatus): boolean {
  return v === "VERIFIED";
}

const TRUST: VerificationStatus[] = ["VERIFIED", "ESTIMATED", "PROPOSED", "UNRESOLVED", "SIMULATED"];
const lessTrusted = (a: VerificationStatus, b: VerificationStatus) => (TRUST.indexOf(a) >= TRUST.indexOf(b) ? a : b);

/** Same id+direction merges (sourceRefs unioned, verification takes the LESS trusted side); opposing directions both survive. */
export function mergeEvidenceWithoutLosingProvenance(
  a: readonly EvidenceItem[],
  b: readonly EvidenceItem[],
): EvidenceItem[] {
  const out = new Map<string, EvidenceItem>();
  for (const item of [...a, ...b]) {
    const key = `${item.id}|${item.direction}`;
    const prev = out.get(key);
    if (!prev) {
      out.set(key, { ...item, sourceRefs: [...item.sourceRefs] });
      continue;
    }
    const winner = evidenceRank(item) > evidenceRank(prev) ? item : prev;
    out.set(key, {
      ...winner,
      verification: lessTrusted(prev.verification, item.verification),
      sourceRefs: [...new Set([...prev.sourceRefs, ...item.sourceRefs])],
    });
  }
  return [...out.values()];
}

/** Explicit counter-evidence evaluation over a pool. Calling this IS the "check" canPromoteHypothesis demands. */
export function findCounterEvidence(hypothesisId: string, pool: readonly EvidenceItem[]): CounterEvidenceResult {
  return {
    evaluated: true,
    counterEvidence: rankEvidence(pool.filter((i) => i.hypothesisId === hypothesisId && i.direction === "AGAINST")),
  };
}

export type Explanation = {
  id: string;
  support: readonly EvidenceItem[];
  counter: readonly EvidenceItem[];
};

type Standing = "supported" | "refuted" | "contested" | "empty";

function standing(e: Explanation): Standing {
  const s = mass(e.support);
  const c = mass(e.counter);
  if (s === 0 && c === 0) return "empty";
  if (c === 0 || (s > 0 && s >= DOMINANCE * c)) return "supported";
  if (s === 0 || c >= DOMINANCE * s) return "refuted";
  return "contested";
}

export function classifyIdentifiability(
  explanations: readonly Explanation[],
  opts: { criticalEvidenceMissing?: boolean } = {},
): IdentifiabilityStatus {
  const st = explanations.map((e) => ({ e, s: standing(e) }));
  if (st.every((x) => x.s === "empty")) return "UNKNOWN";
  if (st.some((x) => x.s === "contested")) return "CONFLICTING";
  const supported = st.filter((x) => x.s === "supported");
  if (supported.length === 0) return "UNKNOWN"; // everything present is refuted
  if (supported.length > 1) {
    const masses = supported.map((x) => mass(x.e.support)).sort((p, q) => q - p);
    return masses[0] < DOMINANCE * masses[1] ? "UNDERDETERMINED" : "PARTIALLY_IDENTIFIED";
  }
  const others = st.filter((x) => x.s !== "supported");
  const allRuledOut = others.length > 0 && others.every((x) => x.s === "refuted");
  return allRuledOut && !opts.criticalEvidenceMissing ? "IDENTIFIED" : "PARTIALLY_IDENTIFIED";
}

const UNCERTAINTY_ORDER: UncertaintyClass[] = ["HIGH_SUPPORT", "MODERATE_SUPPORT", "WEAK_SUPPORT", "UNRESOLVED"];

export function deriveUncertaintyClass(
  identifiability: IdentifiabilityStatus,
  opts: { missingEvidence?: boolean } = {},
): UncertaintyClass {
  const base: UncertaintyClass =
    identifiability === "IDENTIFIED" ? "HIGH_SUPPORT"
    : identifiability === "PARTIALLY_IDENTIFIED" ? "MODERATE_SUPPORT"
    : identifiability === "UNDERDETERMINED" ? "WEAK_SUPPORT"
    : "UNRESOLVED";
  const i = UNCERTAINTY_ORDER.indexOf(base);
  return opts.missingEvidence ? UNCERTAINTY_ORDER[Math.min(i + 1, UNCERTAINTY_ORDER.length - 1)] : base;
}

const GATED: ReadonlySet<HypothesisStatus> = new Set<HypothesisStatus>(["SUPPORTED", "PARTIALLY_IDENTIFIED", "IDENTIFIED"]);

export function canPromoteHypothesis(h: Hypothesis, target: HypothesisStatus): PromotionDecision {
  if (target === "EARLY_SIGNAL" || target === "REJECTED" || target === "UNRESOLVED") return { allowed: true, reasons: [] };
  const reasons: string[] = [];
  if (h.supportingEvidence.length === 0) reasons.push("NO_SUPPORTING_EVIDENCE");
  if (GATED.has(target)) {
    if (!h.counterEvidenceEvaluated) reasons.push("COUNTER_EVIDENCE_NOT_EVALUATED");
    const counter = mass(h.counterEvidence);
    if (counter > 0 && mass(h.supportingEvidence) < DOMINANCE * counter) reasons.push("COUNTER_EVIDENCE_NOT_OUTWEIGHED");
    if (!h.supportingEvidence.some(isGrounded)) reasons.push("NO_GROUNDED_SUPPORT");
    if (h.identifiability === "CONFLICTING" || h.identifiability === "UNKNOWN") {
      reasons.push(`IDENTIFIABILITY_${h.identifiability}`);
    }
    if (target === "PARTIALLY_IDENTIFIED" && h.identifiability === "UNDERDETERMINED") {
      reasons.push("IDENTIFIABILITY_UNDERDETERMINED");
    }
    if (target === "IDENTIFIED") {
      if (h.identifiability !== "IDENTIFIED") reasons.push("NOT_IDENTIFIED");
      if (h.missingEvidence.length > 0) reasons.push("MISSING_EVIDENCE_REMAINS");
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

const CLAIM_BY_ORIGIN: Record<EvidenceOrigin, ClaimType> = {
  USER_CORRECTION: "USER_EXPLICIT",
  USER_EXPLICIT: "USER_EXPLICIT",
  USER_UNCERTAIN: "USER_UNCERTAIN",
  VERIFIED_STATE: "VERIFIED_FACT",
  DETERMINISTIC_RESULT: "DETERMINISTIC_RESULT",
  RETRIEVED_KNOWLEDGE: "RETRIEVED_KNOWLEDGE",
  PRIOR_INFERENCE: "INFERENCE",
  MODEL_INFERENCE: "INFERENCE",
  SIMULATION: "PROPOSAL",
  UNKNOWN: "UNKNOWN",
};

/** Derived, in-memory ledger. Hypotheses are always HYPOTHESIS/UNRESOLVED regardless of status. */
export function deriveClaimLedger(
  evidence: readonly EvidenceItem[],
  hypotheses: readonly Hypothesis[] = [],
): ClaimLedgerEntry[] {
  return [
    ...rankEvidence(evidence).map((e) => ({
      id: `claim:${e.id}`,
      claimType: CLAIM_BY_ORIGIN[e.origin],
      statement: e.summary,
      verification: e.verification,
      evidenceIds: [e.id],
    })),
    ...hypotheses.map((h) => ({
      id: `claim:hyp:${h.id}`,
      claimType: "HYPOTHESIS" as const,
      statement: h.candidateExplanation,
      verification: "UNRESOLVED" as const,
      evidenceIds: [...h.supportingEvidence, ...h.counterEvidence].map((e) => e.id),
    })),
  ];
}
