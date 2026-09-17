import type {
  OutcomeDimension,
  RecommendationHypothesis,
  SelectedFollowUp,
} from "@/lib/dante-core/validation/types";

export const RECOMMENDATION_HYPOTHESES: Record<string, RecommendationHypothesis> = {
  reduce_volume: {
    recommendationType: "reduce_volume",
    statement: "Fatigue decreases while recovery improves and performance is maintained.",
    requiredDimensions: ["recovery", "performance", "pain_safety", "completion"],
    candidates: [
      { id: "recovery_score", targetDimension: "recovery", prompt: "How recovered do you feel now?", uncertaintyReduction: 0.8, userBurden: 0.15, measurementCost: 0.05, redundancy: 0 },
      { id: "session_performance", targetDimension: "performance", prompt: "Was performance up, stable, or down?", uncertaintyReduction: 0.75, userBurden: 0.2, measurementCost: 0.05, redundancy: 0 },
      { id: "pain_level", targetDimension: "pain_safety", prompt: "What was your pain level?", uncertaintyReduction: 0.9, userBurden: 0.15, measurementCost: 0.05, redundancy: 0 },
      { id: "bodyweight", targetDimension: "actual_intake", prompt: "What is your bodyweight?", uncertaintyReduction: 0.2, userBurden: 0.2, measurementCost: 0.1, redundancy: 0 },
    ],
  },
  increase_protein: {
    recommendationType: "increase_protein",
    statement: "Protein intake improves while adherence and tolerance remain acceptable.",
    requiredDimensions: ["actual_intake", "adherence", "satiety_tolerance"],
    candidates: [
      { id: "actual_protein", targetDimension: "actual_intake", prompt: "How much protein did you consume?", uncertaintyReduction: 0.9, userBurden: 0.25, measurementCost: 0.1, redundancy: 0 },
      { id: "nutrition_adherence", targetDimension: "adherence", prompt: "How closely did you follow the target?", uncertaintyReduction: 0.7, userBurden: 0.15, measurementCost: 0.05, redundancy: 0 },
      { id: "tolerance", targetDimension: "satiety_tolerance", prompt: "How tolerable was the change?", uncertaintyReduction: 0.65, userBurden: 0.15, measurementCost: 0.05, redundancy: 0 },
    ],
  },
};

export function selectHypothesisRelativeFollowUp(input: {
  hypothesis: RecommendationHypothesis;
  alreadyObserved?: OutcomeDimension[];
}): SelectedFollowUp | null {
  const observed = new Set(input.alreadyObserved ?? []);
  const candidates = input.hypothesis.candidates
    .filter((candidate) => input.hypothesis.requiredDimensions.includes(candidate.targetDimension))
    .filter((candidate) => !observed.has(candidate.targetDimension))
    .map((candidate) => ({
      ...candidate,
      informationValue: candidate.uncertaintyReduction - candidate.userBurden - candidate.measurementCost - candidate.redundancy,
    }))
    .sort((left, right) => right.informationValue - left.informationValue || left.id.localeCompare(right.id));
  return candidates[0] ?? null;
}
