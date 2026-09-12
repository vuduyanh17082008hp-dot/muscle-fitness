/**
 * Dante Core public API (spec Part A §27).
 *
 *   dante.evaluateReadiness()
 *   dante.evaluateSet()          (= generateRecommendation, set-level autoregulation)
 *   dante.generateRecommendation()
 *   dante.explainRecommendation()
 *
 * Import from "@/lib/dante-core" rather than reaching into individual
 * engine files, so this list stays the actual contract boundary
 * between Dante Core and the rest of Muscle Fitness / SetVision.
 */

export { evaluateReadiness } from "@/lib/dante-core/readiness-engine";
export { evaluateTrend } from "@/lib/dante-core/trend-engine";
export { generateRecommendation } from "@/lib/dante-core/autoregulation-engine";
export { generateRecommendation as evaluateSet } from "@/lib/dante-core/autoregulation-engine";
export { buildAutoregulationTraceableDecision } from "@/lib/dante-core/decision-object";
export {
  explainRecommendation,
  attachKnowledgeSources,
} from "@/lib/dante-core/explain";
export { checkSafety } from "@/lib/dante-core/safety-layer";
export {
  buildDailyIntelligence,
  recomputeDailyIntelligence,
  getOrBuildDailyIntelligence,
} from "@/lib/dante-core/daily-intelligence";
export { retrieveKnowledge, retrieveByCategory } from "@/lib/dante-core/knowledge/retrieve";

export type {
  ReadinessEngineInput,
  ReadinessResult,
  MuscleRecoveryEstimate,
  SystemicFatigueLevel,
  TrendEvaluation,
  SetVisionTrendPoint,
  AutoregulationInput,
  AutoregulationDecision,
  AutoregulationDecisionCode,
  SessionRecommendation,
  PlannedSet,
  SetVisionSessionSignal,
  TraceableDecision,
  KnowledgeSourceRef,
  ConfidenceLevel,
} from "@/lib/dante-core/types";
export type { SafetyCategory, SafetyCheckResult } from "@/lib/dante-core/safety-layer";
export type { DailyIntelligence } from "@/lib/dante-core/daily-intelligence";
export type { KnowledgeEntry, KnowledgeCategory } from "@/lib/dante-core/knowledge/types";
