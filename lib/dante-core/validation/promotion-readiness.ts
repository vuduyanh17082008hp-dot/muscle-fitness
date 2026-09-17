import type { GateStatus, PromotionReadinessReport } from "@/lib/dante-core/validation/types";

export type PromotionEvidence = {
  safetyObservations: number;
  safetyFailures: number;
  isolationVerified: boolean;
  isolationFailures: number;
  eligibleRecommendations: number;
  completeTraces: number;
  maturedRecommendations: number;
  linkedOutcomes: number;
  calibratedOutcomes: number;
  driftLabels: number;
  stabilityWindows: number;
  evaluableShadowDisagreements: number;
  memoryEvents: number;
  provenanceCompleteMemoryEvents: number;
  calibrationBrierScore?: number;
  driftFalsePositiveRate?: number;
  driftFalseNegativeRate?: number;
  stabilityIncidentRate?: number;
  shadowInformationValueRate?: number;
};

export type PromotionThresholds = {
  traceability: { minimumEligible: number; minimumRate: number };
  outcomeCoverage: { minimumMatured: number; minimumRate: number };
  calibration: { minimumOutcomes: number; maximumBrierScore: number };
  drift: { minimumLabels: number; maximumFalsePositiveRate: number; maximumFalseNegativeRate: number };
  stability: { minimumWindows: number; maximumIncidentRate: number };
  shadowValue: { minimumEvaluableDisagreements: number; minimumInformationValueRate: number };
  dataCompleteness: { minimumEligible: number; minimumMatured: number; minimumTraceRate: number; minimumOutcomeRate: number };
};

function enough(count: number, minimum: number | undefined, passes: boolean): GateStatus {
  if (minimum === undefined || count < minimum) return "INSUFFICIENT_DATA";
  return passes ? "PASS" : "FAIL";
}

function measured(count: number, minimum: number | undefined, metricAvailable: boolean, passes: boolean): GateStatus {
  if (minimum === undefined || count < minimum || !metricAvailable) return "INSUFFICIENT_DATA";
  return passes ? "PASS" : "FAIL";
}

export function buildPromotionReadinessReport(
  evidence: PromotionEvidence,
  generatedAt = new Date().toISOString(),
  thresholds?: PromotionThresholds,
): PromotionReadinessReport {
  const traceRate = evidence.eligibleRecommendations > 0 ? evidence.completeTraces / evidence.eligibleRecommendations : 0;
  const outcomeRate = evidence.maturedRecommendations > 0 ? evidence.linkedOutcomes / evidence.maturedRecommendations : 0;
  const provenanceRate = evidence.memoryEvents > 0 ? evidence.provenanceCompleteMemoryEvents / evidence.memoryEvents : 0;
  return {
    mode: "SHADOW",
    mayPromote: false,
    generatedAt,
    gates: {
      safety: enough(evidence.safetyObservations, 1, evidence.safetyFailures === 0),
      isolation: evidence.isolationFailures > 0 ? "FAIL" : evidence.isolationVerified ? "PASS" : "INSUFFICIENT_DATA",
      traceability: enough(evidence.eligibleRecommendations, thresholds?.traceability.minimumEligible, thresholds ? traceRate >= thresholds.traceability.minimumRate : false),
      outcomeCoverage: enough(evidence.maturedRecommendations, thresholds?.outcomeCoverage.minimumMatured, thresholds ? outcomeRate >= thresholds.outcomeCoverage.minimumRate : false),
      calibration: measured(evidence.calibratedOutcomes, thresholds?.calibration.minimumOutcomes,
        evidence.calibrationBrierScore !== undefined,
        thresholds !== undefined && evidence.calibrationBrierScore !== undefined && evidence.calibrationBrierScore <= thresholds.calibration.maximumBrierScore),
      drift: measured(evidence.driftLabels, thresholds?.drift.minimumLabels,
        evidence.driftFalsePositiveRate !== undefined && evidence.driftFalseNegativeRate !== undefined,
        thresholds !== undefined &&
        evidence.driftFalsePositiveRate !== undefined &&
        evidence.driftFalseNegativeRate !== undefined &&
        evidence.driftFalsePositiveRate <= thresholds.drift.maximumFalsePositiveRate &&
        evidence.driftFalseNegativeRate <= thresholds.drift.maximumFalseNegativeRate),
      stability: measured(evidence.stabilityWindows, thresholds?.stability.minimumWindows,
        evidence.stabilityIncidentRate !== undefined,
        thresholds !== undefined && evidence.stabilityIncidentRate !== undefined && evidence.stabilityIncidentRate <= thresholds.stability.maximumIncidentRate),
      shadowValue: measured(evidence.evaluableShadowDisagreements, thresholds?.shadowValue.minimumEvaluableDisagreements,
        evidence.shadowInformationValueRate !== undefined,
        thresholds !== undefined && evidence.shadowInformationValueRate !== undefined && evidence.shadowInformationValueRate >= thresholds.shadowValue.minimumInformationValueRate),
      memoryProvenance: enough(evidence.memoryEvents, 1, provenanceRate === 1),
      dataCompleteness: evidence.maturedRecommendations < (thresholds?.dataCompleteness.minimumMatured ?? Number.POSITIVE_INFINITY)
        ? "INSUFFICIENT_DATA"
        : enough(evidence.eligibleRecommendations, thresholds?.dataCompleteness.minimumEligible,
        thresholds !== undefined && traceRate >= thresholds.dataCompleteness.minimumTraceRate && outcomeRate >= thresholds.dataCompleteness.minimumOutcomeRate),
    },
  };
}
