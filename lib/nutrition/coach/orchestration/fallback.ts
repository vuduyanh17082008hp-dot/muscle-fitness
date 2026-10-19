import type { OrchestrationDiagnostics } from "./types"

/**
 * FallbackHierarchy (never into more permissive behavior; safety, authorization, confirmation, deterministic
 * exactness and hard constraints are never bypassed at any stage):
 *   1. retry the planner ONCE with reduced context (schema / size / transient failures only) — orchestrate.ts
 *   2. validated deterministic understanding (no model) when it can resolve the turn
 *   3. the existing safe Nutrition Coach path (this marker; the caller simply continues)
 *   4. one safe clarification when the deterministic evidence is ambiguous
 * Orchestration never throws into the chat handler and the safety pre-gate always ran before it.
 */
export function fallbackDiagnostics(
  reason: NonNullable<OrchestrationDiagnostics["fallbackReason"]>,
  startedAt: number,
  plannerCalls: number,
  now: () => number = Date.now,
  extra: Partial<Pick<OrchestrationDiagnostics, "fallbackStage" | "degradedCapabilities" | "contextBudgetExceeded" | "plannerLatencyMs">> = {},
): OrchestrationDiagnostics {
  return {
    conversationContinuation: false,
    referencedPriorOffer: false,
    responseMode: null,
    toolNeeds: [],
    clarificationNeeded: false,
    retrievalUsed: false,
    athleteStateUsed: false,
    confirmationRequired: false,
    orchestrationLatencyMs: Math.max(0, now() - startedAt),
    source: "fallback",
    fallbackReason: reason,
    plannerCalls,
    fallbackStage: 3,
    degradedCapabilities: ["adaptive_planning"],
    ...extra,
  }
}
