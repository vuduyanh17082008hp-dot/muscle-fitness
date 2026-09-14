/**
 * Proactive / heartbeat cycle triggers (mission Part 12). Each is a
 * label for WHEN a scheduler invoked the cycle — it changes nothing
 * about the deterministic decision logic itself (same
 * `runDanteCycleForUser` as the session-scoped `/api/dante/cycle`),
 * only what gets logged/observed so a later pass can eventually branch
 * on it (e.g. skipping POST_WORKOUT if no session happened today).
 */
export type ProactiveCycleTrigger =
  | "morning"
  | "pre_workout"
  | "post_workout"
  | "outcome_due"
  | "evening"
  | "manual";

export const PROACTIVE_CYCLE_TRIGGERS: readonly ProactiveCycleTrigger[] = [
  "morning",
  "pre_workout",
  "post_workout",
  "outcome_due",
  "evening",
  "manual",
];
