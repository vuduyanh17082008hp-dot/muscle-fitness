import type {
  DriftObservation,
  DriftPolicy,
  DriftValidation,
} from "@/lib/dante-core/validation/types";

export function validateDrift(
  policy: DriftPolicy,
  observations: DriftObservation[],
): DriftValidation {
  const scoped = observations.filter((item) => item.domain === policy.domain);
  if (scoped.some((item) => item.explicitTransition && item.confidence >= policy.minimumConfidence)) {
    return { domain: policy.domain, stage: "CONFIRMED", qualifyingPoints: 1, reasonCodes: ["EXPLICIT_STATE_TRANSITION"] };
  }
  const qualifyingPoints = scoped.filter((item) =>
    !item.explicitTransition &&
    item.magnitude >= policy.magnitudeThreshold &&
    item.confidence >= policy.minimumConfidence
  ).length;
  const stage = qualifyingPoints >= policy.confirmationPoints
    ? "CONFIRMED"
    : qualifyingPoints >= policy.candidatePoints
      ? "CANDIDATE"
      : qualifyingPoints > 0
        ? "ANOMALY"
        : "NONE";
  return {
    domain: policy.domain,
    stage,
    qualifyingPoints,
    reasonCodes: stage === "NONE" ? ["NO_SUPPORTED_CHANGE"] : [`${stage}_MAGNITUDE_PERSISTENCE_CONFIDENCE`],
  };
}
