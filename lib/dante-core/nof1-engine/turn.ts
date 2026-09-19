import { evaluateNof1Eligibility, isUnsafeExperimentRequest } from "@/lib/dante-core/nof1-engine/eligibility";
import { buildExperimentProposal } from "@/lib/dante-core/nof1-engine/propose";
import {
  applyConfoundersToExperiment,
  detectConfoundersFromMessage,
} from "@/lib/dante-core/nof1-engine/confounders";
import { evaluateNof1Experiment } from "@/lib/dante-core/nof1-engine/evaluate";
import {
  abortExperimentForSafety,
  cancelExperiment,
  createEmptyNof1Session,
  detectsAssumedConsent,
  detectsCancel,
  detectsExplicitAccept,
  detectsExperimentCompletionRequest,
  detectsExperimentStatusQuery,
  detectsOutcomeReport,
  detectsRetry,
} from "@/lib/dante-core/nof1-engine/lifecycle";
import {
  buildNof1AssumedConsentReply,
  buildNof1CancelledReply,
  buildNof1CompletionReply,
  buildNof1ConfoundedReply,
  buildNof1ConfounderRecordedReply,
  buildNof1EligibilityReply,
  buildNof1UnsafeReply,
  buildNof1StatusReply,
  buildNof1InactiveLifecycleReply,
  buildNof1InsufficientOutcomeReply,
  buildNof1ProgressReply,
} from "@/lib/dante-core/nof1-engine/replies";
import type { NOf1Experiment, Nof1Session } from "@/lib/dante-core/nof1-engine/types";
import type { RiskEvaluationResult } from "@/lib/dante-core/risk-accumulator/types";
import { isDurableNof1Id } from "@/lib/dante-core/nof1-engine/persistence-guard";

export type Nof1PersistPatch = {
  experimentId: string;
  status?: NOf1Experiment["status"];
  confounders?: string[];
  protocolAdherence?: NOf1Experiment["protocolAdherence"];
  conclusion?: NOf1Experiment["conclusion"];
  completedAt?: string | null;
};

export type Nof1TurnResult = {
  session: Nof1Session;
  reply: string | null;
  /** When true, Safety already owns the turn — N-of-1 must not distract. */
  deferredToSafety: boolean;
  /**
   * Explicit accept detected — route must create pending write confirmation.
   * Experiment remains PROPOSED until Confirm executes persistence.
   */
  needsWriteConfirmation: boolean;
  /** Draft payload for accept_nof1_experiment pending action. */
  acceptDraft: NOf1Experiment | null;
  /** Durable update to apply when experiment id is a persisted UUID. */
  persistPatch: Nof1PersistPatch | null;
};

function buildPendingAcceptReply(experiment: NOf1Experiment, language: "en" | "vi"): string {
  if (language === "vi") {
    return [
      `Ông đã đồng ý chạy test ${experiment.experimentWindow.durationDays} ngày.`,
      "Mình chưa ghi vào storage — hãy Confirm để kích hoạt ACTIVE (tool authority).",
      `Biến test: ${experiment.variableUnderTest}. Control: ${experiment.controlledVariables.join(", ")}.`,
    ].join("\n\n");
  }
  return [
    `You agreed to the ${experiment.experimentWindow.durationDays}-day test.`,
    "Nothing is persisted yet — Confirm to activate ACTIVE (tool authority).",
    `Variable under test: ${experiment.variableUnderTest}. Control: ${experiment.controlledVariables.join(", ")}.`,
  ].join("\n\n");
}

/**
 * Process one user turn against prior session state.
 * Deterministic; no LLM; never bypasses confirmation.
 * Does NOT write to the database — route/tool layer owns persistence.
 */
export function processNof1Turn(input: {
  priorSession: Nof1Session;
  message: string;
  language: "en" | "vi";
  safetyTriggered: boolean;
  riskEvaluation?: RiskEvaluationResult | null;
  now?: Date;
}): Nof1TurnResult {
  const language = input.language;
  let session: Nof1Session = {
    experiment: input.priorSession.experiment
      ? { ...input.priorSession.experiment, confounders: [...input.priorSession.experiment.confounders] }
      : null,
    lastProposalId: input.priorSession.lastProposalId,
  };

  const emptyExtras = {
    needsWriteConfirmation: false,
    acceptDraft: null as NOf1Experiment | null,
    persistPatch: null as Nof1PersistPatch | null,
  };

  if (input.safetyTriggered) {
    if (
      session.experiment &&
      (session.experiment.status === "ACTIVE" ||
        session.experiment.status === "ACCEPTED" ||
        session.experiment.status === "PROPOSED" ||
        session.experiment.status === "CONFOUNDED")
    ) {
      const aborted = abortExperimentForSafety(session.experiment);
      session = { ...session, experiment: aborted };
      const patch =
        isDurableNof1Id(aborted.id)
          ? {
              experimentId: aborted.id,
              status: aborted.status,
              completedAt: aborted.completedAt ?? new Date().toISOString(),
            }
          : null;
      return { session, reply: null, deferredToSafety: true, ...emptyExtras, persistPatch: patch };
    }
    return { session, reply: null, deferredToSafety: true, ...emptyExtras };
  }

  if (session.experiment && detectsCancel(input.message)) {
    const cancelled = cancelExperiment(session.experiment);
    session = { ...session, experiment: cancelled };
    const patch =
      isDurableNof1Id(cancelled.id)
        ? {
            experimentId: cancelled.id,
            status: cancelled.status,
            completedAt: cancelled.completedAt ?? new Date().toISOString(),
          }
        : null;
    return {
      session,
      reply: buildNof1CancelledReply(language),
      deferredToSafety: false,
      ...emptyExtras,
      persistPatch: patch,
    };
  }

  if (session.experiment?.status === "ACTIVATION_FAILED") {
    if (detectsRetry(input.message)) {
      const draft = {
        ...session.experiment,
        id: `nof1:retry:${(input.now ?? new Date()).getTime()}`,
        status: "PENDING_CONFIRMATION" as const,
        userConfirmed: false,
        activationError: undefined,
      };
      return {
        session: { experiment: draft, lastProposalId: draft.id },
        reply: buildPendingAcceptReply(draft, language),
        deferredToSafety: false,
        needsWriteConfirmation: true,
        acceptDraft: draft,
        persistPatch: null,
      };
    }
    if (detectsExperimentStatusQuery(input.message)) {
      return {
        session,
        reply: buildNof1StatusReply(session.experiment, language),
        deferredToSafety: false,
        ...emptyExtras,
      };
    }
    if (detectsOutcomeReport(input.message) || detectConfoundersFromMessage(input.message).length > 0) {
      return {
        session,
        reply: buildNof1InactiveLifecycleReply(language),
        deferredToSafety: false,
        ...emptyExtras,
      };
    }
    return { session, reply: null, deferredToSafety: false, ...emptyExtras };
  }

  if (
    session.experiment &&
    (session.experiment.status === "ACTIVE" || session.experiment.status === "CONFOUNDED") &&
    detectsExperimentStatusQuery(input.message)
  ) {
    return {
      session,
      reply: buildNof1StatusReply(session.experiment, language),
      deferredToSafety: false,
      ...emptyExtras,
    };
  }

  if (
    session.experiment &&
    (session.experiment.status === "ACTIVE" ||
      session.experiment.status === "ACCEPTED" ||
      session.experiment.status === "CONFOUNDED")
  ) {
    const confounders = detectConfoundersFromMessage(input.message);
    if (confounders.length > 0) {
      const updated = applyConfoundersToExperiment(session.experiment, confounders);
      session = { ...session, experiment: updated };
      const patch =
        isDurableNof1Id(updated.id)
          ? {
              experimentId: updated.id,
              status: updated.status,
              confounders: updated.confounders,
              protocolAdherence: updated.protocolAdherence,
              completedAt: updated.status === "CONFOUNDED" ? updated.completedAt ?? null : undefined,
            }
          : null;
      if (updated.status === "CONFOUNDED") {
        return {
          session,
          reply: buildNof1ConfoundedReply(updated, language),
          deferredToSafety: false,
          ...emptyExtras,
          persistPatch: patch,
        };
      }
      if (patch) {
        return {
          session,
          reply: buildNof1ConfounderRecordedReply(updated, language),
          deferredToSafety: false,
          ...emptyExtras,
          persistPatch: patch,
        };
      }
    }

    const outcome = detectsOutcomeReport(input.message);
    if (outcome.isOutcomeTurn && session.experiment) {
      if (!detectsExperimentCompletionRequest(input.message)) {
        return {
          session,
          reply: buildNof1ProgressReply(language),
          deferredToSafety: false,
          ...emptyExtras,
        };
      }
      const adherence =
        session.experiment.confounders.length === 0
          ? "COMPLETE"
          : session.experiment.confounders.length === 1
            ? "PARTIAL"
            : "POOR";
      const completed = evaluateNof1Experiment({
        experiment: session.experiment,
        outcomeReport: outcome,
        confounderCount: session.experiment.confounders.length,
        protocolAdherence: adherence,
      });
      session = { ...session, experiment: completed };
      const hasPersistableOutcome =
        completed.status === "COMPLETED" ||
        (completed.status === "CONFOUNDED" && Boolean(completed.completedAt));
      const patch =
        isDurableNof1Id(completed.id) && hasPersistableOutcome
          ? {
              experimentId: completed.id,
              status: completed.status,
              confounders: completed.confounders,
              protocolAdherence: completed.protocolAdherence,
              conclusion: completed.conclusion,
              completedAt: completed.completedAt,
            }
          : null;
      return {
        session,
        reply: outcome.missingOutcome
          ? buildNof1InsufficientOutcomeReply(language)
          : buildNof1CompletionReply(completed, language),
        deferredToSafety: false,
        ...emptyExtras,
        persistPatch: patch,
      };
    }

    // An in-flight experiment owns its lifecycle. Unrelated or newly causal
    // wording must not replace it with a fresh proposal.
    return { session, reply: null, deferredToSafety: false, ...emptyExtras };
  }

  if (session.experiment?.status === "PROPOSED") {
    if (detectsAssumedConsent(input.message)) {
      return {
        session,
        reply: buildNof1AssumedConsentReply(language),
        deferredToSafety: false,
        ...emptyExtras,
      };
    }
    if (detectsExplicitAccept(input.message)) {
      // Do NOT mark ACTIVE here — persistence requires Confirm write tool.
      const draft = {
        ...session.experiment,
        status: "PROPOSED" as const,
        userConfirmed: false,
      };
      return {
        session: { ...session, experiment: draft },
        reply: buildPendingAcceptReply(draft, language),
        deferredToSafety: false,
        needsWriteConfirmation: true,
        acceptDraft: draft,
        persistPatch: null,
      };
    }
  }

  if (isUnsafeExperimentRequest(input.message)) {
    return {
      session,
      reply: buildNof1UnsafeReply(language),
      deferredToSafety: false,
      ...emptyExtras,
    };
  }

  const eligibility = evaluateNof1Eligibility({
    message: input.message,
    safetyTriggered: false,
    riskEvaluation: input.riskEvaluation,
    confidenceHasLowCausal: true,
  });

  if (!eligibility.eligible) {
    const reply = buildNof1EligibilityReply(eligibility, null, language);
    return { session, reply, deferredToSafety: false, ...emptyExtras };
  }

  const proposal = buildExperimentProposal({
    trigger: eligibility.trigger,
    now: input.now,
    language,
  });
  session = { experiment: proposal, lastProposalId: proposal.id };
  return {
    session,
    reply: buildNof1EligibilityReply(eligibility, proposal, language),
    deferredToSafety: false,
    ...emptyExtras,
  };
}

export function ensureNof1Session(session: Nof1Session | null | undefined): Nof1Session {
  return session ?? createEmptyNof1Session();
}
