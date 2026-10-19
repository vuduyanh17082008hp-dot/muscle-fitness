import type { OrchestrationDiagnostics } from "./types"

/**
 * Privacy-safe, in-memory development telemetry for orchestration. Enums, booleans and counts only:
 * no message text, no foods, no Athlete State, no reasoning. Nothing is persisted or sent anywhere (no existing
 * persistent observability sink serves this layer, and Phase 2 forbids new tables);
 * NUTRITION_COACH_TELEMETRY=1 (non-production) also prints each event.
 */

const counters = { turns: 0, orchestrated: 0, fallbacks: 0, continuations: 0, priorOffers: 0, clarifications: 0, retrievals: 0, stateReads: 0, confirmations: 0, contextBudgetExceeded: 0, droppedContext: 0, plannerCalls: 0, invalidations: 0 }
const latencies: number[] = []

export function recordOrchestrationEvent(event: OrchestrationDiagnostics): void {
  counters.turns += 1
  if (event.source === "fallback") counters.fallbacks += 1
  else counters.orchestrated += 1
  if (event.conversationContinuation) counters.continuations += 1
  if (event.referencedPriorOffer) counters.priorOffers += 1
  if (event.clarificationNeeded) counters.clarifications += 1
  if (event.retrievalUsed) counters.retrievals += 1
  if (event.athleteStateUsed) counters.stateReads += 1
  if (event.confirmationRequired) counters.confirmations += 1
  if (event.contextBudgetExceeded) counters.contextBudgetExceeded += 1
  counters.droppedContext += event.droppedContextCount ?? 0
  counters.plannerCalls += event.plannerCalls
  counters.invalidations += event.invalidationTriggers?.length ?? 0
  if (event.plannerLatencyMs !== undefined) latencies.push(event.plannerLatencyMs)
  if (process.env.NODE_ENV !== "production" && process.env.NUTRITION_COACH_TELEMETRY === "1") console.debug("[nutrition-orchestration]", JSON.stringify(event))
}

export const getOrchestrationMetrics = () => {
  const sorted = [...latencies].sort((a, b) => a - b)
  return {
    ...counters,
    plannerLatencyAvgMs: sorted.length ? Math.round(sorted.reduce((sum, n) => sum + n, 0) / sorted.length) : 0,
    plannerLatencyP95Ms: sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0,
  }
}

export function resetOrchestrationMetrics(): void {
  for (const key of Object.keys(counters) as Array<keyof typeof counters>) counters[key] = 0
  latencies.length = 0
}
