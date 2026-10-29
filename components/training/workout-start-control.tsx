import Link from "next/link";
import { PlayCircle } from "lucide-react";

import { startWorkoutAction } from "@/app/dashboard/workouts/actions";
import { heldTrainingAction } from "@/lib/dashboard/training-hero-action";

type Hold = "recovery" | "unverified" | null;

/**
 * The recovery-first notice that replaces Start/Resume on Plan Detail and Session Detail while trainingHold(dailyDecision)
 * holds training today — the same copy and action as the Today/Training heroes. The plan or session itself stays viewable.
 */
export function TrainingHoldNotice({
  hold,
  secondary,
}: {
  hold: Exclude<Hold, null>;
  secondary?: { label: string; href: string };
}) {
  const action = heldTrainingAction(hold);
  return (
    <section role="status" className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-amber-400" />
        <p className="text-xs font-bold uppercase tracking-wider text-amber-200">{action.eyebrow}</p>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{action.note}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={action.href}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300"
        >
          {action.label}
        </Link>
        {secondary ? (
          <Link
            href={secondary.href}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-bold text-zinc-200 transition hover:bg-white/5"
          >
            {secondary.label}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** Today's not-started session on a plan REST day (classifyTodaySession "conflict"): the Today hero's F-03B/H reading. */
export function ScheduleConflictNote() {
  return (
    <p role="status" className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-sm leading-6 text-zinc-300">
      Workout schedule needs review — your plan has today as a rest day, but this session is also scheduled. Check your plan
      before you start.
    </p>
  );
}

/**
 * The Start button for a workout day (Plan Detail) or a planned session (Session Detail) — the form that calls start_workout.
 * Held → no form at all, only an "on hold" label; the page shows TrainingHoldNotice with the recovery action.
 */
export function WorkoutStartButton({
  workoutDayId,
  hold,
  size = "md",
}: {
  workoutDayId: string;
  hold: Hold;
  size?: "md" | "lg";
}) {
  if (hold) {
    return (
      <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-amber-200">
        {hold === "recovery" ? "On hold — recovery first" : "On hold — check recovery"}
      </p>
    );
  }
  return (
    <form action={startWorkoutAction}>
      <input type="hidden" name="workout_day_id" value={workoutDayId} />
      <button
        type="submit"
        className={
          size === "lg"
            ? "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 text-sm font-black uppercase tracking-[0.12em] text-black transition hover:bg-amber-300"
            : "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-amber-300"
        }
      >
        <PlayCircle aria-hidden="true" className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
        Start workout
      </button>
    </form>
  );
}
