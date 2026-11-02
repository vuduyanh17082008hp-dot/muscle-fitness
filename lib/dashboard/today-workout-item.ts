import type { WhatMattersItem } from "@/components/dashboard/what-matters-now";
import type { TodaySession } from "@/lib/training/load-today-session";
import type { TodaySessionStatus, trainingHold } from "@/lib/dante-core/daily-decision-engine";

/** "What matters now"'s workout item — held by the Daily Brief's safety decision exactly like the Action Hero. */
export function todayWorkoutItem(
  todaySession: TodaySession | null,
  status: TodaySessionStatus,
  hold: ReturnType<typeof trainingHold>,
): WhatMattersItem | null {
  if (hold && (status === "planned" || status === "active" || status === "conflict")) {
    return {
      id: "training-hold",
      title: hold === "recovery" ? "Recovery first today" : "Check recovery before training",
      subtitle: hold === "recovery" ? "Your check-in flagged pain or illness" : "Today's pain/illness check-in couldn't be confirmed",
      href: "/dashboard/recovery",
      urgency: "high",
    };
  }
  // A not-started session on the plan's rest day: the hero says "needs review", so this list never says "on track".
  if (status === "conflict") {
    return {
      id: "schedule-conflict",
      title: "Workout schedule needs review",
      subtitle: "Your plan has today as a rest day",
      href: "/dashboard/workouts",
      urgency: "normal",
    };
  }
  if (!todaySession || (status !== "planned" && status !== "active")) return null;
  // MF-F2: a postponed exercise isn't pending work; say how many were postponed instead of counting them.
  const remaining = todaySession.exercises.filter((exercise) => !exercise.isSkipped).length;
  const postponed = todaySession.exercises.length - remaining;
  return {
    id: "pending-session",
    title: status === "active" ? "Today's workout is in progress" : "Today's workout is pending",
    subtitle: `${todaySession.name || "Scheduled Session"} (${remaining} exercises${postponed > 0 ? `, ${postponed} postponed` : ""})`,
    href: `/dashboard/workouts/session/${todaySession.id}`,
    urgency: "high",
  };
}
