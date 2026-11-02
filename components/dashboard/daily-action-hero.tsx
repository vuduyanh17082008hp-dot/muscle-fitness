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

/* Iron & Paper (V4): one iron-bordered card, condensed uppercase title, lime action with an iron
   edge. Presentation only — every branch below is the same canonical state as before. */
const CARD = "relative overflow-hidden rounded-2xl border-2 border-mf-glass-text bg-mf-glass-surface p-5 shadow-[var(--shadow-card)] sm:p-7";
const QUIET_CARD = "relative overflow-hidden rounded-2xl border border-mf-glass-border-strong bg-mf-glass-surface p-5 sm:p-7";
const HOLD_CARD = "relative overflow-hidden rounded-2xl border-2 border-amber-400 bg-mf-glass-surface p-5 sm:p-7";
const EYEBROW = "text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted";
const TITLE = "mt-2 font-heading text-3xl font-black uppercase leading-none tracking-tight text-mf-glass-text sm:text-4xl";
const PRIMARY = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-mf-glass-text bg-mf-glass-brand px-6 font-heading text-lg font-bold uppercase tracking-[0.06em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover sm:w-auto";
const SECONDARY_LINK = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-mf-glass-border-strong bg-mf-glass-surface px-4 text-sm font-bold text-mf-glass-text transition hover:bg-mf-glass-hover";

/* Logbook-style figures from the real session only; a tile with no value is not drawn. */
function StatTiles({ tiles }: { tiles: Array<[label: string, value: string]> }) {
  return (
    <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-mf-glass-border bg-mf-glass-bg px-3 py-2.5">
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-muted">{label}</dt>
          <dd className="mt-0.5 font-heading text-xl font-bold tabular-nums text-mf-glass-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DailyActionHero({ todaySession, sessionStatus, plannedDay = null, hold = null }: DailyActionHeroProps) {
  const workoutHref = todaySession ? `/dashboard/workouts/session/${todaySession.id}` : "/dashboard/workouts";

  // The Daily Brief holds training (pain/illness, or the check-in couldn't be confirmed): the workout stays as planned and
  // viewable, but Start/Resume is not the recommended action. Temporary — it lifts when the check-in clears.
  if (hold && (sessionStatus === "planned" || sessionStatus === "active" || sessionStatus === "conflict")) {
    const name = todaySession?.name || (plannedDay && plannedDay.kind !== "REST" ? plannedDay.name : null) || "Today's workout";
    return (
      <section className={HOLD_CARD}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-400" />
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-400">
                {hold === "recovery" ? "Recovery First Today" : "Check Recovery First"}
              </p>
            </div>
            <h2 className={TITLE}>{name} · on hold</h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              {hold === "recovery"
                ? "Your check-in flagged pain or illness, so Dante recommends recovery over training today. Your workout isn't cancelled — see a medical professional if it persists or worsens."
                : "Today's pain/illness check-in couldn't be confirmed, so Dante isn't recommending a start. Check Recovery first."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/recovery"
              className={PRIMARY}
            >
              <CheckCircle2 className="size-4" />
              Recovery Guidance
            </Link>
            <Link href={workoutHref} className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-mf-glass-text-secondary underline underline-offset-4 hover:text-mf-glass-text">
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
      <section className={QUIET_CARD}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className={EYEBROW}>Today&apos;s Training</p>
            <h2 className={TITLE}>Workout schedule needs review</h2>
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
      <section className={QUIET_CARD}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className={EYEBROW}>Today&apos;s Training</p>
            <h2 className={TITLE}>Workout status unavailable</h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              Today&apos;s session couldn&apos;t be loaded. Check Training before you start.
            </p>
          </div>
          <Link
            href="/dashboard/workouts"
            className={SECONDARY_LINK}
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
      <section className={CARD}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-mf-glass-brand" />
              <p className={EYEBROW}>
                {plannedDay.kind === "SCHEDULED" ? "Today's Training" : "Next In Your Plan"}
              </p>
            </div>
            <h2 className={TITLE}>{plannedDay.name}</h2>
            <p className="mt-2 text-sm text-mf-glass-text-muted">
              {plannedDay.exerciseCount} exercises · not started yet
            </p>
          </div>
          <form action={startWorkoutAction}>
            <input type="hidden" name="workout_day_id" value={plannedDay.dayId} />
            <button
              type="submit"
              className={PRIMARY}
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
      <section className={QUIET_CARD}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${restDay ? "bg-emerald-400" : "bg-zinc-500"}`} />
              <p className={EYEBROW}>
                {restDay ? "Scheduled Rest Day" : "No Plan Day Today"}
              </p>
            </div>
            <h2 className={TITLE}>
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
              className={SECONDARY_LINK}
            >
              <Calendar className="size-4" />
              Review Schedule
            </Link>
            <Link
              href="/dashboard/workouts/plans/new"
              className={PRIMARY}
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
  // MF-F2: exercises the user postponed today (a confirmed adjustment) are not planned work any more — unless the whole
  // session was postponed, where the card shows what the rest day replaced.
  const plannedExercises = isPostponed ? todaySession.exercises : todaySession.exercises.filter((ex) => !ex.isSkipped);
  const postponedCount = isPostponed ? 0 : todaySession.exercises.length - plannedExercises.length;
  const exerciseCount = plannedExercises.length;
  const estimatedMin = todaySession.durationMinutes ?? 0;
  const totalSets = plannedExercises.reduce((acc, ex) => acc + (ex.targetSets || 0), 0);
  // Planned vs logged: a finished (or running) session reports what was logged, never the plan's total as done.
  const setsLabel =
    (isCompleted || isInProgress || isPostponed) && typeof todaySession.completedSets === "number"
      ? `${todaySession.completedSets} of ${totalSets} sets logged`
      : `${totalSets} sets planned`;

  return (
    <section className={CARD}>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                isCompleted || isPostponed
                  ? "bg-emerald-400"
                  : isInProgress
                  ? "bg-amber-400"
                  : "bg-mf-glass-brand"
              }`}
            />
            <p className={EYEBROW}>
              {isCompleted ? "Session Complete" : isPostponed ? "Session Postponed · Rest Day" : isInProgress ? "Session In Progress" : "Today's Training"}
            </p>
          </div>

          <h2 className={TITLE}>
            {todaySession.name || "Scheduled Workout"}
          </h2>

          <p className="sr-only">
            {exerciseCount} exercises · {setsLabel}
            {postponedCount > 0 ? ` · ${postponedCount} postponed today` : ""}
            {estimatedMin > 0 ? ` · ~${estimatedMin} min` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isCompleted ? (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border-2 border-emerald-500 px-5 font-heading text-lg font-bold uppercase tracking-[0.06em] text-emerald-300 transition hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="size-4" />
              Review Session
            </Link>
          ) : isPostponed ? (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className={SECONDARY_LINK}
            >
              <Calendar className="size-4" />
              Review Session
            </Link>
          ) : isInProgress ? (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className={PRIMARY}
            >
              <Play className="size-4 fill-current" />
              Resume Workout
            </Link>
          ) : (
            <Link
              href={`/dashboard/workouts/session/${todaySession.id}`}
              className={PRIMARY}
            >
              <Dumbbell className="size-4" />
              Start Workout
            </Link>
          )}
        </div>
      </div>
      <StatTiles
        tiles={[
          ["Exercises", String(exerciseCount)],
          setsLabel.endsWith(" sets logged") ? ["Sets logged", setsLabel.replace(" sets logged", "")] : ["Sets planned", String(totalSets)],
          ...(estimatedMin > 0 ? ([["Est. time", `~${estimatedMin} min`]] as Array<[string, string]>) : []),
        ]}
      />
    </section>
  );
}
