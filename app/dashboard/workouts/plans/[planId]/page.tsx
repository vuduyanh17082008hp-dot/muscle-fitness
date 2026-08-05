import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  FileText,
  Flame,
  Layers3,
  ListChecks,
  Target,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/app-database.types";

import {
  activateWorkoutPlanAction,
  archiveWorkoutPlanAction,
} from "../../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   DATABASE TYPES
========================================================= */

type WorkoutPlan =
  Database["public"]["Tables"]["workout_plans"]["Row"];

type WorkoutDay =
  Database["public"]["Tables"]["workout_days"]["Row"];

type WorkoutExercise =
  Database["public"]["Tables"]["workout_exercises"]["Row"];

type WorkoutDayWithExercises = WorkoutDay & {
  exercises: WorkoutExercise[];
};

type WorkoutPlanDetails = WorkoutPlan & {
  days: WorkoutDayWithExercises[];
};

type PlanDetailsPageProps = {
  params: Promise<{
    planId: string;
  }>;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";

    case "archived":
      return "Archived";

    default:
      return "Draft";
  }
}

function getStatusClasses(status: string): string {
  switch (status) {
    case "active":
      return [
        "border-emerald-500/30",
        "bg-emerald-500/10",
        "text-emerald-300",
      ].join(" ");

    case "archived":
      return [
        "border-zinc-700",
        "bg-zinc-900",
        "text-zinc-400",
      ].join(" ");

    default:
      return [
        "border-orange-500/30",
        "bg-orange-500/10",
        "text-orange-300",
      ].join(" ");
  }
}

function sortDays(days: WorkoutDay[]): WorkoutDay[] {
  return [...days].sort(
    (first, second) =>
      first.day_number - second.day_number,
  );
}

function sortExercises(
  exercises: WorkoutExercise[],
): WorkoutExercise[] {
  return [...exercises].sort(
    (first, second) =>
      first.exercise_order - second.exercise_order,
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function WorkoutPlanDetailsPage({
  params,
}: PlanDetailsPageProps) {
  const { planId } = await params;

  const supabase = await createClient();

  /* =======================================================
     AUTHENTICATION
  ======================================================= */

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/dashboard/workouts/plans/${planId}`,
      )}`,
    );
  }

  /* =======================================================
     LOAD PLAN
  ======================================================= */

  const {
    data: planData,
    error: planError,
  } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();

  if (planError) {
    throw new Error(
      `Unable to load workout plan: ${planError.message}`,
    );
  }

  if (!planData) {
    notFound();
  }

  const plan: WorkoutPlan = planData;

  /* =======================================================
     PERMISSION CHECK
  ======================================================= */

  const {
    data: canManagePlan,
    error: permissionError,
  } = await supabase.rpc(
    "can_manage_workout_client",
    {
      target_client_id: plan.client_id,
    },
  );

  if (permissionError) {
    throw new Error(
      `Unable to verify workout permission: ${permissionError.message}`,
    );
  }

  if (!canManagePlan) {
    redirect("/dashboard/workouts");
  }

  /* =======================================================
     LOAD DAYS
  ======================================================= */

  const {
    data: workoutDaysData,
    error: workoutDaysError,
  } = await supabase
    .from("workout_days")
    .select("*")
    .eq("workout_plan_id", plan.id)
    .order("day_number", {
      ascending: true,
    });

  if (workoutDaysError) {
    throw new Error(
      `Unable to load workout days: ${workoutDaysError.message}`,
    );
  }

  const workoutDays: WorkoutDay[] =
    workoutDaysData ?? [];

  const workoutDayIds = workoutDays.map(
    (day) => day.id,
  );

  /* =======================================================
     LOAD EXERCISES
  ======================================================= */

  let workoutExercises: WorkoutExercise[] = [];

  if (workoutDayIds.length > 0) {
    const {
      data: workoutExercisesData,
      error: workoutExercisesError,
    } = await supabase
      .from("workout_exercises")
      .select("*")
      .in("workout_day_id", workoutDayIds)
      .order("exercise_order", {
        ascending: true,
      });

    if (workoutExercisesError) {
      throw new Error(
        `Unable to load workout exercises: ${workoutExercisesError.message}`,
      );
    }

    workoutExercises =
      workoutExercisesData ?? [];
  }

  /* =======================================================
     GROUP EXERCISES BY DAY
  ======================================================= */

  const exercisesByDay = new Map<
    string,
    WorkoutExercise[]
  >();

  for (const exercise of workoutExercises) {
    const currentExercises =
      exercisesByDay.get(
        exercise.workout_day_id,
      ) ?? [];

    currentExercises.push(exercise);

    exercisesByDay.set(
      exercise.workout_day_id,
      currentExercises,
    );
  }

  const planDetails: WorkoutPlanDetails = {
    ...plan,

    days: sortDays(workoutDays).map((day) => ({
      ...day,

      exercises: sortExercises(
        exercisesByDay.get(day.id) ?? [],
      ),
    })),
  };

  /* =======================================================
     STATISTICS
  ======================================================= */

  const totalExercises =
    planDetails.days.reduce(
      (total, day) =>
        total + day.exercises.length,
      0,
    );

  const totalWorkingSets =
    planDetails.days.reduce(
      (planTotal, day) =>
        planTotal +
        day.exercises.reduce(
          (dayTotal, exercise) =>
            dayTotal + exercise.target_sets,
          0,
        ),
      0,
    );

  const trainingDays =
    planDetails.days.filter(
      (day) => !day.rest_day,
    ).length;

  const restDays =
    planDetails.days.filter(
      (day) => day.rest_day,
    ).length;

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* =================================================
            TOP NAVIGATION
        ================================================= */}

        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/workouts"
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
          >
            <ArrowLeft
              aria-hidden="true"
              className="h-4 w-4"
            />

            Back to workout plans
          </Link>

          <div className="flex flex-wrap gap-2">
            {planDetails.status !== "active" ? (
              <form action={activateWorkoutPlanAction}>
                <input
                  type="hidden"
                  name="plan_id"
                  value={planDetails.id}
                />

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 text-xs font-black uppercase tracking-[0.12em] text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="h-4 w-4"
                  />

                  Activate plan
                </button>
              </form>
            ) : null}

            {planDetails.status !== "archived" ? (
              <form action={archiveWorkoutPlanAction}>
                <input
                  type="hidden"
                  name="plan_id"
                  value={planDetails.id}
                />

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-xs font-black uppercase tracking-[0.12em] text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  <Archive
                    aria-hidden="true"
                    className="h-4 w-4"
                  />

                  Archive
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {/* =================================================
            PLAN HERO
        ================================================= */}

        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.32)] sm:p-8 lg:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute right-[-120px] top-[-160px] h-[420px] w-[420px] rounded-full bg-orange-500/[0.08] blur-[120px]" />

            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:52px_52px]" />
          </div>

          <div className="relative">
            <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                    Workout programme
                  </p>

                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${getStatusClasses(
                      planDetails.status,
                    )}`}
                  >
                    {getStatusLabel(
                      planDetails.status,
                    )}
                  </span>
                </div>

                <h1 className="mt-5 break-words text-4xl font-black tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                  {planDetails.name}
                </h1>

                <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
                  {planDetails.description ||
                    "A structured training programme designed to organise your workout days, exercises, sets and progression."}
                </p>

                <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold uppercase tracking-wider text-zinc-600">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />

                    Created{" "}
                    {formatDate(
                      planDetails.created_at,
                    )}
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <Clock3 className="h-4 w-4" />

                    Updated{" "}
                    {formatDate(
                      planDetails.updated_at,
                    )}
                  </span>
                </div>
              </div>

              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">
                  Primary goal
                </p>

                <div className="mt-3 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
                    <Target className="h-5 w-5 text-orange-400" />
                  </span>

                  <div>
                    <p className="font-black text-zinc-200">
                      {planDetails.goal ||
                        "General fitness"}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-zinc-600">
                      Main objective of this
                      training programme.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================
            SUMMARY
        ================================================= */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={
              <CalendarDays className="h-5 w-5" />
            }
            label="Programme duration"
            value={`${planDetails.weeks} weeks`}
          />

          <SummaryCard
            icon={
              <Layers3 className="h-5 w-5" />
            }
            label="Training frequency"
            value={`${planDetails.days_per_week} days/week`}
          />

          <SummaryCard
            icon={<Clock3 className="h-5 w-5" />}
            label="Session duration"
            value={`${planDetails.session_duration_minutes} min`}
          />

          <SummaryCard
            icon={<Flame className="h-5 w-5" />}
            label="Working sets"
            value={String(totalWorkingSets)}
          />
        </section>

        {/* =================================================
            PROGRAMME METRICS
        ================================================= */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Created days"
            value={planDetails.days.length}
          />

          <MetricCard
            label="Training days"
            value={trainingDays}
          />

          <MetricCard
            label="Recovery days"
            value={restDays}
          />

          <MetricCard
            label="Exercises"
            value={totalExercises}
          />
        </section>

        {/* =================================================
            WORKOUT DAYS
        ================================================= */}

        <section className="mt-10">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
                Programme structure
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Workout days
              </h2>
            </div>

            <p className="text-sm text-zinc-600">
              {planDetails.days.length} days ·{" "}
              {totalExercises} exercises
            </p>
          </div>

          {planDetails.days.length === 0 ? (
            <EmptyWorkoutDays planId={planDetails.id} />
          ) : (
            <div className="space-y-5">
              {planDetails.days.map((day) => (
                <WorkoutDayCard
                  key={day.id}
                  day={day}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

type SummaryCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function SummaryCard({
  icon,
  label,
  value,
}: SummaryCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
        {icon}
      </div>

      <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-xl font-black text-zinc-100">
        {value}
      </p>
    </article>
  );
}

type MetricCardProps = {
  label: string;
  value: number;
};

function MetricCard({
  label,
  value,
}: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
      <p className="text-2xl font-black text-white">
        {value}
      </p>

      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
    </article>
  );
}

type WorkoutDayCardProps = {
  day: WorkoutDayWithExercises;
};

function WorkoutDayCard({
  day,
}: WorkoutDayCardProps) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]">
      <header className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">
                Day {day.day_number}
              </span>

              {day.rest_day ? (
                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">
                  Recovery
                </span>
              ) : null}
            </div>

            <h3 className="mt-4 text-2xl font-black">
              {day.name}
            </h3>

            {day.focus ? (
              <p className="mt-2 text-sm text-zinc-500">
                {day.focus}
              </p>
            ) : null}

            {day.notes ? (
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
                {day.notes}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-right">
            <p className="text-lg font-black">
              {day.exercises.length}
            </p>

            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
              Exercises
            </p>
          </div>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {day.rest_day ? (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] px-5 py-5">
            <p className="font-bold text-blue-300">
              Recovery day
            </p>

            <p className="mt-2 text-sm leading-6 text-blue-200/50">
              No strength exercises are scheduled
              for this day. Prioritise sleep,
              mobility, hydration and recovery.
            </p>
          </div>
        ) : day.exercises.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
            <Dumbbell className="mx-auto h-6 w-6 text-zinc-700" />

            <p className="mt-3 text-sm font-bold text-zinc-500">
              No exercises added
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {day.exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

type ExerciseCardProps = {
  exercise: WorkoutExercise;
};

function ExerciseCard({
  exercise,
}: ExerciseCardProps) {
  return (
    <article className="flex flex-col justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-sm font-black text-orange-300">
          {exercise.exercise_order}
        </span>

        <div className="min-w-0">
          <h4 className="break-words font-black text-zinc-200">
            {exercise.exercise_name}
          </h4>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-zinc-600">
            <span>
              {exercise.target_sets} sets
            </span>

            <span>
              {exercise.rep_min}–
              {exercise.rep_max} reps
            </span>

            <span>
              {exercise.rest_seconds}s rest
            </span>

            {exercise.rir !== null ? (
              <span>RIR {exercise.rir}</span>
            ) : null}

            {exercise.tempo ? (
              <span>Tempo {exercise.tempo}</span>
            ) : null}
          </div>

          {exercise.notes ? (
            <p className="mt-2 text-xs leading-6 text-zinc-700">
              {exercise.notes}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-bold text-zinc-500">
          <ListChecks className="h-4 w-4" />

          {exercise.target_sets} working sets
        </span>
      </div>
    </article>
  );
}

type EmptyWorkoutDaysProps = {
  planId: string;
};

function EmptyWorkoutDays({
  planId,
}: EmptyWorkoutDaysProps) {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10">
        <FileText className="h-6 w-6 text-orange-400" />
      </div>

      <h3 className="mt-5 text-xl font-black text-zinc-200">
        No workout days yet
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-600">
        This plan has been created, but it does not
        contain any training days or exercises yet.
      </p>

      <Link
        href={`/dashboard/workouts?plan=${encodeURIComponent(
          planId,
        )}`}
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-400 px-5 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-300"
      >
        <Dumbbell className="h-4 w-4" />

        Manage plan
      </Link>
    </div>
  );
}