import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AthleteState } from "@/lib/athlete-state/types";
import type { DanteProposedAction } from "@/lib/dante-core/actions/types";
import type { DailyDecision } from "@/lib/dante-core/daily-decision-engine";
import type { TraceableDecision } from "@/lib/dante-core/types";
import { loadLearnedPatterns } from "@/lib/dante-core/memory-hierarchy/load-patterns";
import {
  assessAdaptationStability,
  buildUncertaintyProfile,
  detectAthleteDrift,
  executeShadowControlFlow,
  scoreContextualStrategies,
} from "@/lib/dante-core/shadow/adaptive-control";
import {
  calibrationObservationFromOutcome,
  linkRecommendationOutcome,
  summarizeCalibration,
  unknownOutcome,
} from "@/lib/dante-core/shadow/outcome-calibration";
import {
  appendShadowEvent,
  loadRecentShadowEvents,
  type ShadowEventRecord,
} from "@/lib/dante-core/shadow/persistence";
import {
  athleteStateToDriftSnapshot,
  extractStructuredSignals,
} from "@/lib/dante-core/shadow/signal-extraction";
import {
  CURRENT_PHASE3_PROMOTION_LEVEL,
  type AdaptationRecord,
  type AthleteDriftSnapshot,
  type MultiDimensionalOutcome,
  type OutcomeValue,
  type ShadowDecision,
  type ShadowStrategyCandidate,
  type CalibrationObservation,
  type UncertaintyProfile,
} from "@/lib/dante-core/shadow/types";
import {
  recordPhase4OutcomeEvaluation,
  recordPhase4RecommendationTrace,
} from "@/lib/dante-core/validation/instrumentation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSnapshot(value: unknown, userId: string): AthleteDriftSnapshot | null {
  if (!isRecord(value) || value.userId !== userId || typeof value.capturedAt !== "string") return null;
  return value as AthleteDriftSnapshot;
}

type StoredProductionAdaptation = Pick<
  AdaptationRecord,
  "action" | "direction" | "value" | "evidenceSource"
>;

export function productionActionToAdaptation(action: DanteProposedAction): StoredProductionAdaptation {
  switch (action.payload.type) {
    case "modify_volume":
      return {
        action: `modify_volume:${action.payload.sessionExerciseId}`,
        direction: action.payload.after.sets < action.payload.before.sets ? "DECREASE" : "INCREASE",
        value: action.payload.after.sets,
        evidenceSource: "dante_recommendation",
      };
    case "adjust_sets_reps": {
      const before = action.payload.before.sets;
      const after = action.payload.after.sets;
      return {
        action: `adjust_sets_reps:${action.payload.sessionExerciseId}`,
        direction: before !== null && after !== null
          ? after < before ? "DECREASE" : after > before ? "INCREASE" : "HOLD"
          : "OTHER",
        value: after,
        evidenceSource: "dante_recommendation",
      };
    }
    case "postpone_exercise":
      return {
        action: `postpone_exercise:${action.payload.sessionExerciseId}`,
        direction: "DECREASE",
        value: 0,
        evidenceSource: "dante_recommendation",
      };
    case "macro_adjustment":
      return {
        action: `macro_adjustment:${action.payload.macro}`,
        direction: action.payload.direction === "decrease" ? "DECREASE" : "INCREASE",
        value: action.payload.suggestedChangePercent,
        evidenceSource: "dante_recommendation",
      };
    case "recovery_action":
    case "meal_suggestion":
      return {
        action: action.id,
        direction: "OTHER",
        value: null,
        evidenceSource: "dante_recommendation",
      };
  }
}

function isStoredProductionAdaptation(value: unknown): value is StoredProductionAdaptation {
  if (!isRecord(value)) return false;
  return typeof value.action === "string" &&
    ["INCREASE", "DECREASE", "HOLD", "OTHER"].includes(String(value.direction)) &&
    (value.value === null || typeof value.value === "number") &&
    value.evidenceSource === "dante_recommendation";
}

export function historyToAdaptations(
  userId: string,
  history: ShadowEventRecord[],
): AdaptationRecord[] {
  const records: AdaptationRecord[] = [];
  const seenActionDays = new Set<string>();
  const chronological = history
    .filter((event) => event.userId === userId && event.eventType === "SHADOW_DECISION")
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  for (const event of chronological) {
    const stored = Array.isArray(event.metadata.productionAdaptations)
      ? event.metadata.productionAdaptations.filter(isStoredProductionAdaptation)
      : [];
    for (const adaptation of stored) {
      const deduplicationKey = `${adaptation.action}:${event.occurredAt.slice(0, 10)}`;
      if (seenActionDays.has(deduplicationKey)) continue;
      seenActionDays.add(deduplicationKey);
      records.push({
        userId,
        ...adaptation,
        // A proposal is not evidence that the user applied it or improved.
        outcomeImproved: null,
        occurredAt: event.occurredAt,
      });
    }
  }
  return records;
}

function expectedOutcomeForDecision(decision: DailyDecision): MultiDimensionalOutcome {
  const expected = unknownOutcome();
  if (decision.decisionCode === "prioritize_recovery" || decision.decisionCode === "modify_session") {
    expected.recovery = "MAINTAINED";
    expected.pain_safety = "MAINTAINED";
  } else if (decision.decisionCode === "proceed_as_planned") {
    expected.performance = "MAINTAINED";
  }
  return expected;
}

function missingHighValueFields(state: AthleteState): string[] {
  const missing: string[] = [];
  if (state.recovery.sleepHours === null) missing.push("sleep_hours");
  if (state.recovery.stress === null) missing.push("stress");
  if (state.recovery.score === null) missing.push("recovery_score");
  if (!state.profile.goal) missing.push("goal");
  return missing;
}

function decisionConfidence(value: TraceableDecision<DailyDecision>["confidence"]): number {
  if (value === "high") return 0.85;
  if (value === "moderate") return 0.6;
  return 0.35;
}

export function buildShadowRecommendationId(input: {
  productionDecision: TraceableDecision<DailyDecision>;
  productionActions?: DanteProposedAction[];
  observedAt: Date;
}): string {
  const fingerprint = JSON.stringify({
    date: input.observedAt.toISOString().slice(0, 10),
    decision: input.productionDecision,
    actionIds: (input.productionActions ?? []).map((action) => action.id).sort(),
  });
  return `daily:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 24)}`;
}

function pendingOutcomeExists(history: ShadowEventRecord[], now: Date): boolean {
  const linked = new Set(
    history
      .filter((event) => event.eventType === "OUTCOME_LINKED" && event.recommendationId)
      .map((event) => event.recommendationId),
  );
  return history.some((event) => {
    const age = now.getTime() - new Date(event.occurredAt).getTime();
    return event.eventType === "SHADOW_DECISION" &&
      event.recommendationId !== null &&
      !linked.has(event.recommendationId) &&
      age >= 0 &&
      age < 24 * 60 * 60 * 1000;
  });
}

function confidenceForShadowAction(
  action: ShadowDecision["action"],
  uncertainty: UncertaintyProfile,
): number {
  const relevant = action === "ASK"
    ? [uncertainty.state.value]
    : action === "RETRIEVE"
      ? [uncertainty.epistemic.value, uncertainty.tool.value]
      : action === "WAIT"
        ? [uncertainty.outcome.value, uncertainty.causal.value]
        : action === "USE" || action === "EXPLORE"
          ? [
              uncertainty.epistemic.value,
              uncertainty.state.value,
              uncertainty.causal.value,
              uncertainty.strategy.value,
            ]
          : [uncertainty.epistemic.value, uncertainty.state.value];
  return Math.round((1 - Math.max(...relevant)) * 1000) / 1000;
}

/** Best-effort observer called only after production has finalized its decision. */
export async function observeDailyDecisionInShadow(input: {
  supabase: SupabaseClient;
  userId: string;
  athleteState: AthleteState;
  productionDecision: TraceableDecision<DailyDecision>;
  productionActions?: DanteProposedAction[];
  now?: Date;
}): Promise<ShadowDecision | null> {
  if (CURRENT_PHASE3_PROMOTION_LEVEL !== "SHADOW") return null;
  const now = input.now ?? new Date();
  const [loadedPatterns, history] = await Promise.all([
    loadLearnedPatterns(input.supabase, input.userId),
    loadRecentShadowEvents(input.supabase, input.userId, 30),
  ]);
  // Defense in depth over the query-level user filter and database RLS.
  const patterns = loadedPatterns.filter((pattern) => pattern.userId === input.userId);
  const recommendationId = buildShadowRecommendationId({
    productionDecision: input.productionDecision,
    productionActions: input.productionActions,
    observedAt: now,
  });
  const priorObservation = history.find((event) =>
    event.userId === input.userId &&
    event.eventType === "SHADOW_DECISION" &&
    event.recommendationId === recommendationId &&
    event.shadowDecision?.userId === input.userId
  );
  if (priorObservation?.shadowDecision) return priorObservation.shadowDecision;
  const signals = extractStructuredSignals({
    userId: input.userId,
    athleteState: input.athleteState,
    timestamp: now.toISOString(),
  });
  const snapshot = athleteStateToDriftSnapshot(input.userId, input.athleteState);
  const historicalSnapshots = history
    .map((event) => asSnapshot(event.metadata.snapshot, input.userId))
    .filter((value): value is AthleteDriftSnapshot => value !== null)
    .reverse();
  const baseline = historicalSnapshots[0] ?? snapshot;
  const drift = detectAthleteDrift({
    userId: input.userId,
    current: snapshot,
    baseline,
    recent: historicalSnapshots.slice(-3),
  });
  const stability = assessAdaptationStability(input.userId, historyToAdaptations(input.userId, history));
  const missingFields = missingHighValueFields(input.athleteState);
  const bestPattern = patterns[0];
  const uncertainty = buildUncertaintyProfile({
    verifiedEvidenceCount: bestPattern?.sampleCount ?? 0,
    missingStateFields: missingFields,
    stateConfidence: input.athleteState.derived.overallConfidence,
    confounderCount: 0,
    causalEvidenceCount: 0,
    strategySampleCount: bestPattern?.sampleCount ?? 0,
    strategyConfidence: bestPattern?.confidence ?? 0,
    outcomeMature: !pendingOutcomeExists(history, now),
    outcomeAvailable: history.some((event) => event.eventType === "OUTCOME_LINKED"),
    toolAttempted: false,
    toolSucceeded: null,
  });
  const candidates: ShadowStrategyCandidate[] = patterns.map((pattern) => ({
    id: pattern.interventionType,
    userId: input.userId,
    contextSignature: signals.contextSignature,
    expectedUtility: pattern.sampleCount > 0 ? pattern.positiveCount / pattern.sampleCount : 0,
    informationGain: pattern.sampleCount < 5 ? 0.35 : 0.1,
    risk: pattern.requiresConfirmation ? 0.45 : 0.2,
    cost: 0.15,
    pattern,
  }));
  const strategies = scoreContextualStrategies({
    userId: input.userId,
    contextSignature: signals.contextSignature,
    candidates,
    drift,
    stability,
    now,
  });
  const flow = executeShadowControlFlow({
    userId: input.userId,
    contextSignature: signals.contextSignature,
    uncertainty,
    drift,
    stability,
    strategies,
    missingHighValueFields: missingFields,
    retrievableEvidenceAvailable: true,
    pendingOutcomeWindow: pendingOutcomeExists(history, now),
    safetyRisk: input.athleteState.recovery.painFlag ? 1 : 0,
  });
  const shadowDecision: ShadowDecision = {
    ...flow,
    userId: input.userId,
    promotionLevel: CURRENT_PHASE3_PROMOTION_LEVEL,
    confidence: confidenceForShadowAction(flow.action, uncertainty),
    createdAt: now.toISOString(),
  };
  const expectedOutcome = expectedOutcomeForDecision(input.productionDecision.decision);
  const shadowSaved = await appendShadowEvent(input.supabase, {
    userId: input.userId,
    eventType: "SHADOW_DECISION",
    recommendationId,
    contextSignature: signals.contextSignature,
    productionDecision: input.productionDecision as unknown as Record<string, unknown>,
    shadowDecision,
    expectedOutcome,
    actualOutcome: null,
    uncertaintyProfile: uncertainty,
    driftState: drift,
    stabilityState: stability,
    reasonCodes: [...flow.reasonCodes, ...drift.reasonCodes, ...stability.reasonCodes],
    metadata: {
      snapshot,
      signalCounts: {
        keyphrases: signals.keyphrases.length,
        metrics: signals.metrics.length,
        safety: signals.safety.length,
      },
      productionConfidence: decisionConfidence(input.productionDecision.confidence),
      productionAdaptations: (input.productionActions ?? []).map(productionActionToAdaptation),
      missingHighValueFields: missingFields,
      shadowStrategyExecuted: false,
      strategyScores: strategies.map((strategy) => ({
        strategyId: strategy.strategyId,
        score: strategy.score,
        expectedUtility: strategy.expectedUtility,
        informationGain: strategy.informationGain,
        risk: strategy.risk,
        cost: strategy.cost,
        reasonCodes: strategy.reasonCodes,
      })),
    },
    occurredAt: now.toISOString(),
  });
  if (shadowSaved) {
    // Validation telemetry is downstream, best-effort, and has no control path
    // back into either this shadow decision or the production recommendation.
    try {
      await recordPhase4RecommendationTrace({
        supabase: input.supabase,
        userId: input.userId,
        athleteState: input.athleteState,
        recommendationId,
        productionDecision: input.productionDecision as unknown as Record<string, unknown>,
        shadowDecision,
        expectedOutcome,
        uncertainty,
        occurredAt: now.toISOString(),
      });
    } catch (error) {
      console.warn("[DANTE PHASE4] T0 instrumentation failed without affecting Phase 3", {
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return shadowDecision;
}

function actualRecoveryOutcome(before: number | null, after: number | null): OutcomeValue {
  if (before === null || after === null) return "UNKNOWN";
  const delta = after - before;
  if (Math.abs(delta) < 3) return "MAINTAINED";
  return delta > 0 ? "IMPROVED" : "DECLINED";
}

function calibrationObservationsFromHistory(
  history: ShadowEventRecord[],
  userId: string,
): CalibrationObservation[] {
  return history
    .filter((event) => event.userId === userId && event.eventType === "CALIBRATION_UPDATED")
    .map((event) => event.metadata.calibrationObservation)
    .filter((value): value is CalibrationObservation =>
      isRecord(value) &&
      value.userId === userId &&
      typeof value.domain === "string" &&
      typeof value.contextSignature === "string" &&
      typeof value.priorConfidence === "number" &&
      typeof value.correct === "boolean" &&
      typeof value.observedAt === "string",
    );
}

const RECOVERY_OUTCOME_MIN_AGE_MS = 12 * 60 * 60 * 1000;
const RECOVERY_OUTCOME_MAX_AGE_MS = 36 * 60 * 60 * 1000;

/**
 * Selects an outcome source without guessing. An explicit id wins; without
 * one, automatic linkage is allowed only when exactly one unlinked decision
 * is mature and still inside the declared next-day horizon.
 */
export function selectRecoveryOutcomeSource(input: {
  history: ShadowEventRecord[];
  userId: string;
  now: Date;
  recommendationId?: string;
}): ShadowEventRecord | null {
  const linked = new Set(
    input.history
      .filter((event) => event.userId === input.userId && event.eventType === "OUTCOME_LINKED")
      .map((event) => event.recommendationId)
      .filter((value): value is string => value !== null),
  );
  const eligible = input.history
    .filter((event) => {
      if (
        event.userId !== input.userId ||
        event.eventType !== "SHADOW_DECISION" ||
        event.recommendationId === null ||
        linked.has(event.recommendationId)
      ) {
        return false;
      }
      const age = input.now.getTime() - new Date(event.occurredAt).getTime();
      return age >= RECOVERY_OUTCOME_MIN_AGE_MS && age <= RECOVERY_OUTCOME_MAX_AGE_MS;
    })
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  if (input.recommendationId) {
    return eligible.find((event) => event.recommendationId === input.recommendationId) ?? null;
  }
  const uniqueRecommendations = new Map<string, ShadowEventRecord>();
  for (const event of eligible) {
    if (!uniqueRecommendations.has(event.recommendationId!)) {
      uniqueRecommendations.set(event.recommendationId!, event);
    }
  }
  return uniqueRecommendations.size === 1
    ? uniqueRecommendations.values().next().value ?? null
    : null;
}

/** Links a later recovery check-in to one unambiguous mature shadow decision, append-only. */
export async function processPhase3RecoveryOutcome(input: {
  supabase: SupabaseClient;
  userId: string;
  currentRecoveryScore: number | null;
  recommendationId?: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const history = await loadRecentShadowEvents(input.supabase, input.userId, 50);
  const source = selectRecoveryOutcomeSource({
    history,
    userId: input.userId,
    now,
    recommendationId: input.recommendationId,
  });
  if (!source?.recommendationId || !source.expectedOutcome) return;

  const snapshot = asSnapshot(source.metadata.snapshot, input.userId);
  const actual = unknownOutcome();
  actual.recovery = actualRecoveryOutcome(snapshot?.recoveryScore ?? null, input.currentRecoveryScore);
  const outcome = linkRecommendationOutcome({
    userId: input.userId,
    recommendationId: source.recommendationId,
    horizon: "next_day",
    expected: source.expectedOutcome,
    actual,
    horizonMature: true,
    evaluatedAt: now.toISOString(),
  });
  const outcomeSaved = await appendShadowEvent(input.supabase, {
    userId: input.userId,
    eventType: "OUTCOME_LINKED",
    recommendationId: source.recommendationId,
    contextSignature: source.contextSignature,
    productionDecision: null,
    shadowDecision: null,
    expectedOutcome: source.expectedOutcome,
    actualOutcome: actual,
    uncertaintyProfile: null,
    driftState: null,
    stabilityState: null,
    reasonCodes: outcome.errors.recovery === null
      ? ["OUTCOME_UNKNOWN"]
      : ["ASYNC_OUTCOME_LINKED"],
    metadata: {
      multidimensionalErrors: outcome.errors,
      horizon: outcome.horizon,
      causalAttribution: "production_observation_only",
      shadowStrategyExecuted: false,
    },
    occurredAt: now.toISOString(),
  });
  if (!outcomeSaved) return;

  try {
    await recordPhase4OutcomeEvaluation({
      supabase: input.supabase,
      userId: input.userId,
      source,
      actual,
      rawRecoveryScore: input.currentRecoveryScore,
      occurredAt: now.toISOString(),
    });
  } catch (error) {
    console.warn("[DANTE PHASE4] T1 instrumentation failed without affecting Phase 3", {
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  const calibration = calibrationObservationFromOutcome({
    userId: input.userId,
    domain: "recovery_prediction",
    contextSignature: source.contextSignature ?? "unknown",
    priorConfidence: typeof source.metadata.productionConfidence === "number"
      ? source.metadata.productionConfidence
      : 0,
    outcome,
    dimension: "recovery",
  });
  if (!calibration) return;
  const summary = summarizeCalibration({
    userId: input.userId,
    domain: "recovery_prediction",
    observations: [...calibrationObservationsFromHistory(history, input.userId), calibration],
  });
  await appendShadowEvent(input.supabase, {
    userId: input.userId,
    eventType: "CALIBRATION_UPDATED",
    recommendationId: source.recommendationId,
    contextSignature: source.contextSignature,
    productionDecision: null,
    shadowDecision: null,
    expectedOutcome: null,
    actualOutcome: null,
    uncertaintyProfile: null,
    driftState: null,
    stabilityState: null,
    reasonCodes: ["EXTERNAL_OUTCOME_CALIBRATION"],
    metadata: {
      calibrationObservation: calibration,
      calibrationDomain: summary.domain,
      sampleCount: summary.sampleCount,
      calibrationError: summary.calibrationError,
    },
    occurredAt: now.toISOString(),
  });
}
