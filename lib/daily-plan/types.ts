/**
 * Canonical daily-plan shape shared by the Dashboard ("Today's Plan"),
 * Training, and Calendar surfaces. There is deliberately no dedicated
 * `daily_actions` table — every DailyAction below is DERIVED at read
 * time from the same real tables those surfaces already query
 * (workout_sessions, recovery_checkins, the nutrition plan/food log).
 * A scheduled workout is one row in workout_sessions; this type never
 * forks that into a second, independently-editable record.
 */

export type DailyActionType =
  | "workout"
  | "nutrition"
  | "recovery"
  | "checkin"
  | "activity"
  | "calendar";

export type DailyActionStatus =
  | "planned"
  | "active"
  | "completed"
  | "skipped";

export type DailyAction = {
  id: string;
  type: DailyActionType;
  title: string;
  subtitle: string | null;
  status: DailyActionStatus;
  /** ISO timestamp, when the underlying record has a real scheduled time. */
  scheduledAt: string | null;
  /** Lower sorts first. Reflects natural chronological order of a day (check-in, then training, then nutrition) — not a fabricated urgency score. */
  priority: number;
  /** Where to send the user to act on this item — always a real, existing route. */
  actionUrl: string;
  /** Which real table this was derived from — for debugging/telemetry only. */
  source: "workout_sessions" | "recovery_checkins" | "nutrition";
  /** Small, real, already-computed values a consumer can display without re-deriving them (e.g. exercise count, protein remaining). Never fabricated. */
  metadata?: Record<string, string | number | null>;
};

/** workout_sessions.session_state values actually used across the app. */
export function sessionStateToActionStatus(
  sessionState: string | null,
): DailyActionStatus {
  switch (sessionState) {
    case "completed":
      return "completed";
    case "cancelled":
      return "skipped";
    case "in_progress":
    case "paused":
      return "active";
    default:
      return "planned";
  }
}
