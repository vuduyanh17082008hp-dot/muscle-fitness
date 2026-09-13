/**
 * Decision Sandbox (mission Part 9) — evaluates candidate scenarios
 * against the Digital Twin / personal baseline / learned policy
 * WITHOUT ever branching production data. Every scenario here is a
 * plain in-memory object; nothing is written until the orchestrator's
 * PLANNER/CHECKER stages pick a winner and hand it to
 * lib/dante-core/actions/apply-action.ts.
 *
 * NO_CHANGE is always one of the candidates and always wins ties —
 * "is a first-class valid decision" (mission Part 9), not a fallback
 * used only when something fails.
 */

export type ScenarioId = "NO_CHANGE" | string;

export type TrainingScenario = {
  id: ScenarioId;
  label: string;
  /** Fractional change vs. the current plan, e.g. -0.1 = -10% volume. 0 for NO_CHANGE and for volume-preserving qualitative changes (e.g. removing a failure set). */
  volumeChangeFraction: number;
  /** True for a scenario that keeps total working volume the same while changing its composition (mission's example: "preserve volume, remove failure set"). */
  preservesVolume: boolean;
};

export type ScenarioContext = {
  recoveryScore: number | null;
  trainingLoadState: "green" | "amber" | "red" | null;
  /** From ClientPolicy — how well this athlete has historically tolerated volume swings. Null when there isn't yet enough evidence. */
  volumeTolerance: "low" | "moderate" | "high" | null;
  /** Whether the athlete's current goal generally favors preserving/increasing volume (e.g. muscle_gain) over reducing it (e.g. an active deload). */
  goalFavorsVolume: boolean;
};

export type ScoredScenario = {
  scenario: TrainingScenario;
  score: number;
  reasons: string[];
};

export function buildDefaultTrainingScenarios(): TrainingScenario[] {
  return [
    { id: "NO_CHANGE", label: "Keep today's session as planned", volumeChangeFraction: 0, preservesVolume: true },
    {
      id: "REDUCE_VOLUME_10",
      label: "Reduce volume by 10%",
      volumeChangeFraction: -0.1,
      preservesVolume: false,
    },
    {
      id: "PRESERVE_VOLUME_REMOVE_FAILURE_SET",
      label: "Preserve total volume, remove the final set taken to failure",
      volumeChangeFraction: 0,
      preservesVolume: true,
    },
  ];
}

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Every additive term below is independently explainable — the
 * `reasons` returned alongside the score are literally the terms that
 * fired, so "Why This?" never has to reverse-engineer the number.
 */
export function scoreScenario(scenario: TrainingScenario, context: ScenarioContext): ScoredScenario {
  let score = 0.5;
  const reasons: string[] = [];

  const isReduction = scenario.volumeChangeFraction < 0;
  const isIncrease = scenario.volumeChangeFraction > 0;
  const magnitude = Math.abs(scenario.volumeChangeFraction);

  if (context.trainingLoadState === "red") {
    if (isReduction || scenario.preservesVolume) {
      score += 0.3;
      reasons.push("Training load is high — this scenario reduces or restructures volume.");
    }
    if (isIncrease) {
      score -= 0.35;
      reasons.push("Training load is high — increasing volume is not supported.");
    }
  } else if (context.trainingLoadState === "amber") {
    if (isReduction) {
      score += 0.15;
      reasons.push("Training load is elevated — a moderate reduction is supported.");
    }
    if (scenario.preservesVolume && !isReduction) {
      score += 0.1;
      reasons.push("Training load is elevated — a volume-preserving restructure is supported.");
    }
    if (isIncrease) {
      score -= 0.2;
      reasons.push("Training load is elevated — increasing volume is not supported.");
    }
  } else if (context.trainingLoadState === "green") {
    if (scenario.id === "NO_CHANGE") {
      score += 0.15;
      reasons.push("Training load is normal — no change is warranted.");
    }
    if (isReduction) {
      score -= 0.1;
      reasons.push("Training load is normal — an unprompted reduction isn't supported.");
    }
  }

  if (context.recoveryScore !== null) {
    if (context.recoveryScore < 50 && isReduction) {
      score += 0.1;
      reasons.push(`Recovery score is ${context.recoveryScore}/100 — supports a reduction.`);
    }
    if (context.recoveryScore >= 75 && isReduction) {
      score -= 0.1;
      reasons.push(`Recovery score is ${context.recoveryScore}/100 — a reduction isn't well-supported.`);
    }
  }

  if (context.volumeTolerance === "low") {
    score -= magnitude * 1.5;
    if (scenario.preservesVolume) {
      score += 0.1;
      reasons.push("This athlete has historically responded better to volume-preserving adjustments.");
    }
  } else if (context.volumeTolerance === "high") {
    score += magnitude * 0.1;
  }

  if (context.goalFavorsVolume && isReduction) {
    score -= magnitude * 0.2;
    reasons.push("The current goal favors preserving training volume.");
  }

  return { scenario, score: round(score), reasons };
}

const TIE_EPSILON = 0.01;

/**
 * Scores every scenario and returns the winner. Ties (within
 * TIE_EPSILON) always resolve to NO_CHANGE when it's one of the tied
 * candidates — the conservative default the mission requires.
 */
export function selectBestScenario(
  scenarios: TrainingScenario[],
  context: ScenarioContext,
): ScoredScenario {
  const scored = scenarios.map((scenario) => scoreScenario(scenario, context));
  const maxScore = Math.max(...scored.map((entry) => entry.score));
  const contenders = scored.filter((entry) => maxScore - entry.score <= TIE_EPSILON);

  const noChange = contenders.find((entry) => entry.scenario.id === "NO_CHANGE");
  if (noChange) return noChange;

  return contenders[0];
}
