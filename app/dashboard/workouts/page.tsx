import { redirect } from "next/navigation";
import { z } from "zod";

import type { Database } from "@/database.types";
import { createClient } from "@/lib/supabase/server";

import {
  activateWorkoutPlanAction,
  archiveWorkoutPlanAction,
  createWorkoutDayAction,
  createWorkoutExerciseAction,
  createWorkoutPlanAction,
  deleteWorkoutDayAction,
  deleteWorkoutExerciseAction,
  deleteWorkoutPlanAction,
} from "./actions";

export const dynamic = "force-dynamic";

type WorkoutPlan =
  Database["public"]["Tables"]["workout_plans"]["Row"];

type WorkoutDay =
  Database["public"]["Tables"]["workout_days"]["Row"];

type WorkoutExercise =
  Database["public"]["Tables"]["workout_exercises"]["Row"];

type WorkoutDayWithExercises =
  WorkoutDay & {
    exercises: WorkoutExercise[];
  };

type WorkoutPlanWithDays =
  WorkoutPlan & {
    days: WorkoutDayWithExercises[];
  };

type WorkoutsPageProps = {
  searchParams: Promise<{
    client?: string | string[];
  }>;
};

const uuidSchema = z.string().uuid();

function sortByNumber<T>(
  items: T[],
  getNumber: (item: T) => number,
): T[] {
  return [...items].sort(
    (first, second) =>
      getNumber(first) -
      getNumber(second),
  );
}

function formatDate(
  value: string,
): string {
  return new Intl.DateTimeFormat(
    "en-SG",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(new Date(value));
}

function getStatusClasses(
  status: string,
): string {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";

    case "archived":
      return "border-zinc-700 bg-zinc-900 text-zinc-400";

    default:
      return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  }
}

function inputClasses(): string {
  return [
    "h-11 w-full rounded-xl",
    "border border-white/10",
    "bg-black/40 px-3",
    "text-sm text-white",
    "outline-none transition",
    "placeholder:text-zinc-700",
    "focus:border-orange-500/60",
    "focus:ring-4",
    "focus:ring-orange-500/10",
  ].join(" ");
}

export default async function WorkoutsPage({
  searchParams,
}: WorkoutsPageProps) {
  const supabase = await createClient();

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const userId =
    claimsData?.claims?.sub;

  if (
    claimsError ||
    !userId
  ) {
    redirect(
      "/login?next=/dashboard/workouts",
    );
  }

  const resolvedSearchParams =
    await searchParams;

  const rawClient =
    Array.isArray(
      resolvedSearchParams.client,
    )
      ? resolvedSearchParams.client[0]
      : resolvedSearchParams.client;

  const validClientId =
    rawClient &&
    uuidSchema.safeParse(rawClient).success
      ? rawClient
      : userId;

  const {
    data: canManage,
    error: permissionError,
  } = await supabase.rpc(
    "can_manage_workout_client",
    {
      target_client_id:
        validClientId,
    },
  );

  if (
    permissionError ||
    !canManage
  ) {
    throw new Error(
      "Bạn không có quyền xem workout của người dùng này.",
    );
  }

  const {
    data: plansData,
    error: plansError,
  } = await supabase
    .from("workout_plans")
    .select("*")
    .eq(
      "client_id",
      validClientId,
    )
    .order(
      "created_at",
      {
        ascending: false,
      },
    );

  if (plansError) {
    throw new Error(
      `Không thể tải workout plans: ${plansError.message}`,
    );
  }

  const plans =
    plansData ?? [];

  const planIds =
    plans.map(
      (plan) => plan.id,
    );

  let days: WorkoutDay[] = [];

  if (planIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from("workout_days")
      .select("*")
      .in(
        "workout_plan_id",
        planIds,
      )
      .order(
        "day_number",
        {
          ascending: true,
        },
      );

    if (error) {
      throw new Error(
        `Không thể tải workout days: ${error.message}`,
      );
    }

    days = data ?? [];
  }

  const dayIds =
    days.map(
      (day) => day.id,
    );

  let exercises: WorkoutExercise[] =
    [];

  if (dayIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from("workout_exercises")
      .select("*")
      .in(
        "workout_day_id",
        dayIds,
      )
      .order(
        "exercise_order",
        {
          ascending: true,
        },
      );

    if (error) {
      throw new Error(
        `Không thể tải exercises: ${error.message}`,
      );
    }

    exercises = data ?? [];
  }

  const exercisesByDay =
    new Map<
      string,
      WorkoutExercise[]
    >();

  exercises.forEach(
    (exercise) => {
      const current =
        exercisesByDay.get(
          exercise.workout_day_id,
        ) ?? [];

      current.push(exercise);

      exercisesByDay.set(
        exercise.workout_day_id,
        current,
      );
    },
  );

  const daysByPlan =
    new Map<
      string,
      WorkoutDayWithExercises[]
    >();

  days.forEach((day) => {
    const current =
      daysByPlan.get(
        day.workout_plan_id,
      ) ?? [];

    current.push({
      ...day,

      exercises:
        sortByNumber(
          exercisesByDay.get(day.id) ??
            [],

          (exercise) =>
            exercise.exercise_order,
        ),
    });

    daysByPlan.set(
      day.workout_plan_id,
      current,
    );
  });

  const plansWithDays:
    WorkoutPlanWithDays[] =
    plans.map((plan) => ({
      ...plan,

      days:
        sortByNumber(
          daysByPlan.get(plan.id) ??
            [],

          (day) =>
            day.day_number,
        ),
    }));

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
            Training system
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            Workout Plans
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
            Create personalised training
            plans, organise workout days
            and assign exercises.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <h2 className="text-xl font-black">
            Create a new plan
          </h2>

          <form
            action={
              createWorkoutPlanAction
            }
            className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <input
              type="hidden"
              name="client_id"
              value={validClientId}
            />

            <label className="space-y-2 xl:col-span-2">
              <span className="text-sm font-semibold text-zinc-300">
                Plan name
              </span>

              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                placeholder="12-week hypertrophy plan"
                className={inputClasses()}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-300">
                Goal
              </span>

              <input
                name="goal"
                maxLength={500}
                placeholder="Muscle gain"
                className={inputClasses()}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-300">
                Number of weeks
              </span>

              <input
                name="weeks"
                type="number"
                min={1}
                max={52}
                defaultValue={4}
                className={inputClasses()}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-300">
                Days per week
              </span>

              <input
                name="days_per_week"
                type="number"
                min={1}
                max={7}
                defaultValue={3}
                className={inputClasses()}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-zinc-300">
                Session duration
              </span>

              <input
                name="session_duration_minutes"
                type="number"
                min={15}
                max={300}
                defaultValue={60}
                className={inputClasses()}
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-zinc-300">
                Description
              </span>

              <input
                name="description"
                maxLength={2000}
                placeholder="Plan description"
                className={inputClasses()}
              />
            </label>

            <div className="flex items-end xl:col-span-4">
              <button
                type="submit"
                className="h-12 w-full rounded-xl bg-orange-400 px-6 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:bg-orange-300 sm:w-auto"
              >
                Create workout plan
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 space-y-6">
          {plansWithDays.length ===
          0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
              <p className="text-lg font-bold text-zinc-300">
                No workout plan yet
              </p>

              <p className="mt-2 text-sm text-zinc-600">
                Create the first plan
                using the form above.
              </p>
            </div>
          ) : (
            plansWithDays.map(
              (plan) => (
                <article
                  key={plan.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]"
                >
                  <div className="border-b border-white/10 p-5 sm:p-7">
                    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-2xl font-black">
                            {plan.name}
                          </h2>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${getStatusClasses(
                              plan.status,
                            )}`}
                          >
                            {plan.status}
                          </span>
                        </div>

                        {plan.description ? (
                          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-500">
                            {
                              plan.description
                            }
                          </p>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-wider text-zinc-600">
                          <span>
                            {
                              plan.weeks
                            }{" "}
                            weeks
                          </span>

                          <span>
                            {
                              plan.days_per_week
                            }{" "}
                            days/week
                          </span>

                          <span>
                            {
                              plan.session_duration_minutes
                            }{" "}
                            min/session
                          </span>

                          <span>
                            Created{" "}
                            {formatDate(
                              plan.created_at,
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {plan.status !==
                        "active" ? (
                          <form
                            action={
                              activateWorkoutPlanAction
                            }
                          >
                            <input
                              type="hidden"
                              name="plan_id"
                              value={
                                plan.id
                              }
                            />

                            <button
                              type="submit"
                              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/20"
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
                              value={
                                plan.id
                              }
                            />

                            <button
                              type="submit"
                              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-400 transition hover:bg-white/[0.08]"
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
                            value={
                              plan.id
                            }
                          />

                          <button
                            type="submit"
                            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-300 transition hover:bg-red-500/20"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>

                    <details className="mt-7 rounded-2xl border border-white/10 bg-black/30">
                      <summary className="cursor-pointer px-5 py-4 text-sm font-black uppercase tracking-wider text-orange-300">
                        Add training day
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
                          value={
                            plan.id
                          }
                        />

                        <input
                          name="day_number"
                          type="number"
                          min={1}
                          max={7}
                          required
                          placeholder="Day number"
                          className={inputClasses()}
                        />

                        <input
                          name="name"
                          required
                          placeholder="Push day"
                          className={inputClasses()}
                        />

                        <input
                          name="focus"
                          placeholder="Chest, shoulders, triceps"
                          className={inputClasses()}
                        />

                        <input
                          name="notes"
                          placeholder="Day notes"
                          className={inputClasses()}
                        />

                        <label className="flex items-center gap-3 text-sm text-zinc-400">
                          <input
                            type="checkbox"
                            name="rest_day"
                            className="h-4 w-4 accent-orange-400"
                          />

                          Rest day
                        </label>

                        <button
                          type="submit"
                          className="h-11 rounded-xl bg-white px-5 text-xs font-black uppercase tracking-wider text-black transition hover:bg-orange-300"
                        >
                          Add day
                        </button>
                      </form>
                    </details>
                  </div>

                  <div className="space-y-4 p-5 sm:p-7">
                    {plan.days.length ===
                    0 ? (
                      <p className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-zinc-600">
                        This plan does not
                        contain any workout
                        days.
                      </p>
                    ) : (
                      plan.days.map(
                        (day) => (
                          <section
                            key={
                              day.id
                            }
                            className="rounded-2xl border border-white/10 bg-black/30 p-5"
                          >
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                              <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">
                                  Day{" "}
                                  {
                                    day.day_number
                                  }
                                </p>

                                <h3 className="mt-1 text-xl font-black">
                                  {
                                    day.name
                                  }
                                </h3>

                                {day.focus ? (
                                  <p className="mt-2 text-sm text-zinc-500">
                                    {
                                      day.focus
                                    }
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
                                  value={
                                    day.id
                                  }
                                />

                                <button
                                  type="submit"
                                  className="text-xs font-bold text-red-400 transition hover:text-red-300"
                                >
                                  Delete day
                                </button>
                              </form>
                            </div>

                            <div className="mt-5 space-y-2">
                              {day
                                .exercises
                                .length ===
                              0 ? (
                                <p className="text-sm text-zinc-700">
                                  No
                                  exercise
                                  added.
                                </p>
                              ) : (
                                day.exercises.map(
                                  (
                                    exercise,
                                  ) => (
                                    <div
                                      key={
                                        exercise.id
                                      }
                                      className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 sm:flex-row sm:items-center"
                                    >
                                      <div>
                                        <p className="font-bold text-zinc-200">
                                          {
                                            exercise.exercise_order
                                          }

                                          .{" "}

                                          {
                                            exercise.exercise_name
                                          }
                                        </p>

                                        <p className="mt-1 text-xs text-zinc-600">
                                          {
                                            exercise.target_sets
                                          }{" "}
                                          sets
                                          ·{" "}

                                          {
                                            exercise.rep_min
                                          }

                                          –

                                          {
                                            exercise.rep_max
                                          }{" "}
                                          reps
                                          ·{" "}

                                          {
                                            exercise.rest_seconds
                                          }

                                          s
                                          rest
                                          {exercise.rir !==
                                          null
                                            ? ` · RIR ${exercise.rir}`
                                            : ""}
                                        </p>
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

                            {!day.rest_day ? (
                              <details className="mt-5 rounded-xl border border-white/10">
                                <summary className="cursor-pointer px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-400">
                                  Add exercise
                                </summary>

                                <form
                                  action={
                                    createWorkoutExerciseAction
                                  }
                                  className="grid gap-3 border-t border-white/10 p-4 md:grid-cols-3 xl:grid-cols-6"
                                >
                                  <input
                                    type="hidden"
                                    name="workout_day_id"
                                    value={
                                      day.id
                                    }
                                  />

                                  <input
                                    name="exercise_name"
                                    required
                                    placeholder="Exercise"
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="exercise_order"
                                    type="number"
                                    min={1}
                                    max={100}
                                    defaultValue={
                                      day
                                        .exercises
                                        .length +
                                      1
                                    }
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="target_sets"
                                    type="number"
                                    min={1}
                                    max={20}
                                    defaultValue={3}
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="rep_min"
                                    type="number"
                                    min={1}
                                    max={100}
                                    defaultValue={8}
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="rep_max"
                                    type="number"
                                    min={1}
                                    max={100}
                                    defaultValue={12}
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="rest_seconds"
                                    type="number"
                                    min={0}
                                    max={900}
                                    defaultValue={90}
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="tempo"
                                    placeholder="Tempo 3-1-1"
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="rir"
                                    type="number"
                                    min={0}
                                    max={5}
                                    placeholder="RIR"
                                    className={inputClasses()}
                                  />

                                  <input
                                    name="notes"
                                    placeholder="Exercise notes"
                                    className={inputClasses()}
                                  />

                                  <button
                                    type="submit"
                                    className="h-11 rounded-xl bg-orange-400 px-5 text-xs font-black uppercase tracking-wider text-black transition hover:bg-orange-300"
                                  >
                                    Add exercise
                                  </button>
                                </form>
                              </details>
                            ) : (
                              <p className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
                                Recovery / rest
                                day
                              </p>
                            )}
                          </section>
                        ),
                      )
                    )}
                  </div>
                </article>
              ),
            )
          )}
        </section>
      </div>
    </main>
  );
}