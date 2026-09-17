import type { ContextComparison } from "@/lib/dante-core/validation/types";

export type StrategyEvidenceAssessment = {
  accepted: boolean;
  evidenceWeight: number;
  causalUncertainty: "LOW" | "MODERATE" | "HIGH";
  outcomeStatus: "ALIGNED" | "DIVERGENT" | "MIXED" | "UNRESOLVED";
  reasonCodes: string[];
};

export function assessStrategyEvidence(input: {
  recommendationCompliedWith: boolean;
  independentOutcomeObserved: boolean;
  confounderCount: number;
  outcomeStatus: StrategyEvidenceAssessment["outcomeStatus"];
}): StrategyEvidenceAssessment {
  if (input.recommendationCompliedWith && !input.independentOutcomeObserved) {
    return { accepted: false, evidenceWeight: 0, causalUncertainty: "HIGH", outcomeStatus: input.outcomeStatus, reasonCodes: ["SELF_CREATED_EVIDENCE_BLOCKED"] };
  }
  if (!input.independentOutcomeObserved || input.outcomeStatus === "UNRESOLVED") {
    return { accepted: false, evidenceWeight: 0, causalUncertainty: "HIGH", outcomeStatus: input.outcomeStatus, reasonCodes: ["NO_INDEPENDENT_RESOLVED_OUTCOME"] };
  }
  const causalUncertainty = input.confounderCount > 1 ? "HIGH" : input.confounderCount === 1 ? "MODERATE" : "LOW";
  return {
    accepted: true,
    evidenceWeight: input.confounderCount > 1 ? 0.25 : input.confounderCount === 1 ? 0.5 : 1,
    causalUncertainty,
    outcomeStatus: input.outcomeStatus,
    reasonCodes: input.confounderCount > 0 ? ["CONFOUNDED_EVIDENCE_DOWNWEIGHTED"] : ["INDEPENDENT_OUTCOME_EVIDENCE"],
  };
}

export function updateStrategyEvidence(input: {
  currentStrength: number;
  assessment: StrategyEvidenceAssessment;
  context: ContextComparison;
}): number {
  if (!input.assessment.accepted) return input.currentStrength;
  const direction = input.assessment.outcomeStatus === "ALIGNED" ? 1 : input.assessment.outcomeStatus === "DIVERGENT" ? -1 : 0;
  const delta = direction * 0.08 * input.assessment.evidenceWeight * input.context.score;
  return Math.max(0, Math.min(1, input.currentStrength + delta));
}

export function applyMemoryOverrideRequest<T extends Readonly<Record<string, unknown>>>(input: {
  rawEvidence: T;
  currentCausalStrength: number;
  requestedPreference: string;
}): { rawEvidence: T; causalStrength: number; preference: string; reasonCodes: string[] } {
  return {
    rawEvidence: input.rawEvidence,
    causalStrength: input.currentCausalStrength,
    preference: input.requestedPreference,
    reasonCodes: ["RAW_EVIDENCE_PRESERVED", "PREFERENCE_SEPARATED_FROM_CAUSAL_BELIEF"],
  };
}

export function filterUserScoped<T extends { userId: string }>(records: T[], userId: string): T[] {
  return records.filter((record) => record.userId === userId);
}
