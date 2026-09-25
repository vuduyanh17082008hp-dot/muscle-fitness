import type { ContextTelemetry } from "@/lib/dante-core/adaptive-coach-v2/context/scheduler";
import type { DanteDecision, DanteTaskId } from "@/lib/dante-core/adaptive-coach-v2/types";

export type AdaptiveCoachTrace = {
  traceId: string;
  timestamp: string;
  tasksCompleted: DanteTaskId[];
  semanticFacts: Array<{ concept: string; state: string; provenance: string }>;
  safetyAction: DanteDecision["safety"]["action"];
  responseIntent: DanteDecision["responseIntent"];
  contextTelemetry?: ContextTelemetry;
  toolPermission?: NonNullable<DanteDecision["tool"]>["permission"];
  checks: {
    assistantEvidenceRejected: boolean;
    internalJargonPresent: boolean;
    safetyTruthPreserved: boolean;
  };
};

export function buildMonitorTrace(input: {
  traceId?: string;
  decision: DanteDecision;
  tasksCompleted: DanteTaskId[];
  contextTelemetry?: ContextTelemetry;
  internalJargonPresent?: boolean;
}): AdaptiveCoachTrace {
  const timestamp = new Date().toISOString();
  return {
    traceId: input.traceId ?? `trace_${timestamp.replace(/\D/g, "")}`,
    timestamp,
    tasksCompleted: input.tasksCompleted,
    semanticFacts: input.decision.currentState.facts,
    safetyAction: input.decision.safety.action,
    responseIntent: input.decision.responseIntent,
    ...(input.contextTelemetry ? { contextTelemetry: input.contextTelemetry } : {}),
    ...(input.decision.tool ? { toolPermission: input.decision.tool.permission } : {}),
    checks: {
      assistantEvidenceRejected: input.decision.evidence.prohibitedAttributions?.some((item) =>
        item.reason.toLowerCase().includes("assistant")) ?? false,
      internalJargonPresent: input.internalJargonPresent ?? false,
      safetyTruthPreserved: input.decision.safety.action !== "ESCALATE" || input.decision.responseIntent === "SAFETY",
    },
  };
}
