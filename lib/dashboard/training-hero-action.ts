import type { TodaySessionStatus, trainingHold } from "@/lib/dante-core/daily-decision-engine";

export type TrainingHeroAction = {
  eyebrow: string;
  label: string;
  href: string;
  /** Primary = the one filled CTA; review/navigation links render secondary. */
  primary: boolean;
  note?: string;
};

/**
 * What every Start/Resume entry point shows instead while trainingHold(dailyDecision) holds training today (the Training hero,
 * Plan Detail day cards, Session Detail): recovery guidance, never a start.
 */
export function heldTrainingAction(hold: "recovery" | "unverified"): TrainingHeroAction {
  return hold === "recovery"
    ? {
        eyebrow: "Recovery First Today",
        label: "Recovery guidance",
        href: "/dashboard/recovery",
        primary: true,
        note: "Your check-in flagged pain or illness, so Dante recommends recovery over training today. Your workout isn't cancelled — see a medical professional if it persists or worsens.",
      }
    : {
        eyebrow: "Check Recovery First",
        label: "Check recovery",
        href: "/dashboard/recovery",
        primary: true,
        note: "Today's pain/illness check-in couldn't be confirmed, so Dante isn't recommending a start. Check Recovery first.",
      };
}

/**
 * The Training page hero's action, from the same classifyTodaySession status and trainingHold the Today hero uses:
 * a completed or postponed session is reviewed, never started again; a hold replaces Start/Resume with recovery guidance.
 */
export function trainingHeroAction(input: {
  status: TodaySessionStatus;
  hold: ReturnType<typeof trainingHold>;
  sessionId: string | null;
  activePlanId: string | null;
  restDay: boolean;
  buildPlanHref: string;
}): TrainingHeroAction {
  const { status, hold, sessionId, activePlanId } = input;
  const sessionHref = sessionId ? `/dashboard/workouts/session/${sessionId}` : null;
  const planHref = activePlanId ? `/dashboard/workouts/plans/${activePlanId}` : null;

  if (status === "completed" && sessionHref) return { eyebrow: "Session Complete", label: "Review session", href: sessionHref, primary: false };
  if (status === "postponed" && sessionHref) return { eyebrow: "Session Postponed · Rest Day", label: "Review session", href: sessionHref, primary: false };

  // Anything that could lead to training (a session, a plan day, an unconfirmed schedule) is held; building a first plan is not.
  if (hold && (status !== "none" || planHref)) return heldTrainingAction(hold);

  if (status === "active" && sessionHref) return { eyebrow: "Session In Progress", label: "Resume workout", href: sessionHref, primary: true };
  if (status === "conflict") {
    return { eyebrow: "Workout Schedule Needs Review", label: "Review your plan", href: planHref ?? sessionHref ?? "/dashboard/workouts/history", primary: false, note: "Your plan has today as a rest day, but a workout session is also scheduled. Review it before you start." };
  }
  if (status === "unknown") {
    return { eyebrow: "Workout Status Unavailable", label: planHref ? "Review your plan" : "Workout history", href: planHref ?? "/dashboard/workouts/history", primary: false, note: "Today's session couldn't be loaded. Check your plan before you start." };
  }
  if (status === "planned") {
    return sessionHref
      ? { eyebrow: "Today's Session", label: "Start workout", href: sessionHref, primary: true }
      : { eyebrow: "Next In Your Plan", label: "Start from your plan", href: planHref ?? input.buildPlanHref, primary: true };
  }
  // status "none": no session and no training day today.
  if (planHref) return { eyebrow: input.restDay ? "Rest Day In Your Plan" : "Workout System", label: "View your plan", href: planHref, primary: false };
  return { eyebrow: "Workout System", label: "Build recommended plan", href: input.buildPlanHref, primary: true };
}
