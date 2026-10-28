import Link from "next/link";
import { Dumbbell, Play, CheckCircle2, Calendar, PlusCircle } from "lucide-react";
import type { TodaySession } from "@/lib/training/load-today-session";
import type { PlannedDay } from "@/lib/training/planned-day";
import type { TodaySessionStatus } from "@/lib/dante-core/daily-decision-engine";
import { startWorkoutAction } from "@/app/dashboard/workouts/actions";

export type DailyActionHeroProps = {
  todaySession: TodaySession | null;
  /** classifyTodaySession() — the same reading the Daily Brief decision uses. */
  sessionStatus: TodaySessionStatus;
  /** What the active plan says about today when no session row exists yet (null = no plan / unknown). */
  plannedDay?: PlannedDay | null;
  /** trainingHold(dailyDecision) — the Daily Brief's safety decision; while set, no Start/Resume is offered. */
  hold?: "recovery" | "unverified" | null;
  hasCheckinToday?: boolean;
};

const SECONDARY_LINK =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-mf-glass-text transition hover:border-white/20 hover:bg-white/[0.08]";

export function DailyActionHero({ todaySession, sessionStatus, plannedDay = null, hold = null }: DailyActionHeroProps) {
  const workoutHref = todaySession ? `/dashboard/workouts/session/${todaySession.id}` : "/dashboard/workouts";

  // The Daily Brief holds training (pain/illness, or the check-in couldn't be confirmed): the workout stays as planned and
  // viewable, but Start/Resume is not the recommended action. Temporary — it lifts when the check-in clears.
  if (hold && (sessionStatus === "planned" || sessionStatus === "active" || sessionStatus === "conflict")) {
    const name = todaySession?.name || (plannedDay && plannedDay.kind !== "REST" ? plannedDay.name : null) || "Today's workout";
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
                {hold === "recovery" ? "Recovery First Today" : "Check Recovery First"}
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">{name} · on hold</h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              {hold === "recovery"
                ? "Your check-in flagged pain or illness, so Dante recommends recovery over training today. Your workout isn't cancelled — see a medical professional if it persists or worsens."
                : "Today's pain/illness check-in couldn't be confirmed, so Dante isn't recommending a start. Check Recovery first."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/recovery"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-4 py-2.5 text-xs font-bold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
            >
              <CheckCircle2 className="size-4" />
              Recovery Guidance
            </Link>
            <Link href={workoutHref} className={SECONDARY_LINK}>
              <Calendar className="size-4" />
              {todaySession ? "View Session" : "Review Plan"}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // A not-started session on a plan REST day: neither record wins, so no Start until the schedule is reviewed.
  if (sessionStatus === "conflict") {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">Today&apos;s Training</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">Workout schedule needs review</h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              Your plan has today as a rest day, but {todaySession?.name || "a workout"} is also scheduled. Check Training before you start.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard/workouts" className={SECONDARY_LINK}>
              <Calendar className="size-4" />
              Review Schedule
            </Link>
            <Link href={workoutHref} className={SECONDARY_LINK}>
              <Dumbbell className="size-4" />
              View Session
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // The session couldn't be read or confirmed: offer neither a workout nor a rest day.
  if (sessionStatus === "unknown") {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">Today&apos;s Training</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">Workout status unavailable</h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              Today&apos;s session couldn&apos;t be loaded. Check Training before you start.
            </p>
          </div>
          <Link
            href="/dashboard/workouts"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-mf-glass-text transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            <Calendar className="size-4" />
            Review Schedule
          </Link>
        </div>
      </section>
    );
  }

  // A plan day has no session row until it is started: offer it, with a 1-tap Start (start_workout creates or begins it).
  if (!todaySession && plannedDay && plannedDay.kind !== "REST") {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7 shadow-lg">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-mf-glass-brand" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
                {plannedDay.kind === "SCHEDULED" ? "Today's Training" : "Next In Your Plan"}
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">{plannedDay.name}</h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              {plannedDay.exerciseCount} exercises · not started yet
            </p>
          </div>
          <form action={startWorkoutAction}>
            <input type="hidden" name="workout_day_id" value={plannedDay.dayId} />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-5 py-2.5 text-sm font-bold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
            >
              <Play className="size-4" />
              Start Workout
            </button>
          </form>
        </div>
      </section>
    );
  }

  // No session row and no plan day: a rest day only when the active plan says so (REST); with no plan (null) nothing is
  // scheduled, which is not a rest day.
  if (!todaySession) {
    const restDay = plannedDay?.kind === "REST";
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${restDay ? "bg-emerald-400" : "bg-zinc-500"}`} />
              <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
                {restDay ? "Scheduled Rest Day" : "No Plan Day Today"}
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">
              {restDay ? "Active Recovery" : "No workout planned"}
            </h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              {restDay
                ? "No training session scheduled for today. Prioritize sleep, nutrition, and light movement."
                : "No training session scheduled for today. Plan a workout to put one here."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/workouts"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-mf-glass-text transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <Calendar className="size-4" />
              Review Schedule
            </Link>
            <Link
              href="/dashboard/workouts/plans/new"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-4 py-2.5 text-xs font-bold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
            >
              <PlusCircle className="size-4" />
              Plan Workout
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const isCompleted = sessionStatus === "completed";
  const isInProgress = sessionStatus === "active";
  // Cancelled, or every exercise postponed: the Daily Brief calls it a rest day, so no Start here.
  const isPostponed = sessionStatus === "postponed";
  const exerciseCount = todaySession.exercises.length;
  const estimatedMin = todaySession.durationMinutes ?? 0;
  const totalSets = todaySession.exercises.reduce((acc, ex) => acc + (ex.targetSets || 0), 0);
  // Planned vs logged: a finished (or running) session reports what was logged, never the plan's total as done.
  const setsLabel =
    (isCompleted || isInProgress || isPostponed) && typeof todaySession.completedSets === "number"
      ? `${todaySession.completedSets} of ${totalSets} sets logged`
      : `${totalSets} sets planned`;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7 shadow-lg">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                isCompleted || isPostponed
                  ? "bg-emerald-400"
                  : isInProgress
                  ? "bg-amber-400 animate-pulse"
                  : "bg-mf-glass-brand"
              }`}
            />
            <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
              {isCompleted ? "Session Complete" : isPostponed ? "Session Postponed · Rest Day" : isInProgress ? "Session In Progress" : "Today's Training"}
            </p>
          </div>

          <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">
            {todaySession.name || "Scheduled Workout"}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mf-glass-text-muted">
            <span>{exerciseCount} exercises</span>
            <span>·</span>
            <span>{setsLabel}</span>
            {estimatedMin > 0 ? (
              <>
                <span>·</span>
                <span>~{estimatedMin} min</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isCompleted ? (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <CheckCircle2 className="size-4" />
              Review Session
            </Link>
          ) : isPostponed ? (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-mf-glass-text transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <Calendar className="size-4" />
              Review Session
            </Link>
          ) : isInProgress ? (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-300"
            >
              <Play className="size-4 fill-current" />
              Resume Workout
            </Link>
          ) : (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-mf-glass-brand px-6 py-2.5 text-sm font-bold text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover shadow-md"
            >
              <Dumbbell className="size-4" />
              Start Workout
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
