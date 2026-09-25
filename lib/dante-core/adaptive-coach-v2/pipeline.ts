import { createCapsule } from "@/lib/dante-core/adaptive-coach-v2/context/capsule";
import {
  EMPTY_COMMITMENTS,
  createCommitmentCapsule,
  detectRejectedClaimReassertion,
  rejectedClaimContinuityReply,
  updateConversationCommitments,
} from "@/lib/dante-core/adaptive-coach-v2/context/conversation-commitments";
import { scheduleContext } from "@/lib/dante-core/adaptive-coach-v2/context/scheduler";
import { buildDanteDecision, type BuildDanteDecisionInput } from "@/lib/dante-core/adaptive-coach-v2/decision-object";
import { modelHumanSessionSignals } from "@/lib/dante-core/adaptive-coach-v2/human-modeler-lite";
import { evaluateManipulationAndToolIntent } from "@/lib/dante-core/adaptive-coach-v2/manipulation-tool-separation";
import { buildMonitorTrace } from "@/lib/dante-core/adaptive-coach-v2/metacognition/monitor";
import { containsInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";
import { realizeNaturalResponse } from "@/lib/dante-core/adaptive-coach-v2/natural-response/plane";
import {
  detectTemplateAttractor,
  extractRationaleCodes,
} from "@/lib/dante-core/adaptive-coach-v2/natural-response/repetition-detector";
import {
  EMPTY_STRATEGY_STATE,
  updateStrategyState,
  type ResponseStrategyState,
} from "@/lib/dante-core/adaptive-coach-v2/natural-response/strategy-state";
import { buildDevTrace } from "@/lib/dante-core/adaptive-coach-v2/observability";
import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import type {
  ConversationCommitments,
  DanteContextCapsule,
  DanteResponseIntent,
} from "@/lib/dante-core/adaptive-coach-v2/types";

export type RunAdaptiveCoachTurnInput = {
  rawText: string;
  responseIntent?: DanteResponseIntent;
  proposedClaims?: BuildDanteDecisionInput["proposedClaims"];
  safety?: BuildDanteDecisionInput["safety"];
  risk?: BuildDanteDecisionInput["risk"];
  experiment?: BuildDanteDecisionInput["experiment"];
  tool?: BuildDanteDecisionInput["tool"];
  discourse?: BuildDanteDecisionInput["discourse"];
  draftReply?: string;
  activeContextSummary?: string;
  l1?: DanteContextCapsule[];
  l2Candidates?: DanteContextCapsule[];
  l3Candidates?: DanteContextCapsule[];
  strategyState?: ResponseStrategyState;
  recentReplies?: string[];
  commitments?: ConversationCommitments;
  claimConstraints?: BuildDanteDecisionInput["claimConstraints"];
};

function isPromptInjection(text: string): boolean {
  return /(?:ignore|forget|override).{0,30}(?:previous|prior|system|instructions|context)|(?:bo qua|quen).{0,30}(?:chi dan|ngu canh|truoc do)/i.test(text);
}

export function runAdaptiveCoachTurn(input: RunAdaptiveCoachTurnInput) {
  const interpretation = interpretUserTurn(input.rawText);
  const humanSignals = modelHumanSessionSignals(input.rawText);
  const previousCommitments = input.commitments ?? EMPTY_COMMITMENTS;
  const rejectedReassert = detectRejectedClaimReassertion(input.rawText, previousCommitments);
  const manipulationTool = evaluateManipulationAndToolIntent(input.rawText);
  const promptInjection = isPromptInjection(input.rawText) || manipulationTool.manipulation;

  const priorFingerprint = previousCommitments.rationaleCodes.length > 0
    ? {
      responseIntent: input.strategyState?.previousResponseIntent ?? "COACH",
      rationaleCodes: previousCommitments.rationaleCodes,
    }
    : null;
  const repetition = detectTemplateAttractor(input.recentReplies ?? [], {
    previousFingerprint: priorFingerprint,
    draftReply: input.draftReply ?? input.experiment?.userFacingMeaning,
    draftIntent: input.responseIntent ?? "COACH",
  });

  const responseIntent: DanteResponseIntent | undefined = promptInjection ? "BOUNDARY" : input.responseIntent;
  const language = interpretation.language === "vi" || interpretation.language === "mixed" ? "vi" : "en";

  if (rejectedReassert) {
    const continuityReply = rejectedClaimContinuityReply(language);
    const decision = buildDanteDecision({
      interpretation,
      responseIntent: "EXPERIMENT_UPDATE",
      experiment: {
        userFacingMeaning: continuityReply,
        internalStatus: "CONFOUNDED",
      },
      claimConstraints: {
        sleepCausality: "NOT_ESTABLISHED",
        rejectedClaims: ["sleep_is_confirmed_cause"],
        persisted: false,
      },
      alreadyExplainedRationale: true,
    });
    const commitments = updateConversationCommitments(previousCommitments, {
      decision,
      rejectedClaim: rejectedReassert,
      reply: continuityReply,
    });
    const scheduled = scheduleContext({
      task: "REALIZE_RESPONSE",
      l1: [createCommitmentCapsule(commitments)],
    });
    const monitor = buildMonitorTrace({
      decision,
      tasksCompleted: ["INTERPRET_CURRENT_STATE", "REALIZE_RESPONSE"],
      contextTelemetry: scheduled.telemetry,
      internalJargonPresent: false,
    });
    return {
      interpretation,
      decision,
      context: scheduled,
      reply: continuityReply,
      strategyState: updateStrategyState(input.strategyState ?? EMPTY_STRATEGY_STATE, {
        responseIntent: "EXPERIMENT_UPDATE",
        reply: continuityReply,
        rationales: ["sleep_causality=NOT_ESTABLISHED"],
      }),
      humanSignals,
      commitments,
      manipulationTool,
      extraLlmCalls: 0,
      telemetry: buildDevTrace({
        interpretation,
        decision,
        contextTelemetry: scheduled.telemetry,
        monitor,
      }),
    };
  }

  const activeContextMeaning = input.activeContextSummary
    ? `We can continue from the current context: ${input.activeContextSummary}`
    : undefined;
  const experiment = responseIntent === "BOUNDARY" && activeContextMeaning
    ? { userFacingMeaning: activeContextMeaning, internalStatus: input.experiment?.internalStatus }
    : input.experiment;

  // Manipulation without write intent must not invent confirmation requirements.
  const tool = input.tool ?? (manipulationTool.writeIntent
    ? { permission: "CONFIRMATION_REQUIRED" as const, persisted: false }
    : undefined);

  const decision = buildDanteDecision({
    interpretation,
    responseIntent,
    proposedClaims: input.proposedClaims,
    safety: input.safety,
    risk: input.risk,
    experiment,
    tool,
    discourse: {
      ...input.discourse,
      alreadyExplained: [
        ...(input.discourse?.alreadyExplained ?? []),
        ...previousCommitments.alreadyExplainedRationales,
      ],
      rationaleCodes: [
        ...(input.discourse?.rationaleCodes ?? []),
        ...previousCommitments.rationaleCodes,
        ...extractRationaleCodes(experiment?.userFacingMeaning ?? ""),
      ],
    },
    style: {
      frustrated: humanSignals.frustrated,
      joking: humanSignals.joking,
      slangLevel: humanSignals.slang,
    },
    templateAttractor: repetition.templateAttractor,
    alreadyExplainedRationale: repetition.alreadyExplainedRationale,
    claimConstraints: input.claimConstraints,
  });

  const now = new Date().toISOString();
  const commitments = updateConversationCommitments(previousCommitments, {
    decision,
    reply: input.draftReply,
    pendingAction: tool?.permission === "CONFIRMATION_REQUIRED" ? "workout_change_waiting_for_confirmation" : undefined,
  });

  const l1 = input.l1 ?? [createCapsule({
    sourceType: "current_turn",
    provenance: "EXPLICIT_CURRENT_REPORT",
    trustLevel: "HIGH",
    temporalScope: "CURRENT",
    facts: interpretation.propositions.map((item) => ({
      concept: item.concept,
      state: item.state,
      provenance: item.provenance,
    })),
    raw: interpretation.rawText,
    createdAt: now,
    safetyRelevance: decision.safety.relevantSignals,
    commitments,
  })];
  if (input.activeContextSummary) {
    l1.push(createCapsule({
      sourceType: "active_context",
      provenance: "DERIVED",
      trustLevel: "MEDIUM",
      temporalScope: "CURRENT",
      summary: input.activeContextSummary,
      createdAt: now,
    }));
  }
  l1.push(createCommitmentCapsule(commitments, now));

  const scheduled = scheduleContext({
    task: "REALIZE_RESPONSE",
    l1,
    l2Candidates: input.l2Candidates,
    l3Candidates: input.l3Candidates,
  });
  const previousStrategy = input.strategyState ?? EMPTY_STRATEGY_STATE;
  const reply = realizeNaturalResponse({ decision, strategyState: previousStrategy, draftReply: input.draftReply });
  const strategyState = updateStrategyState(previousStrategy, {
    responseIntent: decision.responseIntent,
    reply,
    rationales: [
      ...(decision.experiment ? [decision.experiment.userFacingMeaning] : []),
      ...decision.discourse.rationaleCodes ?? [],
    ],
  });
  const monitor = buildMonitorTrace({
    decision,
    tasksCompleted: ["INTERPRET_CURRENT_STATE", "RUN_SAFETY_CHECK", "RETRIEVE_MEMORY", "ASSESS_PROVENANCE", "REALIZE_RESPONSE"],
    contextTelemetry: scheduled.telemetry,
    internalJargonPresent: containsInternalJargon(reply),
  });

  return {
    interpretation,
    decision,
    context: scheduled,
    reply,
    strategyState,
    humanSignals,
    commitments,
    manipulationTool,
    extraLlmCalls: 0,
    telemetry: buildDevTrace({ interpretation, decision, contextTelemetry: scheduled.telemetry, monitor }),
  };
}
