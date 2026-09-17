import type {
  ShadowComparisonInput,
  ShadowEvaluation,
} from "@/lib/dante-core/validation/types";

export function evaluateShadowAgainstProduction(input: ShadowComparisonInput): ShadowEvaluation {
  if (input.productionAction === input.shadowAction) {
    return { classification: "AGREEMENT", informationSeekingSupported: null, reasonCodes: ["ACTIONS_AGREE"], shadowWasBetter: null };
  }
  if (!input.outcomeAvailable) {
    return { classification: "DISAGREEMENT", informationSeekingSupported: null, reasonCodes: ["OUTCOME_PENDING"], shadowWasBetter: null };
  }
  const evaluable = input.expectedDimensionsOverlap && input.strategiesDefined && input.acceptableConfounding;
  if (!evaluable) {
    return { classification: "UNEVALUABLE_DISAGREEMENT", informationSeekingSupported: null, reasonCodes: ["COMPARISON_NOT_IDENTIFIED"], shadowWasBetter: null };
  }
  const informationSeeking = input.shadowAction === "ASK" || input.shadowAction === "RETRIEVE";
  return {
    classification: "EVALUABLE_DISAGREEMENT",
    informationSeekingSupported: informationSeeking ? input.criticalMissingVariableFound === true : null,
    reasonCodes: informationSeeking ? ["INFORMATION_SEEKING_EVALUATED"] : ["DEFINED_STRATEGIES_AND_OUTCOME"],
    shadowWasBetter: null,
  };
}
