/**
 * Autonomy thresholds (mission Part 12/13) — "Thresholds MUST live in
 * deterministic config, not in prompts." Every number an autonomy
 * decision depends on is exported from this one file. No prompt, no
 * LLM output, and no policy value can change these at runtime.
 */

export const AUTONOMY_CONFIG = {
  /** adjust_sets_reps: a set-count change at or below this is small enough to auto-apply under ASSIST. */
  autoMaxSetDelta: 1,

  /** modify_volume: a percent change at or below this is small enough to auto-apply under ASSIST. */
  autoMaxVolumePercent: 15,

  /** AUTOPILOT may auto-apply a modify_volume up to this percent — still bounded, never unlimited. */
  autopilotMaxVolumePercent: 25,

  /** Anything beyond this, for any magnitude-based action, is refused outright rather than merely requiring confirmation — a defensive ceiling no engine today should ever produce. */
  blockVolumePercent: 60,
  blockSetDelta: 8,
} as const;

export const ACTION_BUDGET_CONFIG = {
  /** Max auto-applied or confirmed actions in a single orchestrator cycle (one "what should happen next" run). */
  maxActionsPerCycle: 3,

  /** Max auto-applied actions for the SAME (context, intervention) pair within this many hours — prevents Dante from re-adjusting the same thing repeatedly in one day. */
  cooldownHours: 20,

  /** After this many consecutive auto-applied adaptations with no explicit user confirmation in between, the next one is downgraded to "confirm" regardless of risk class — adaptation frequency itself is a signal worth surfacing. */
  maxConsecutiveAutoAdaptations: 3,

  /** Max proactive notifications (not user-initiated chat replies) per day. */
  notificationBudgetPerDay: 3,
} as const;
