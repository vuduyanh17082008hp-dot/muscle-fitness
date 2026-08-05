import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/app-database.types";

import {
  activateWorkoutPlanAction,
  archiveWorkoutPlanAction,
  createWorkoutDayAction,
  createWorkoutExerciseAction,
  createWorkoutPlanFormAction,
  deleteWorkoutDayAction,
  deleteWorkoutExerciseAction,
  deleteWorkoutPlanAction,
} from "./actions";

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

type WorkoutPlanWithDays = WorkoutPlan & {
  days: WorkoutDayWithExercises[];
};

type WorkoutsPageProps = {
  searchParams: Promise<{
    client?: string | string[];
  }>;
};

/* =========================================================
   HELPERS
========================================================= */

const uuidSchema = z.string().uuid();

function getInputClasses(): string {
  return [
    "h-12 w-full rounded-xl",
    "border border-white/10",
    "bg-black/40 px-4",
    "text-sm text-white",
    "outline-none transition",
    "placeholder:text-zinc-700",
    "hover:border-white/20",
    "focus:border-orange-400/70",
    "focus:ring-4",
    "focus:ring-orange-500/10",
    "disabled:cursor-not-allowed",
    "disabled:opacity-50",
  ].join(" ");
}

function getTextareaClasses(): string {
  return [
    "min-h-28 w-full resize-y rounded-xl",
    "border border-white/10",
    "bg-black/40 px-4 py-3",
    "text-sm leading-6 text-white",
    "outline-none transition",
    "placeholder:text-zinc-700",
    "hover:border-white/20",
    "focus:border-orange-400/70",
    "focus:ring-4",
    "focus:ring-orange-500/10",
  ].join(" ");
}

function sortByNumber<T>(
  items: T[],
  getValue: (item: T) => number,
): T[] {
  return [...items].sort(
    (firstItem, secondItem) =>
      getValue(firstItem) - getValue(secondItem),
  );
}

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

/* =========================================================
   PAGE
========================================================= */

export default async function WorkoutsPage({
  searchParams,
}: WorkoutsPageProps) {
  const supabase = await createClient();

  /* =======================================================
     AUTHENTICATION
  ======================================================= */

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/dashboard/workouts");
  }

  /* =======================================================
     RESOLVE CLIENT
  ======================================================= */

  const resolvedSearchParams = await searchParams;

  const rawClientId = Array.isArray(
    resolvedSearchParams.client,
  )
    ? resolvedSearchParams.client[0]
    : resolvedSearchParams.client;

  const parsedClientId = rawClientId
    ? uuidSchema.safeParse(rawClientId)
    : null;

  const clientId =
    parsedClientId?.success === true
      ? parsedClientId.data
      : user.id;

  /* =======================================================
     PERMISSION CHECK
  ======================================================= */

  const {
    data: canManageClient,
    error: permissionError,
  } = await supabase.rpc(
    "can_manage_workout_client",
    {
      target_client_id: clientId,
    },
  );

  if (permissionError) {
    throw new Error(
      `Không thể kiểm tra quyền truy cập: ${permissionError.message}`,
    );
  }

  if (!canManageClient) {
    throw new Error(
      "Bạn không có quyền xem hoặc quản lý workout của người dùng này.",
    );
  }

  /* =======================================================
     LOAD WORKOUT PLANS
  ======================================================= */

  const {
    data: workoutPlansData,
    error: workoutPlansError,
  } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", {
      ascending: false,
    });

  if (workoutPlansError) {
    throw new Error(
      `Không thể tải workout plans: ${workoutPlansError.message}`,
    );
  }

  const workoutPlans: WorkoutPlan[] =
    workoutPlansData ?? [];

  const workoutPlanIds = workoutPlans.map(
    (plan) => plan.id,
  );

  /* =======================================================
     LOAD WORKOUT DAYS
  ======================================================= */

  let workoutDays: WorkoutDay[] = [];

  if (workoutPlanIds.length > 0) {
    const {
      data: workoutDaysData,
      error: workoutDaysError,
    } = await supabase
      .from("workout_days")
      .select("*")
      .in("workout_plan_id", workoutPlanIds)
      .order("day_number", {
        ascending: true,
      });

    if (workoutDaysError) {
      throw new Error(
        `Không thể tải workout days: ${workoutDaysError.message}`,
      );
    }

    workoutDays = workoutDaysData ?? [];
  }

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
        `Không thể tải workout exercises: ${workoutExercisesError.message}`,
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

  /* =======================================================
     GROUP DAYS BY PLAN
  ======================================================= */

  const daysByPlan = new Map<
    string,
    WorkoutDayWithExercises[]
  >();

  for (const day of workoutDays) {
    const currentDays =
      daysByPlan.get(day.workout_plan_id) ??
      [];

    const dayExercises = sortByNumber(
      exercisesByDay.get(day.id) ?? [],
      (exercise) => exercise.exercise_order,
    );

    currentDays.push({
      ...day,
      exercises: dayExercises,
    });

    daysByPlan.set(
      day.workout_plan_id,
      currentDays,
    );
  }

  /* =======================================================
     FINAL STRUCTURE
  ======================================================= */

  const plansWithDays: WorkoutPlanWithDays[] =
    workoutPlans.map((plan) => ({
      ...plan,

      days: sortByNumber(
        daysByPlan.get(plan.id) ?? [],
        (day) => day.day_number,
      ),
    }));

  const activePlan = plansWithDays.find(
    (plan) => plan.status === "active",
  );

  const totalWorkoutDays = plansWithDays.reduce(
    (total, plan) => total + plan.days.length,
    0,
  );

  const totalExercises = plansWithDays.reduce(
    (planTotal, plan) =>
      planTotal +
      plan.days.reduce(
        (dayTotal, day) =>
          dayTotal + day.exercises.length,
        0,
      ),
    0,
  );

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="mb-10">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-orange-400">
            Training system
          </p>

          <div className="mt-3 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-[-0.04em] sm:text-5xl">
                Workout Plans
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
                Create personalised training
                plans, organise workout days and
                build complete exercise sessions.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatCard
                value={plansWithDays.length}
                label="Plans"
              />

              <StatCard
                value={totalWorkoutDays}
                label="Days"
              />

              <StatCard
                value={totalExercises}
                label="Exercises"
              />
            </div>
          </div>
        </header>

        {/* =================================================
            ACTIVE PLAN
        ================================================= */}

        {activePlan ? (
          <section className="mb-8 overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-white/[0.025] to-transparent p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />

                  <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
                    Current active plan
                  </p>
                </div>

                <h2 className="mt-3 text-2xl font-black sm:text-3xl">
                  {activePlan.name}
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {activePlan.days.length} workout
                  days · {activePlan.weeks} weeks ·{" "}
                  {
                    activePlan.session_duration_minutes
                  }{" "}
                  minutes per session
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                  Goal
                </p>

                <p className="mt-1 font-bold text-zinc-200">
                  {activePlan.goal ||
                    "General fitness"}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {/* =================================================
            CREATE PLAN
        ================================================= */}

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] sm:p-7">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-400">
              New programme
            </p>

            <h2 className="mt-2 text-xl font-black sm:text-2xl">
              Create a workout plan
            </h2>

            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Start with the general programme
              details. Workout days and exercises
              can be added afterwards.
            </p>
          </div>

          <form
  action={createWorkoutPlanFormAction}
  className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-4"
>
            <input
              type="hidden"
              name="client_id"
              value={clientId}
            />

            <Field
              label="Plan name"
              className="md:col-span-2"
            >
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                placeholder="12-week hypertrophy plan"
                className={getInputClasses()}
              />
            </Field>

            <Field label="Primary goal">
              <input
                name="goal"
                maxLength={500}
                placeholder="Muscle gain"
                className={getInputClasses()}
              />
            </Field>

            <Field label="Number of weeks">
              <input
                name="weeks"
                type="number"
                min={1}
                max={52}
                defaultValue={4}
                required
                className={getInputClasses()}
              />
            </Field>

            <Field label="Days per week">
              <input
                name="days_per_week"
                type="number"
                min={1}
                max={7}
                defaultValue={3}
                required
                className={getInputClasses()}
              />
            </Field>

            <Field label="Session duration">
              <div className="relative">
                <input
                  name="session_duration_minutes"
                  type="number"
                  min={15}
                  max={300}
                  defaultValue={60}
                  required
                  className={`${getInputClasses()} pr-20`}
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-600">
                  minutes
                </span>
              </div>
            </Field>

            <Field
              label="Description"
              className="md:col-span-2"
            >
              <textarea
                name="description"
                maxLength={2000}
                placeholder="Describe the purpose, structure and progression of this programme."
                className={getTextareaClasses()}
              />
            </Field>

            <div className="flex items-end md:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="h-12 w-full rounded-xl bg-orange-400 px-7 text-sm font-black uppercase tracking-[0.15em] text-black transition hover:bg-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-500/20 sm:w-auto"
              >
                Create workout plan
              </button>
            </div>
          </form>
        </section>

        {/* =================================================
            PLAN LIST
        ================================================= */}

        <section className="mt-8 space-y-6">
          {plansWithDays.length === 0 ? (
            <EmptyPlans />
          ) : (
            plansWithDays.map((plan) => (
              <article
                key={plan.id}
                className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
              >
                {/* Plan header */}

                <div className="border-b border-white/10 p-5 sm:p-7">
                  <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="break-words text-2xl font-black tracking-tight">
                          {plan.name}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${getStatusClasses(
                            plan.status,
                          )}`}
                        >
                          {getStatusLabel(
                            plan.status,
                          )}
                        </span>
                      </div>

                      {plan.description ? (
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-500">
                          {plan.description}
                        </p>
                      ) : null}

                      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold uppercase tracking-wider text-zinc-600">
                        <span>
                          {plan.weeks} weeks
                        </span>

                        <span>
                          {plan.days_per_week}{" "}
                          days/week
                        </span>

                        <span>
                          {
                            plan.session_duration_minutes
                          }{" "}
                          min/session
                        </span>

                        <span>
                          {plan.days.length} days
                          created
                        </span>

                        <span>
                          Created{" "}
                          {formatDate(
                            plan.created_at,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {plan.status !== "active" ? (
                        <form
                          action={
                            activateWorkoutPlanAction
                          }
                        >
                          <input
                            type="hidden"
                            name="plan_id"
                            value={plan.id}
                          />

                          <button
                            type="submit"
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/20"
                          >
                            Activate
                          </button>
                        </form>
                      ) : null}

                      {plan.status !==
                      "archived" ? (
                        <form
                          action={
                            archiveWorkoutPlanAction
                          }
                        >
                          <input
                            type="hidden"
                            name="plan_id"
                            value={plan.id}
                          />

                          <button
                            type="submit"
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
                          >
                            Archive
                          </button>
                        </form>
                      ) : null}

                      <form
                        action={
                          deleteWorkoutPlanAction
                        }
                      >
                        <input
                          type="hidden"
                          name="plan_id"
                          value={plan.id}
                        />

                        <button
                          type="submit"
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-red-300 transition hover:bg-red-500/20"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Add day */}

                  <details className="group mt-7 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-black uppercase tracking-wider text-orange-300">
                      Add training day

                      <span className="text-xl font-light transition group-open:rotate-45">
                        +
                      </span>
                    </summary>

                    <form
                      action={
                        createWorkoutDayAction
                      }
                      className="grid gap-4 border-t border-white/10 p-5 md:grid-cols-2 xl:grid-cols-4"
                    >
                      <input
                        type="hidden"
                        name="workout_plan_id"
                        value={plan.id}
                      />

                      <Field label="Day number">
                        <input
                          name="day_number"
                          type="number"
                          min={1}
                          max={7}
                          required
                          placeholder="1"
                          className={getInputClasses()}
                        />
                      </Field>

                      <Field label="Day name">
                        <input
                          name="name"
                          required
                          minLength={2}
                          maxLength={120}
                          placeholder="Push day"
                          className={getInputClasses()}
                        />
                      </Field>

                      <Field label="Training focus">
                        <input
                          name="focus"
                          maxLength={300}
                          placeholder="Chest, shoulders, triceps"
                          className={getInputClasses()}
                        />
                      </Field>

                      <Field label="Notes">
                        <input
                          name="notes"
                          maxLength={2000}
                          placeholder="Heavy compound focus"
                          className={getInputClasses()}
                        />
                      </Field>

                      <label className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-zinc-400">
                        <input
                          type="checkbox"
                          name="rest_day"
                          className="h-4 w-4 accent-orange-400"
                        />

                        Mark as rest day
                      </label>

                      <div className="flex items-end md:col-span-2 xl:col-span-3">
                        <button
                          type="submit"
                          className="h-12 w-full rounded-xl bg-white px-6 text-xs font-black uppercase tracking-[0.15em] text-black transition hover:bg-orange-300 sm:w-auto"
                        >
                          Add training day
                        </button>
                      </div>
                    </form>
                  </details>
                </div>

                {/* Workout days */}

                <div className="space-y-4 p-5 sm:p-7">
                  {plan.days.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
                      <p className="font-bold text-zinc-400">
                        No training days yet
                      </p>

                      <p className="mt-2 text-sm text-zinc-700">
                        Open “Add training
                        day” to begin building
                        this programme.
                      </p>
                    </div>
                  ) : (
                    plan.days.map((day) => (
                      <section
                        key={day.id}
                        className="rounded-2xl border border-white/10 bg-black/30 p-5"
                      >
                        {/* Day header */}

                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-400">
                                Day{" "}
                                {day.day_number}
                              </p>

                              {day.rest_day ? (
                                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-300">
                                  Recovery
                                </span>
                              ) : null}
                            </div>

                            <h3 className="mt-2 text-xl font-black">
                              {day.name}
                            </h3>

                            {day.focus ? (
                              <p className="mt-2 text-sm text-zinc-500">
                                {day.focus}
                              </p>
                            ) : null}

                            {day.notes ? (
                              <p className="mt-2 text-xs leading-6 text-zinc-700">
                                {day.notes}
                              </p>
                            ) : null}
                          </div>

                          <form
                            action={
                              deleteWorkoutDayAction
                            }
                          >
                            <input
                              type="hidden"
                              name="day_id"
                              value={day.id}
                            />

                            <button
                              type="submit"
                              className="text-xs font-bold text-red-400 transition hover:text-red-300"
                            >
                              Delete day
                            </button>
                          </form>
                        </div>

                        {/* Exercise list */}

                        <div className="mt-6 space-y-2">
                          {day.exercises.length ===
                          0 ? (
                            <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-700">
                              No exercises added
                              to this day.
                            </p>
                          ) : (
                            day.exercises.map(
                              (exercise) => (
                                <div
                                  key={
                                    exercise.id
                                  }
                                  className="flex flex-col justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-4 sm:flex-row sm:items-center"
                                >
                                  <div className="flex min-w-0 items-start gap-4">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-xs font-black text-orange-300">
                                      {
                                        exercise.exercise_order
                                      }
                                    </span>

                                    <div className="min-w-0">
                                      <p className="break-words font-bold text-zinc-200">
                                        {
                                          exercise.exercise_name
                                        }
                                      </p>

                                      <p className="mt-1 text-xs leading-6 text-zinc-600">
                                        {
                                          exercise.target_sets
                                        }{" "}
                                        sets ·{" "}
                                        {
                                          exercise.rep_min
                                        }
                                        –
                                        {
                                          exercise.rep_max
                                        }{" "}
                                        reps ·{" "}
                                        {
                                          exercise.rest_seconds
                                        }
                                        s rest
                                        {exercise.rir !==
                                        null
                                          ? ` · RIR ${exercise.rir}`
                                          : ""}
                                        {exercise.tempo
                                          ? ` · Tempo ${exercise.tempo}`
                                          : ""}
                                      </p>

                                      {exercise.notes ? (
                                        <p className="mt-1 text-xs leading-5 text-zinc-700">
                                          {
                                            exercise.notes
                                          }
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>

                                  <form
                                    action={
                                      deleteWorkoutExerciseAction
                                    }
                                  >
                                    <input
                                      type="hidden"
                                      name="exercise_id"
                                      value={
                                        exercise.id
                                      }
                                    />

                                    <button
                                      type="submit"
                                      className="text-xs font-bold text-red-400 transition hover:text-red-300"
                                    >
                                      Remove
                                    </button>
                                  </form>
                                </div>
                              ),
                            )
                          )}
                        </div>

                        {/* Add exercise */}

                        {!day.rest_day ? (
                          <details className="group mt-5 overflow-hidden rounded-xl border border-white/10">
                            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-400">
                              Add exercise

                              <span className="text-lg transition group-open:rotate-45">
                                +
                              </span>
                            </summary>

                            <form
                              action={
                                createWorkoutExerciseAction
                              }
                              className="grid gap-4 border-t border-white/10 p-4 md:grid-cols-2 xl:grid-cols-4"
                            >
                              <input
                                type="hidden"
                                name="workout_day_id"
                                value={day.id}
                              />

                              <Field
                                label="Exercise name"
                                className="md:col-span-2"
                              >
                                <input
                                  name="exercise_name"
                                  required
                                  minLength={2}
                                  maxLength={160}
                                  placeholder="Incline dumbbell press"
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field label="Order">
                                <input
                                  name="exercise_order"
                                  type="number"
                                  min={1}
                                  max={100}
                                  defaultValue={
                                    day.exercises
                                      .length + 1
                                  }
                                  required
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field label="Sets">
                                <input
                                  name="target_sets"
                                  type="number"
                                  min={1}
                                  max={20}
                                  defaultValue={3}
                                  required
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field label="Minimum reps">
                                <input
                                  name="rep_min"
                                  type="number"
                                  min={1}
                                  max={100}
                                  defaultValue={8}
                                  required
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field label="Maximum reps">
                                <input
                                  name="rep_max"
                                  type="number"
                                  min={1}
                                  max={100}
                                  defaultValue={12}
                                  required
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field label="Rest seconds">
                                <input
                                  name="rest_seconds"
                                  type="number"
                                  min={0}
                                  max={900}
                                  defaultValue={90}
                                  required
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field label="RIR">
                                <input
                                  name="rir"
                                  type="number"
                                  min={0}
                                  max={5}
                                  placeholder="2"
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field label="Tempo">
                                <input
                                  name="tempo"
                                  maxLength={30}
                                  placeholder="3-1-1"
                                  className={getInputClasses()}
                                />
                              </Field>

                              <Field
                                label="Exercise notes"
                                className="md:col-span-2"
                              >
                                <input
                                  name="notes"
                                  maxLength={1000}
                                  placeholder="Control the eccentric and avoid locking out."
                                  className={getInputClasses()}
                                />
                              </Field>

                              <div className="flex items-end md:col-span-2 xl:col-span-4">
                                <button
                                  type="submit"
                                  className="h-12 w-full rounded-xl bg-orange-400 px-6 text-xs font-black uppercase tracking-[0.15em] text-black transition hover:bg-orange-300 sm:w-auto"
                                >
                                  Add exercise
                                </button>
                              </div>
                            </form>
                          </details>
                        ) : (
                          <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
                            This is a recovery
                            day. Exercise entry is
                            disabled.
                          </div>
                        )}
                      </section>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

type FieldProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

function Field({
  label,
  children,
  className = "",
}: FieldProps) {
  return (
    <label className={`space-y-2 ${className}`}>
      <span className="block text-sm font-semibold text-zinc-300">
        {label}
      </span>

      {children}
    </label>
  );
}

type StatCardProps = {
  value: number;
  label: string;
};

function StatCard({
  value,
  label,
}: StatCardProps) {
  return (
    <div className="min-w-20 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-center">
      <p className="text-xl font-black text-white">
        {value}
      </p>

      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
    </div>
  );
}

function EmptyPlans() {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-20 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-xl font-black text-orange-300">
        MF
      </div>

      <h2 className="mt-5 text-xl font-black text-zinc-200">
        No workout plan yet
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-600">
        Create your first plan using the
        form above. You can then add training
        days and exercises.
      </p>
    </div>
  );
}