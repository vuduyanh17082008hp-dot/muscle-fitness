/**
 * Phase 2 — strategy composition, conflict resolution, safety lifecycle, Gate B.
 * Priority orders. Never silently deletes unrelated obligations.
 */

import type {
  GateResult,
  ResponseStrategy,
  SafetyPhase,
  TurnAnalysis,
  VersionedState,
} from "@/lib/dante-core/coherence/types";
import { activeBoundaries } from "@/lib/dante-core/coherence/reducer";
import { advanceSafetyPhase } from "@/lib/dante-core/coherence/safety-evidence";

export function nextSafetyPhase(input: {
  snapshot: VersionedState;
  analysis: TurnAnalysis;
  hardSafetyTriggered: boolean;
}): SafetyPhase {
  // Evidence-driven, never turn-count-driven: see safety-evidence.ts. A follow-up cue only means something
  // against an already-tracked episode; from NONE/EXIT it creates nothing.
  return advanceSafetyPhase({
    current: input.snapshot.safety.phase,
    fresh: input.hardSafetyTriggered || input.analysis.safetyCandidates.current,
    evidence: input.analysis.safetyFollowUp,
  });
}

export function composeStrategies(input: {
  analysis: TurnAnalysis;
  safetyPhase: SafetyPhase;
  competingCorrections: boolean;
  entryClass: "SAFETY_PRIORITY" | "STANDARD" | "FAST";
  snapshot?: VersionedState;
}): ResponseStrategy[] {
  const strategies: ResponseStrategy[] = [];
  const safetyActive = input.safetyPhase === "ENTER"
    || input.safetyPhase === "PERSIST"
    || input.safetyPhase === "ESCALATE";

  if (safetyActive) strategies.push("SAFETY_HANDLE");
  if (input.competingCorrections) strategies.push("CLARIFY");
  if (input.analysis.corrections.some((c) => !c.conflictsWith && c.statement !== "CONFLICT")) {
    strategies.push("ACKNOWLEDGE_CORRECTION");
  }
  const hasBoundary = input.analysis.boundaries.length > 0
    || Boolean(input.snapshot && activeBoundaries(input.snapshot).length > 0);
  if (hasBoundary) strategies.push("BOUNDARY_RESPECT");
  if (input.analysis.unclearPriorAsk) strategies.push("CLARIFY");
  if (input.analysis.obligations.length > 0 || input.entryClass !== "FAST") strategies.push("ANSWER");
  else strategies.push("ANSWER");
  if (input.analysis.safetyCandidates.historicalOnly && !safetyActive) {
    strategies.push("GUIDE");
  }
  if (input.analysis.profanityWithoutSafety) {
    // Stay calm; do not escalate or lecture.
  }

  const unique: ResponseStrategy[] = [];
  for (const s of strategies) {
    if (!unique.includes(s)) unique.push(s);
  }
  return unique;
}

export function evaluateGateB(input: {
  snapshot: VersionedState;
  analysis: TurnAnalysis;
  strategies: ResponseStrategy[];
  safetyPhase: SafetyPhase;
}): GateResult {
  const safetyActive = input.safetyPhase === "ENTER"
    || input.safetyPhase === "PERSIST"
    || input.safetyPhase === "ESCALATE";
  if (safetyActive && !input.strategies.includes("SAFETY_HANDLE")) {
    return { passed: false, code: "SAFETY_STRATEGY_MISSING", message: "active safety without SAFETY_HANDLE" };
  }
  if (input.analysis.corrections.some((c) => !c.conflictsWith) && !input.strategies.includes("ACKNOWLEDGE_CORRECTION") && !input.analysis.competingCorrections) {
    if (input.analysis.corrections.length > 0 && input.analysis.corrections.every((c) => c.statement !== "CONFLICT")) {
      return { passed: false, code: "CORRECTION_NOT_ACKED", message: "correction not in strategy set" };
    }
  }
  const privacyBoundary = activeBoundaries(input.snapshot).some((b) => b.value.kind === "no_memory_dump")
    || input.analysis.boundaries.some((b) => b.kind === "no_memory_dump");
  if (privacyBoundary && input.strategies.includes("SAFETY_HANDLE") && !input.strategies.includes("BOUNDARY_RESPECT") && input.analysis.boundaries.length > 0) {
    // Safety may override only the relevant slice; boundary strategy should still be present.
    return { passed: false, code: "BOUNDARY_DROPPED", message: "safety overrode unrelated boundary strategy" };
  }
  if (input.analysis.competingCorrections && !input.strategies.includes("CLARIFY")) {
    return { passed: false, code: "CONFLICT_NO_CLARIFY", message: "competing corrections need clarification" };
  }
  return { passed: true, code: null, message: null };
}

export function safetyOverridesBoundary(input: {
  safetyPhase: SafetyPhase;
  boundaryKind: string;
}): { override: boolean; transparent: boolean } {
  const safetyActive = input.safetyPhase === "ENTER"
    || input.safetyPhase === "PERSIST"
    || input.safetyPhase === "ESCALATE";
  if (!safetyActive) return { override: false, transparent: false };
  if (input.boundaryKind === "no_lecturing" || input.boundaryKind === "no_jargon") {
    return { override: true, transparent: true };
  }
  return { override: false, transparent: false };
}
