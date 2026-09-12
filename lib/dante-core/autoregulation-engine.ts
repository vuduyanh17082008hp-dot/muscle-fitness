import type {
  AutoregulationDecision,
  AutoregulationDecisionCode,
  AutoregulationInput,
  ConfidenceLevel,
  SessionRecommendation,
} from "@/lib/dante-core/types";

/**
 * Training Autoregulation Engine (spec Part A §4).
 *
 * Purely deterministic, rule-based. It never calls an LLM and it
 * never guesses at a metric — every adjustment traces back to an
 * explicit, documented rule over already-computed signals (readiness,
 * per-muscle recovery, e1RM trend, SetVision velocity loss).
 *
 * This is distinct from lib/training/progression-engine.ts, which
 * decides whether NEXT session's load should increase based on LAST
 * session's logged performance. This engine answers a different
 * question: "given how the lifter looks RIGHT NOW (today, or mid-set),
 * should TODAY's planned load/volume be adjusted?" The two never
 * overlap in scope and neither overrides the other.
 *
 * SEVERITY SCORING (documented, not hidden):
 *   systemicFatigue:        low=0, moderate=1, high=2, unknown=0
 *   relevant-muscle recovery avg: >=60%=0, 40-59%=1, <40%=2, unknown=0
 *   performance trend:      declining=1, else=0
 *   SetVision velocity loss: <15%=0, 15-24%=1, >=25%=2, unknown=0
 *
 * Total severity (0-7) maps to a fixed tier table below. The pain-flag
 * safety gate always short-circuits this scoring entirely.
 */

const LOAD_ROUNDING_KG = 0.5;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundLoad(value: number): number {
  return Math.round(value / LOAD_ROUNDING_KG) * LOAD_ROUNDING_KG;
}

type Tier = {
  decision: AutoregulationDecisionCode;
  loadAdjustmentPercent: number;
  sessionRecommendation: SessionRecommendation;
  setsMultiplier: number;
};

const TIERS: Tier[] = [
  { decision: "proceed_as_planned", loadAdjustmentPercent: 0, sessionRecommendation: "normal", setsMultiplier: 1 },
  { decision: "reduce_load", loadAdjustmentPercent: -0.03, sessionRecommendation: "normal", setsMultiplier: 1 },
  { decision: "reduce_load_and_volume", loadAdjustmentPercent: -0.06, sessionRecommendation: "modified", setsMultiplier: 0.8 },
  { decision: "reduce_load_and_volume", loadAdjustmentPercent: -0.1, sessionRecommendation: "modified", setsMultiplier: 0.75 },
  { decision: "deload_session", loadAdjustmentPercent: -0.15, sessionRecommendation: "deload", setsMultiplier: 0.5 },
];

function tierForSeverity(severity: number): Tier {
  if (severity <= 0) return TIERS[0];
  if (severity === 1) return TIERS[1];
  if (severity <= 3) return TIERS[2];
  if (severity <= 5) return TIERS[3];
  return TIERS[4];
}

function relevantMuscleRecoveryAverage(
  input: AutoregulationInput,
): { average: number | null; entries: Array<{ muscle: string; recoveryPercent: number }> } {
  const entries = input.readiness.muscleRecovery
    .filter((m) => input.relevantMuscles.includes(m.muscle))
    .filter((m): m is typeof m & { recoveryPercent: number } => m.recoveryPercent !== null)
    .map((m) => ({ muscle: m.muscle as string, recoveryPercent: m.recoveryPercent }));

  if (entries.length === 0) {
    return { average: null, entries: [] };
  }

  const average =
    entries.reduce((sum, e) => sum + e.recoveryPercent, 0) / entries.length;

  return { average: round(average), entries };
}

function computeSeverity(
  input: AutoregulationInput,
  muscleRecoveryAverage: number | null,
): { severity: number; reasons: string[] } {
  let severity = 0;
  const reasons: string[] = [];

  if (input.readiness.systemicFatigue === "high") {
    severity += 2;
    reasons.push("Systemic fatigue is currently high.");
  } else if (input.readiness.systemicFatigue === "moderate") {
    severity += 1;
    reasons.push("Systemic fatigue is currently moderate.");
  }

  if (muscleRecoveryAverage !== null) {
    if (muscleRecoveryAverage < 40) {
      severity += 2;
      reasons.push(
        `Estimated recovery for the muscles this exercise trains is low (${muscleRecoveryAverage}%).`,
      );
    } else if (muscleRecoveryAverage < 60) {
      severity += 1;
      reasons.push(
        `Estimated recovery for the muscles this exercise trains is below typical (${muscleRecoveryAverage}%).`,
      );
    }
  }

  if (input.trend?.trend === "declining") {
    severity += 1;
    reasons.push(
      `Recent performance trend for this exercise is declining${input.trend.changePercent !== null ? ` (${input.trend.changePercent}%)` : ""}.`,
    );
  }

  const velocityLoss = input.setVision?.velocityLoss ?? null;

  if (velocityLoss !== null) {
    if (velocityLoss >= 0.25) {
      severity += 2;
      reasons.push(
        `SetVision measured a high velocity loss on earlier sets today (${round(velocityLoss * 100, 0)}%).`,
      );
    } else if (velocityLoss >= 0.15) {
      severity += 1;
      reasons.push(
        `SetVision measured a moderate velocity loss on earlier sets today (${round(velocityLoss * 100, 0)}%).`,
      );
    }
  }

  for (const factor of input.readiness.limitingFactors) {
    if (factor === "sleep_below_baseline") {
      reasons.push("Sleep was below baseline in today's check-in.");
    }
  }

  return { severity, reasons };
}

function computeConfidence(
  input: AutoregulationInput,
  muscleRecoveryAverage: number | null,
): ConfidenceLevel {
  let score = 0;

  if (input.readiness.confidence >= 0.66) score += 2;
  else if (input.readiness.confidence >= 0.33) score += 1;

  if (muscleRecoveryAverage !== null) score += 1;
  if (input.trend !== null && input.trend.trend !== "insufficient_data") score += 1;
  if (input.setVision?.velocityLoss !== null && input.setVision !== null) score += 1;

  if (score >= 4) return "high";
  if (score >= 2) return "moderate";
  return "low";
}

/**
 * generateRecommendation() — the public autoregulation entry point
 * (spec §27: `dante.generateRecommendation()`).
 */
export function generateRecommendation(
  input: AutoregulationInput,
): AutoregulationDecision {
  const { planned } = input;

  // ---- Safety gate: always wins, regardless of every other signal ----
  if (input.recentPainFlag) {
    return {
      exercise: input.exerciseName,
      plannedLoadKg: planned.targetLoadKg,
      recommendedLoadKg: planned.targetLoadKg,
      plannedSets: planned.targetSets,
      recommendedSets: 0,
      loadAdjustmentPercent: null,
      volumeAdjustmentPercent: -1,
      decision: "rest_recommended",
      sessionRecommendation: "rest",
      reasons: [
        "A recent pain/illness flag was logged. Training-load adjustments do not apply here — this is a case for resting the movement and, if pain persists, consulting a qualified professional.",
      ],
      confidence: "high",
      gated: true,
    };
  }

  const { average: muscleRecoveryAverage, entries } =
    relevantMuscleRecoveryAverage(input);

  const { severity, reasons } = computeSeverity(input, muscleRecoveryAverage);

  if (reasons.length === 0) {
    reasons.push(
      "No fatigue, recovery, or performance signals currently suggest a change from the planned session.",
    );
  }

  const tier = tierForSeverity(severity);

  const recommendedSets = Math.max(
    1,
    Math.round(planned.targetSets * tier.setsMultiplier),
  );

  const volumeAdjustmentPercent =
    planned.targetSets > 0
      ? round((recommendedSets - planned.targetSets) / planned.targetSets)
      : 0;

  const loadAdjustmentPercent =
    planned.targetLoadKg !== null ? tier.loadAdjustmentPercent : null;

  const recommendedLoadKg =
    planned.targetLoadKg !== null
      ? roundLoad(planned.targetLoadKg * (1 + tier.loadAdjustmentPercent))
      : null;

  const velocityLoss = input.setVision?.velocityLoss ?? null;

  if (velocityLoss !== null && velocityLoss >= 0.35) {
    reasons.push(
      "Velocity loss exceeded 35% on earlier sets — consider terminating this exercise for today depending on the session's objective (strength/technique work vs. hypertrophy volume).",
    );
  }

  if (entries.length > 0) {
    for (const entry of entries) {
      if (entry.recoveryPercent < 60) {
        reasons.push(`${entry.muscle}: ${entry.recoveryPercent}% estimated recovery.`);
      }
    }
  }

  const confidence = computeConfidence(input, muscleRecoveryAverage);

  return {
    exercise: input.exerciseName,
    plannedLoadKg: planned.targetLoadKg,
    recommendedLoadKg,
    plannedSets: planned.targetSets,
    recommendedSets,
    loadAdjustmentPercent,
    volumeAdjustmentPercent:
      volumeAdjustmentPercent === 0 ? 0 : volumeAdjustmentPercent,
    decision: tier.decision,
    sessionRecommendation: tier.sessionRecommendation,
    reasons,
    confidence,
    gated: false,
  };
}
