import type {
  ExperimentResultConfidence,
  ExperimentResultKind,
  NOf1Experiment,
  Nof1EvaluationInput,
  ProtocolAdherence,
} from "@/lib/dante-core/nof1-engine/types";
import { isDurableNof1Id } from "@/lib/dante-core/nof1-engine/persistence-guard";

function confidenceFor(
  adherence: ProtocolAdherence,
  confounderCount: number,
  missingOutcome: boolean,
): ExperimentResultConfidence {
  if (missingOutcome) return "INSUFFICIENT_EVIDENCE";
  if (confounderCount >= 2 || adherence === "POOR") return "INSUFFICIENT_EVIDENCE";
  if (adherence === "PARTIAL" || confounderCount === 1) return "LOW";
  return "MODERATE";
}

/**
 * Evaluate a completed (or end-of-window) experiment from structured outcome signals.
 * Never fabricates missing outcomes. Never claims causal proof.
 */
export function evaluateNof1Experiment(input: Nof1EvaluationInput): NOf1Experiment {
  const { experiment, outcomeReport, confounderCount, protocolAdherence } = input;

  const hasValidLifecycle =
    isDurableNof1Id(experiment.id) &&
    experiment.userConfirmed &&
    (experiment.status === "ACTIVE" || experiment.status === "CONFOUNDED") &&
    experiment.hypothesis.trim().length > 0 &&
    experiment.controlledVariables.length > 0 &&
    experiment.variableUnderTest.trim().length > 0 &&
    experiment.primaryOutcome.trim().length > 0 &&
    experiment.experimentWindow.durationDays > 0 &&
    Boolean(experiment.experimentWindow.start) &&
    Boolean(experiment.experimentWindow.end);

  if (!hasValidLifecycle) {
    return {
      ...experiment,
      conclusion: {
        result: "INCONCLUSIVE",
        confidence: "INSUFFICIENT_EVIDENCE",
        reasons: [
          "A durable active experiment record with complete protocol identity is required before outcome evaluation.",
          "No completion or causal result was inferred from incomplete lifecycle state.",
        ],
      },
    };
  }

  if (outcomeReport.missingOutcome) {
    return {
      ...experiment,
      protocolAdherence,
      conclusion: {
        result: "INCONCLUSIVE",
        confidence: "INSUFFICIENT_EVIDENCE",
        reasons: [
          "Primary outcome data was not provided.",
          "The experiment is not marked complete when its primary outcome is missing.",
        ],
      },
    };
  }

  if (experiment.status === "CONFOUNDED" || confounderCount >= 2 || protocolAdherence === "POOR") {
    return {
      ...experiment,
      status: "CONFOUNDED",
      completedAt: new Date().toISOString(),
      protocolAdherence,
      conclusion: {
        result: "INCONCLUSIVE",
        confidence: "INSUFFICIENT_EVIDENCE",
        reasons: [
          "Material confounders or poor adherence make the window unclean.",
          "Confounded is not the same as failed.",
        ],
      },
    };
  }

  let result: ExperimentResultKind = "INCONCLUSIVE";
  const reasons: string[] = [];

  const supports =
    Boolean(outcomeReport.sleepImproved) &&
    Boolean(outcomeReport.volumeHeld) &&
    (Boolean(outcomeReport.rpeImproved) || Boolean(outcomeReport.performanceImproved));

  const doesNotSupport =
    Boolean(outcomeReport.sleepImproved) &&
    Boolean(outcomeReport.performanceUnchanged) &&
    !outcomeReport.rpeImproved &&
    !outcomeReport.performanceImproved;

  if (supports) {
    result = "SUPPORTS";
    reasons.push("Comparable sessions showed better RPE/performance with sleep improved and volume held roughly stable.");
    reasons.push("This supports the hypothesis for this user-specific window — it does not establish causality.");
  } else if (doesNotSupport) {
    result = "DOES_NOT_SUPPORT";
    reasons.push("Sleep improved but performance/RPE did not meaningfully change under roughly stable volume.");
    reasons.push("This does not support the hypothesis for this window — not a clinical disproof.");
  } else {
    result = "INCONCLUSIVE";
    reasons.push("Outcome signals are mixed or incomplete for a directional call.");
  }

  const confidence = confidenceFor(protocolAdherence, confounderCount, false);

  return {
    ...experiment,
    status: "COMPLETED",
    completedAt: new Date().toISOString(),
    protocolAdherence,
    conclusion: {
      result,
      confidence: result === "INCONCLUSIVE" && confidence === "MODERATE" ? "LOW" : confidence,
      reasons,
    },
  };
}

/**
 * Learning promotion guard — one experiment is evidence, not a permanent rule.
 */
export function buildLearningEvidenceNote(experiment: NOf1Experiment): string {
  const result = experiment.conclusion?.result ?? "INCONCLUSIVE";
  return `One controlled user-specific micro-experiment ${result.toLowerCase()} the hypothesis about ${experiment.variableUnderTest}. Do not promote to a permanent rule from a single run.`;
}
