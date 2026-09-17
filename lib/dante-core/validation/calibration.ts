import type {
  CalibrationDomain,
  DomainCalibrationState,
} from "@/lib/dante-core/validation/types";

export function initialCalibrationState(domain: CalibrationDomain): DomainCalibrationState {
  return { domain, sampleCount: 0, weightedBrierScore: null, confidenceAdjustment: 0 };
}

export function updateDomainCalibration(input: {
  state: DomainCalibrationState;
  predictedProbability: number;
  observed: boolean;
  learningRate?: number;
}): DomainCalibrationState {
  const probability = Math.max(0, Math.min(1, input.predictedProbability));
  const observed = input.observed ? 1 : 0;
  const brier = (probability - observed) ** 2;
  const nextCount = input.state.sampleCount + 1;
  const priorTotal = (input.state.weightedBrierScore ?? 0) * input.state.sampleCount;
  const weightedBrierScore = (priorTotal + brier) / nextCount;
  const learningRate = Math.max(0.01, Math.min(0.25, input.learningRate ?? 0.1));
  // High-confidence misses exert more pressure; every update remains bounded and gradual.
  const signedEvidence = input.observed ? 1 - probability : -probability;
  const confidenceAdjustment = Math.max(-0.5, Math.min(0.25,
    input.state.confidenceAdjustment + learningRate * signedEvidence,
  ));
  return { ...input.state, sampleCount: nextCount, weightedBrierScore, confidenceAdjustment };
}
