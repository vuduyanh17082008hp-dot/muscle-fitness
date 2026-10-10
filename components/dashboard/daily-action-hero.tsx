import Link from "next/link";
import { Dumbbell, Play, CheckCircle2, Calendar, PlusCircle } from "lucide-react";
import type { TodaySession } from "@/lib/training/load-today-session";

export type DailyActionHeroProps = {
  todaySession: TodaySession | null;
  hasCheckinToday?: boolean;
};

export function DailyActionHero({ todaySession }: DailyActionHeroProps) {
  // Determine state
  if (!todaySession) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
                Scheduled Rest Day
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">
              Active Recovery
            </h2>
            <p className="mt-1 text-sm text-mf-glass-text-muted">
              No training session scheduled for today. Prioritize sleep, nutrition, and light movement.
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
              href="/dashboard/workouts/plans"
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

  const isCompleted = todaySession.sessionState === "completed";
  const isInProgress = todaySession.sessionState === "in_progress";
  const exerciseCount = todaySession.exercises.length;
  const estimatedMin = todaySession.durationMinutes ?? 0;
  const totalSets = todaySession.exercises.reduce((acc, ex) => acc + (ex.targetSets || 0), 0);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-5 sm:p-7 shadow-lg">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                isCompleted
                  ? "bg-emerald-400"
                  : isInProgress
                  ? "bg-amber-400 animate-pulse"
                  : "bg-mf-glass-brand"
              }`}
            />
            <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
              {isCompleted ? "Session Complete" : isInProgress ? "Session In Progress" : "Today's Training"}
            </p>
          </div>

          <h2 className="mt-2 text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">
            {todaySession.name || "Scheduled Workout"}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mf-glass-text-muted">
            <span>{exerciseCount} exercises</span>
            <span>·</span>
            <span>{totalSets} working sets</span>
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
