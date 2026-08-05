import type { ReactNode } from "react";
import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Gauge,
  ListChecks,
  PauseCircle,
  PlayCircle,
  Scale,
  XCircle,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/app-database.types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkoutSession =
  Database["public"]["Tables"]["workout_sessions"]["Row"];

type WorkoutSessionExercise =
  Database["public"]["Tables"]["workout_session_exercises"]["Row"];

type ExerciseSet =
  Database["public"]["Tables"]["exercise_sets"]["Row"];

type SessionExerciseWithSets =
  WorkoutSessionExercise & {
    sets: ExerciseSet[];
  };

type SessionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return "0 min";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(
    (seconds % 3600) / 60,
  );

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

function getStateLabel(
  state: WorkoutSession["session_state"],
): string {
  switch (state) {
    case "in_progress":
      return "In progress";

    case "paused":
      return "Paused";

    case "completed":
      return "Completed";

    case "cancelled":
      return "Cancelled";

    default:
      return "Not started";
  }
}

function getStateClasses(
  state: WorkoutSession["session_state"],
): string {
  switch (state) {
    case "in_progress":
      return "border-orange-500/30 bg-orange-500/10 text-orange-300";

    case "paused":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";

    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";

    case "cancelled":
      return "border-red-500/30 bg-red-500/10 text-red-300";

    default:
      return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }
}

function getStateIcon(
  state: WorkoutSession["session_state"],
): ReactNode {
  switch (state) {
    case "in_progress":
      return <PlayCircle className="h-4 w-4" />;

    case "paused":
      return <PauseCircle className="h-4 w-4" />;

    case "completed":
      return <CheckCircle2 className="h-4 w-4" />;

    case "cancelled":
      return <XCircle className="h-4 w-4" />;

    default:
      return <Clock3 className="h-4 w-4" />;
  }
}

export default async function WorkoutSessionPage({
  params,
}: SessionPageProps) {
  const { sessionId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      `/login?next=${encodeURIComponent(
        `/dashboard/workouts/session/${sessionId}`,
      )}`,
    );
  }

  const {
    data: sessionData,
    error: sessionError,
  } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError) {
    throw new Error(
      `Không thể tải workout session: ${sessionError.message}`,
    );
  }

  if (!sessionData) {
    notFound();
  }

  const session: WorkoutSession =
    sessionData;

  const {
    data: sessionExercisesData,
    error: sessionExercisesError,
  } = await supabase
    .from("workout_session_exercises")
    .select("*")
    .eq(
      "workout_session_id",
      session.id,
    )
    .order("exercise_order", {
      ascending: true,
    });

  if (sessionExercisesError) {
    throw new Error(
      `Không thể tải session exercises: ${sessionExercisesError.message}`,
    );
  }

  const sessionExercises:
    WorkoutSessionExercise[] =
    sessionExercisesData ?? [];

  let exerciseSets: ExerciseSet[] = [];

  if (sessionExercises.length > 0) {
    const {
      data: exerciseSetsData,
      error: exerciseSetsError,
    } = await supabase
      .from("exercise_sets")
      .select("*")
      .eq(
        "workout_session_id",
        session.id,
      )
      .order("set_number", {
        ascending: true,
      });

    if (exerciseSetsError) {
      throw new Error(
        `Không thể tải exercise sets: ${exerciseSetsError.message}`,
      );
    }

    exerciseSets = exerciseSetsData ?? [];
  }

  const setsByExercise = new Map<
    string,
    ExerciseSet[]
  >();

  for (const set of exerciseSets) {
    const currentSets =
      setsByExercise.get(
        set.workout_session_exercise_id,
      ) ?? [];

    currentSets.push(set);

    setsByExercise.set(
      set.workout_session_exercise_id,
      currentSets,
    );
  }

  const exercisesWithSets:
    SessionExerciseWithSets[] =
    sessionExercises.map((exercise) => ({
      ...exercise,

      sets:
        setsByExercise.get(exercise.id) ??
        [],
    }));

  const completedSets =
    exerciseSets.filter(
      (set) => set.completed,
    ).length;

  const plannedSets =
    exercisesWithSets.reduce(
      (total, exercise) =>
        total + exercise.target_sets,
      0,
    );

  const calculatedVolume =
    exerciseSets.reduce(
      (total, set) => {
        if (
          !set.completed ||
          set.weight_kg === null ||
          set.reps === null
        ) {
          return total;
        }

        return (
          total +
          Number(set.weight_kg) *
            set.reps
        );
      },
      0,
    );

  const completedExercises =
    exercisesWithSets.filter(
      (exercise) => {
        if (exercise.is_skipped) {
          return false;
        }

        return (
          exercise.sets.filter(
            (set) => set.completed,
          ).length >=
          exercise.target_sets
        );
      },
    ).length;

  const backHref =
    session.workout_plan_id
      ? `/dashboard/workouts/plans/${session.workout_plan_id}`
      : "/dashboard/workouts";

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />

          Back to workout
        </Link>

        <header className="relative mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
          <div className="pointer-events-none absolute right-[-180px] top-[-220px] h-[520px] w-[520px] rounded-full bg-orange-500/[0.08] blur-[140px]" />

          <div className="relative">
            <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
                    Workout session
                  </p>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${getStateClasses(
                      session.session_state,
                    )}`}
                  >
                    {getStateIcon(
                      session.session_state,
                    )}

                    {getStateLabel(
                      session.session_state,
                    )}
                  </span>
                </div>

                <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
                  Training Session
                </h1>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-500">
                  Track your working sets,
                  repetitions, load, RIR and total
                  training volume.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
                  Session ID
                </p>

                <p className="mt-2 max-w-64 break-all font-mono text-xs text-zinc-400">
                  {session.id}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={
              <Dumbbell className="h-5 w-5" />
            }
            label="Exercises"
            value={`${completedExercises}/${exercisesWithSets.length}`}
          />

          <MetricCard
            icon={
              <ListChecks className="h-5 w-5" />
            }
            label="Completed sets"
            value={`${completedSets}/${plannedSets}`}
          />

          <MetricCard
            icon={
              <Scale className="h-5 w-5" />
            }
            label="Volume"
            value={`${Math.round(
              calculatedVolume,
            ).toLocaleString()} kg`}
          />

          <MetricCard
            icon={
              <Clock3 className="h-5 w-5" />
            }
            label="Duration"
            value={formatDuration(
              session.duration_seconds,
            )}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <InfoCard
            label="Started"
            value={formatDateTime(
              session.started_at,
            )}
          />

          <InfoCard
            label="Completed"
            value={formatDateTime(
              session.completed_at,
            )}
          />
        </section>

        <section className="mt-10">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-orange-400">
                Exercise progress
              </p>

              <h2 className="mt-2 text-3xl font-black">
                Session exercises
              </h2>
            </div>

            <p className="text-sm text-zinc-600">
              {exercisesWithSets.length}{" "}
              exercises
            </p>
          </div>

          {exercisesWithSets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center">
              <Dumbbell className="mx-auto h-8 w-8 text-zinc-700" />

              <h3 className="mt-4 text-lg font-black text-zinc-300">
                No session exercises
              </h3>

              <p className="mt-2 text-sm text-zinc-600">
                This workout session does not
                contain any exercises yet.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {exercisesWithSets.map(
                (exercise) => (
                  <SessionExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                  />
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

type MetricCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function MetricCard({
  icon,
  label,
  value,
}: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
        {icon}
      </div>

      <p className="mt-5 text-xs font-black uppercase tracking-wider text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-xl font-black">
        {value}
      </p>
    </article>
  );
}

type InfoCardProps = {
  label: string;
  value: string;
};

function InfoCard({
  label,
  value,
}: InfoCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
      <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
        {label}
      </p>

      <p className="mt-2 font-semibold text-zinc-300">
        {value}
      </p>
    </article>
  );
}

type SessionExerciseCardProps = {
  exercise: SessionExerciseWithSets;
};

function SessionExerciseCard({
  exercise,
}: SessionExerciseCardProps) {
  const completedSetCount =
    exercise.sets.filter(
      (set) => set.completed,
    ).length;

  return (
    <article
      className={`overflow-hidden rounded-3xl border ${
        exercise.is_skipped
          ? "border-zinc-800 bg-zinc-950/60 opacity-70"
          : "border-white/10 bg-[#0d0d0d]"
      }`}
    >
      <header className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 font-black text-orange-300">
              {exercise.exercise_order}
            </span>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-black">
                  {exercise.exercise_name}
                </h3>

                {exercise.is_skipped ? (
                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Skipped
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-xs leading-6 text-zinc-600">
                {exercise.target_sets} sets ·{" "}
                {exercise.rep_min}–
                {exercise.rep_max} reps ·{" "}
                {exercise.rest_seconds}s rest
                {exercise.target_rir !== null
                  ? ` · Target RIR ${exercise.target_rir}`
                  : ""}
                {exercise.tempo
                  ? ` · Tempo ${exercise.tempo}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-right">
            <p className="font-black">
              {completedSetCount}/
              {exercise.target_sets}
            </p>

            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Sets complete
            </p>
          </div>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {exercise.sets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-700">
            No sets have been recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-wider text-zinc-600">
                  <th className="px-4 py-2">
                    Set
                  </th>

                  <th className="px-4 py-2">
                    Weight
                  </th>

                  <th className="px-4 py-2">
                    Reps
                  </th>

                  <th className="px-4 py-2">
                    RIR
                  </th>

                  <th className="px-4 py-2">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {exercise.sets.map((set) => (
                  <tr
                    key={set.id}
                    className="bg-white/[0.025] text-sm text-zinc-300"
                  >
                    <td className="rounded-l-xl px-4 py-3 font-black">
                      {set.set_number}
                    </td>

                    <td className="px-4 py-3">
                      {set.weight_kg !== null
                        ? `${set.weight_kg} kg`
                        : "—"}
                    </td>

                    <td className="px-4 py-3">
                      {set.reps ?? "—"}
                    </td>

                    <td className="px-4 py-3">
                      {set.rir ?? "—"}
                    </td>

                    <td className="rounded-r-xl px-4 py-3">
                      {set.completed ? (
                        <span className="inline-flex items-center gap-2 text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-zinc-600">
                          <Gauge className="h-4 w-4" />
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </article>
  );
}