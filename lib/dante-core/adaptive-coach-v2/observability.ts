import type { ContextTelemetry } from "@/lib/dante-core/adaptive-coach-v2/context/scheduler";
import type { AdaptiveCoachTrace } from "@/lib/dante-core/adaptive-coach-v2/metacognition/monitor";
import type { DanteDecision, SemanticInterpretation } from "@/lib/dante-core/adaptive-coach-v2/types";

export type AdaptiveCoachDevTrace = {
  interpretation: {
    language: SemanticInterpretation["language"];
    propositions: number;
    concepts: string[];
  };
  decision: {
    intent: DanteDecision["responseIntent"];
    safetyAction: DanteDecision["safety"]["action"];
    toolPermission?: NonNullable<DanteDecision["tool"]>["permission"];
  };
  context: ContextTelemetry;
  monitor: AdaptiveCoachTrace;
};

export function buildDevTrace(input: {
  interpretation: SemanticInterpretation;
  decision: DanteDecision;
  contextTelemetry: ContextTelemetry;
  monitor: AdaptiveCoachTrace;
}): AdaptiveCoachDevTrace {
  return {
    interpretation: {
      language: input.interpretation.language,
      propositions: input.interpretation.propositions.length,
      concepts: [...new Set(input.interpretation.propositions.map((item) => item.concept))],
    },
    decision: {
      intent: input.decision.responseIntent,
      safetyAction: input.decision.safety.action,
      ...(input.decision.tool ? { toolPermission: input.decision.tool.permission } : {}),
    },
    context: input.contextTelemetry,
    monitor: input.monitor,
  };
}
