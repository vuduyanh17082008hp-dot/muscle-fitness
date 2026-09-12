import type {
  AutoregulationDecision,
  KnowledgeSourceRef,
  ReadinessResult,
  TraceableDecision,
} from "@/lib/dante-core/types";

/**
 * Decision Traceability (spec Part A §6, §9).
 *
 * No Dante Core output should ever reach the UI or the LLM as an
 * opaque number. These builders assemble the
 * Recommendation / Why / Data Used / Confidence / Sources structure
 * directly from already-computed engine output — nothing here
 * performs new calculation, it only formats what the deterministic
 * engines already produced.
 */

function describeDecisionCode(decision: AutoregulationDecision): string {
  const loadPct =
    decision.loadAdjustmentPercent !== null
      ? `${Math.round(decision.loadAdjustmentPercent * 100)}%`
      : null;

  const volumePct =
    decision.volumeAdjustmentPercent !== null &&
    decision.volumeAdjustmentPercent !== 0
      ? `${Math.round(Math.abs(decision.volumeAdjustmentPercent) * 100)}%`
      : null;

  switch (decision.decision) {
    case "proceed_as_planned":
      return `Proceed with ${decision.exercise} as planned.`;
    case "reduce_load":
      return `Reduce ${decision.exercise} load by ${loadPct ?? "a small amount"}.`;
    case "reduce_volume":
      return `Reduce ${decision.exercise} volume by ${volumePct ?? "a small amount"} (${decision.plannedSets} → ${decision.recommendedSets} sets).`;
    case "reduce_load_and_volume":
      return `Reduce ${decision.exercise} load by ${loadPct ?? "a small amount"} and volume by ${volumePct ?? "a small amount"} (${decision.plannedSets} → ${decision.recommendedSets} sets).`;
    case "modify_session":
      return `Modify today's ${decision.exercise} session.`;
    case "deload_session":
      return `Treat today's ${decision.exercise} work as a deload (${decision.plannedSets} → ${decision.recommendedSets} sets, load ${loadPct ?? "reduced"}).`;
    case "rest_recommended":
      return `Rest ${decision.exercise} today.`;
    default:
      return `Recommendation for ${decision.exercise}.`;
  }
}

export function buildAutoregulationTraceableDecision(
  decision: AutoregulationDecision,
  readiness: ReadinessResult,
  sources: KnowledgeSourceRef[] = [],
): TraceableDecision<AutoregulationDecision> {
  const dataUsed: Record<string, string | number | null> = {
    readinessScore: readiness.readinessScore,
    systemicFatigue: readiness.systemicFatigue,
    plannedLoadKg: decision.plannedLoadKg,
    recommendedLoadKg: decision.recommendedLoadKg,
    plannedSets: decision.plannedSets,
    recommendedSets: decision.recommendedSets,
  };

  for (const estimate of readiness.muscleRecovery) {
    if (estimate.recoveryPercent !== null) {
      dataUsed[`${estimate.muscle}RecoveryPercent`] = estimate.recoveryPercent;
    }
  }

  return {
    recommendation: describeDecisionCode(decision),
    decision,
    why: decision.reasons,
    dataUsed,
    confidence: decision.confidence,
    sources,
  };
}
