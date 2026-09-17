/**
 * Layer 1 output: premise validation. Pure pattern-based classifier —
 * it produces a structured list of issues for later layers (or the
 * LLM prompt) to account for, and generates NO coaching recommendation
 * itself.
 *
 * Deliberately deterministic/regex-based, matching Dante Core's "the
 * LLM is not the source of truth" stance. Deeper semantic assumption
 * detection (e.g. spotting an unstated causal claim buried in prose)
 * is out of reach for pattern matching — that belongs to a future
 * Critic-role deliberation stage, not faked here as a false positive
 * generator.
 */

export type PremiseIssueType =
  | "anchored_numeric_target"
  | "unclear_deadline"
  | "missing_baseline"
  | "missing_required_variable";

export type PremiseIssue = {
  type: PremiseIssueType;
  detail: string;
};

export type PremiseValidationInput = {
  message: string;
  /** Whether Dante has any training history to reason from for this user. */
  hasTrainingHistory: boolean;
  /** Whether Dante has any recovery check-in data for this user. */
  hasRecoveryData: boolean;
  /** Whether Dante has a nutrition profile (targets/macros) for this user. */
  hasNutritionProfile: boolean;
};

const NUMERIC_TARGET_WITH_DEADLINE =
  /\b\d+(?:\.\d+)?\s*(?:kg|lbs?|kilos?|pounds?)\b[^.?!]{0,60}\b(?:in|within|by)\b[^.?!]{0,30}\b(?:day|days|week|weeks|month|months)\b/i;
const NUMERIC_TARGET = /\b\d+(?:\.\d+)?\s*(?:kg|lbs?|kilos?|pounds?)\b/i;
const SHORT_DEADLINE = /\b(?:in|within|by)\s+(\d+)\s*(day|days|week|weeks)\b/i;
const VAGUE_URGENCY = /\b(?:asap|as soon as possible|really fast|super quick(?:ly)?)\b/i;

const TRAINING_TOPIC = /\b(?:progress|progression|1rm|one[- ]rep max|program|training volume|bench|squat|deadlift|training plan)\b/i;
const NUTRITION_TOPIC = /\b(?:macros?|calories?|\bcut\b|\bbulk\b|deficit|surplus|\bdiet\b)\b/i;
const RECOVERY_TOPIC = /\b(?:recovery|readiness|soreness|sore|fatigue|deload)\b/i;

/** Anything below this many days is treated as an unrealistically short window for a loaded-weight target — an engineering default, not a physiological threshold. */
const SHORT_DEADLINE_DAY_THRESHOLD = 14;

function shortDeadlineDays(match: RegExpMatchArray): number {
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  return unit.startsWith("week") ? amount * 7 : amount;
}

export function validatePremises(input: PremiseValidationInput): PremiseIssue[] {
  const { message, hasTrainingHistory, hasRecoveryData, hasNutritionProfile } = input;
  const issues: PremiseIssue[] = [];

  const anchoredMatch = message.match(NUMERIC_TARGET_WITH_DEADLINE);

  if (anchoredMatch) {
    issues.push({
      type: "anchored_numeric_target",
      detail: `Message anchors to a specific numeric target with a fixed timeframe ("${anchoredMatch[0]}") — treat as the user's stated goal, not a validated projection.`,
    });

    const deadlineMatch = message.match(SHORT_DEADLINE);
    if (deadlineMatch && shortDeadlineDays(deadlineMatch) < SHORT_DEADLINE_DAY_THRESHOLD) {
      issues.push({
        type: "unclear_deadline",
        detail: `Timeframe "${deadlineMatch[0]}" is short relative to typical adaptation rates — do not implicitly endorse its feasibility.`,
      });
    }
  } else if (NUMERIC_TARGET.test(message) && VAGUE_URGENCY.test(message)) {
    issues.push({
      type: "unclear_deadline",
      detail: "Message pairs a numeric target with a vague urgency phrase rather than a concrete timeframe.",
    });
  }

  if (TRAINING_TOPIC.test(message) && !hasTrainingHistory) {
    issues.push({
      type: "missing_baseline",
      detail: "Training-related question with no training history on file — there is no baseline to progress from.",
    });
  }

  if (RECOVERY_TOPIC.test(message) && !hasRecoveryData) {
    issues.push({
      type: "missing_required_variable",
      detail: "Recovery-related question with no recovery check-in data on file.",
    });
  }

  if (NUTRITION_TOPIC.test(message) && !hasNutritionProfile) {
    issues.push({
      type: "missing_required_variable",
      detail: "Nutrition-related question with no nutrition profile/targets on file.",
    });
  }

  return issues;
}
