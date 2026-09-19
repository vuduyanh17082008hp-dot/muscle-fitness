import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import { buildExperimentProposal } from "@/lib/dante-core/nof1-engine/propose";
import { detectNof1Trigger, evaluateNof1Eligibility } from "@/lib/dante-core/nof1-engine/eligibility";
import {
  applyConfoundersToExperiment,
  detectConfoundersFromMessage,
} from "@/lib/dante-core/nof1-engine/confounders";
import { evaluateNof1Experiment } from "@/lib/dante-core/nof1-engine/evaluate";
import type {
  NOf1Experiment,
  Nof1Session,
  ProtocolAdherence,
} from "@/lib/dante-core/nof1-engine/types";
import type { RiskEvaluationResult } from "@/lib/dante-core/risk-accumulator/types";

export function createEmptyNof1Session(): Nof1Session {
  return { experiment: null, lastProposalId: null };
}

export function detectsExplicitAccept(message: string): boolean {
  const text = normalizeSafetyText(message);
  return /(?:^|\b)(?:yes|ok|okay|dong\s+y|lam\s+di|lam\s+test|chay\s+test|let'?s\s+do\s+it|yes\s+let'?s|ok\s*,?\s*lam|ok\s+lam\s+test|accept)(?:\b|$)/i.test(
    text,
  ) && !/(?:maybe|co\s+le|de\s+xem|not\s+sure|khong\s+chac)/i.test(text);
}

export function detectsAssumedConsent(message: string): boolean {
  const text = normalizeSafetyText(message);
  return /(?:do\s+whatever|ban\s+cu\s+lam|lam\s+gi\s+cung\s+duoc|just\s+do\s+(?:it|whatever)|tuy\s+ong)/i.test(
    text,
  );
}

export function detectsMaybe(message: string): boolean {
  return /(?:\bmaybe\b|\bco\s+le\b|\bde\s+xem\b|\bnot\s+sure\b|\bkhong\s+chac\b)/i.test(
    normalizeSafetyText(message),
  );
}

export function detectsCancel(message: string): boolean {
  return /(?:cancel\s+(?:the\s+)?experiment|huy\s+(?:thi\s+nghiem|experiment|test)|dung\s+lai\s+(?:experiment|test)|stop\s+the\s+(?:experiment|test))/i.test(
    normalizeSafetyText(message),
  );
}

export function detectsRetry(message: string): boolean {
  return /(?:^|\b)(?:retry|try again|thu lai|kich hoat lai|activate again)(?:\b|$)/i.test(
    normalizeSafetyText(message),
  );
}

export function detectsExperimentStatusQuery(message: string): boolean {
  return /\b(?:experiment|test|thi nghiem)\b.{0,45}\b(?:tracking|track|theo doi|status|trang thai|what|gi|active)\b|\b(?:what|gi)\b.{0,30}\b(?:experiment|test)\b.{0,30}\b(?:track|theo doi)\b/i.test(
    normalizeSafetyText(message),
  );
}

export function detectsExperimentCompletionRequest(message: string): boolean {
  return /(?:experiment|test).{0,30}(?:ended|complete|completed|finished|xong|ket thuc)|(?:ended|complete|completed|finished|xong|ket thuc).{0,30}(?:experiment|test)/i.test(
    normalizeSafetyText(message),
  );
}

export function detectsOutcomeReport(message: string): {
  rpeImproved?: boolean;
  rpeWorsened?: boolean;
  performanceImproved?: boolean;
  performanceUnchanged?: boolean;
  volumeHeld?: boolean;
  sleepImproved?: boolean;
  missingOutcome?: boolean;
  isOutcomeTurn: boolean;
} {
  const text = normalizeSafetyText(message);
  const isOutcomeTurn =
    /(?:rpe|reps?|performance|hieu\s+suat|volume\s+giu|sleep\s+tot|ngu\s+tot|ket\s+qua|experiment\s+(?:ended|complete|xong))/i.test(
      text,
    );
  if (!isOutcomeTurn) {
    return { isOutcomeTurn: false, missingOutcome: false };
  }

  return {
    isOutcomeTurn: true,
    rpeImproved: /(?:rpe\s+(?:giam|down|lower|from).{0,20}(?:7|xuong)|rpe.{0,20}(?:8\.5|8,5).{0,20}(?:7))/i.test(text),
    rpeWorsened: /(?:rpe\s+(?:tang|up|higher|worse))/i.test(text),
    performanceImproved: /(?:reps?\s+tang|better\s+reps|performance\s+(?:tot|better|up)|hieu\s+suat\s+tot)/i.test(text),
    performanceUnchanged: /(?:performance\s+unchanged|khong\s+doi|same\s+performance|khong\s+thay\s+doi)/i.test(text),
    volumeHeld: /(?:volume\s+(?:giu|held|on|stable|same|gan\s+nhu\s+cu)|kept\s+volume)/i.test(text),
    sleepImproved: /(?:sleep\s+(?:tot|better|improved|\+)|ngu\s+tot|ngu\s+nhieu)/i.test(text),
    missingOutcome: /(?:khong\s+co\s+data|no\s+(?:data|outcome|rpe|log)|chua\s+do)/i.test(text),
  };
}

/**
 * Explicit consent intent only. Does NOT invent durable ACTIVE —
 * Confirm write tool + persistAcceptedNof1Experiment own that transition.
 * Session helper marks ACCEPTED (intent) with userConfirmed still false.
 */
export function applyConsent(
  experiment: NOf1Experiment,
  message: string,
): { experiment: NOf1Experiment; activated: boolean; assumedConsentBlocked: boolean } {
  if (experiment.status !== "PROPOSED") {
    return { experiment, activated: false, assumedConsentBlocked: false };
  }
  if (detectsAssumedConsent(message)) {
    return { experiment, activated: false, assumedConsentBlocked: true };
  }
  if (detectsMaybe(message) || !detectsExplicitAccept(message)) {
    return { experiment, activated: false, assumedConsentBlocked: false };
  }
  return {
    experiment: {
      ...experiment,
      status: "ACCEPTED",
      userConfirmed: false,
    },
    activated: true,
    assumedConsentBlocked: false,
  };
}

export function cancelExperiment(experiment: NOf1Experiment): NOf1Experiment {
  return {
    ...experiment,
    status: "CANCELLED",
    completedAt: new Date().toISOString(),
  };
}

export function abortExperimentForSafety(experiment: NOf1Experiment): NOf1Experiment {
  return {
    ...experiment,
    status: "ABORTED",
    completedAt: new Date().toISOString(),
  };
}

/**
 * Rebuild N-of-1 session state from active-chat user turns (no DB).
 * Proposal/accept/confounder/outcome semantics are reconstructed deterministically.
 */
export function deriveNof1SessionFromHistory(
  userMessagesChronological: string[],
  input: {
    now?: Date;
    safetyTriggered?: boolean;
    riskEvaluation?: RiskEvaluationResult | null;
    language?: "en" | "vi";
  } = {},
): Nof1Session {
  const session = createEmptyNof1Session();
  const now = input.now ?? new Date();
  let experiment: NOf1Experiment | null = null;

  for (const message of userMessagesChronological) {
    if (!message.trim()) continue;

    if (input.safetyTriggered) {
      if (experiment && (experiment.status === "ACTIVE" || experiment.status === "ACCEPTED" || experiment.status === "PENDING_CONFIRMATION" || experiment.status === "ACTIVATION_FAILED" || experiment.status === "PROPOSED")) {
        experiment = abortExperimentForSafety(experiment);
      }
      continue;
    }

    if (experiment && detectsCancel(message)) {
      experiment = cancelExperiment(experiment);
      continue;
    }

    if (experiment && (experiment.status === "ACTIVE" || experiment.status === "ACCEPTED" || experiment.status === "CONFOUNDED")) {
      const confounders = detectConfoundersFromMessage(message);
      if (confounders.length > 0) {
        experiment = applyConfoundersToExperiment(experiment, confounders);
      }

      const outcome = detectsOutcomeReport(message);
      if (outcome.isOutcomeTurn) {
        const adherence: ProtocolAdherence =
          experiment.confounders.length === 0
            ? "COMPLETE"
            : experiment.confounders.length === 1
              ? "PARTIAL"
              : "POOR";
        experiment = evaluateNof1Experiment({
          experiment,
          outcomeReport: outcome,
          confounderCount: experiment.confounders.length,
          protocolAdherence: adherence,
        });
      }
      continue;
    }

    if (experiment && experiment.status === "PROPOSED") {
      // Chat-history accept does NOT invent ACTIVE. Durable ACTIVE comes from DB.
      if (detectsAssumedConsent(message) || detectsMaybe(message)) {
        continue;
      }
      if (detectsExplicitAccept(message)) {
        continue;
      }
    }

    const eligibility = evaluateNof1Eligibility({
      message,
      safetyTriggered: false,
      riskEvaluation: input.riskEvaluation,
      confidenceHasLowCausal: true,
    });
    if (eligibility.eligible) {
      experiment = buildExperimentProposal({
        trigger: eligibility.trigger === "NONE" ? detectNof1Trigger(message) : eligibility.trigger,
        now,
        language: input.language,
      });
      session.lastProposalId = experiment.id;
    }
  }

  session.experiment = experiment;
  return session;
}
