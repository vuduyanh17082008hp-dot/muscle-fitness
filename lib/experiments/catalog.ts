/**
 * Personal Experiment Lab — exposure/outcome catalog (spec Part
 * "5. PERSONAL EXPERIMENT LAB"). Deliberately a small, fixed set
 * rather than a freeform rule builder: every definition here is
 * computed from data the app ALREADY logs (food_logs,
 * recovery_checkins, workout_sessions/exercise_sets, or a resolved
 * wearable snapshot) — there is no separate manual daily-observation
 * form to build or maintain, and no new data-collection surface.
 */

export type ExposureTypeId = "late_caffeine" | "high_carb_pre_workout" | "high_step_count";
export type OutcomeTypeId = "sleep_hours" | "recovery_score" | "leg_day_volume_kg";

export type ExposureTypeDefinition = {
  id: ExposureTypeId;
  label: string;
  question: string;
  description: string;
  /** True when this exposure needs a resolved wearable provider (demo mode today) — otherwise unavailable for the account. */
  requiresWearable: boolean;
};

export type OutcomeTypeDefinition = {
  id: OutcomeTypeId;
  label: string;
  unit: string;
  description: string;
};

export const EXPOSURE_TYPES: ExposureTypeDefinition[] = [
  {
    id: "late_caffeine",
    label: "Late caffeine",
    question: "Does late caffeine affect my sleep?",
    description:
      "A day counts as 'exposed' if a coffee/tea/energy-drink/pre-workout item was logged after 6pm. Based on when the food was LOGGED, not necessarily when it was consumed.",
    requiresWearable: false,
  },
  {
    id: "high_carb_pre_workout",
    label: "High-carb pre-workout meal",
    question: "Does a high-carb pre-workout meal affect my performance?",
    description: "A day counts as 'exposed' if a pre-workout-tagged food log that day had more than 60g of carbs.",
    requiresWearable: false,
  },
  {
    id: "high_step_count",
    label: "10,000+ steps",
    question: "Does a high-step-count day affect my leg-day performance?",
    description: "A day counts as 'exposed' if your wearable recorded 10,000+ steps.",
    requiresWearable: true,
  },
];

export const OUTCOME_TYPES: OutcomeTypeDefinition[] = [
  {
    id: "sleep_hours",
    label: "Sleep duration",
    unit: "h",
    description: "Hours of sleep logged in that day's recovery check-in.",
  },
  {
    id: "recovery_score",
    label: "Recovery score",
    unit: "",
    description: "That day's computed recovery score (0-100).",
  },
  {
    id: "leg_day_volume_kg",
    label: "Leg-day training volume",
    unit: "kg",
    description:
      "Total weight × reps across completed sets of quad/hamstring/glute exercises logged that day. Zero on days without leg training — not a missing value.",
  },
];

export function getExposureType(id: string): ExposureTypeDefinition | null {
  return EXPOSURE_TYPES.find((e) => e.id === id) ?? null;
}

export function getOutcomeType(id: string): OutcomeTypeDefinition | null {
  return OUTCOME_TYPES.find((o) => o.id === id) ?? null;
}
