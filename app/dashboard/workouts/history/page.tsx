import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Flame,
  History,
  ListChecks,
  Scale,
  Target,
  Trophy,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/app-database.types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   DATABASE TYPES
========================================================= */

type WorkoutSession =
  Database["public"]["Tables"]["workout_sessions"]["Row"];

type WorkoutSessionExercise =
  Database["public"]["Tables"]["workout_session_exercises"]["Row"];

type ExerciseSet =
  Database["public"]["Tables"]["exercise_sets"]["Row"];

type WorkoutPlan =
  Database["public"]["Tables"]["workout_plans"]["Row"];

type WorkoutDay =
  Database["public"]["Tables"]["workout_days"]["Row"];

/* =========================================================
   VIEW TYPES
========================================================= */

type ExerciseWithSets = {
  exercise: WorkoutSessionExercise;
  sets: ExerciseSet[];
};

type HistorySession = {
  session: WorkoutSession;

  planName: string;
  dayName: string;

  exerciseCount: number;
  plannedSetCount: number;
  completedSetCount: number;

  completionPercentage: number;
  calculatedVolume: number;

  exercises: ExerciseWithSets[];
};

type DerivedPersonalRecord = {
  exerciseName: string;

  weightKg: number;
  repetitions: number;

  estimatedOneRepMax: number;
  setVolume: number;

  performedAt: string;
  sessionId: string;
};

/* =========================================================
   HELPERS
========================================================= */

function isDefined<T>(
  value: T | null | undefined,
): value is T {
  return value !== null && value !== undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

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

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0 min";
  }

  const hours = Math.floor(seconds / 3600);

  const minutes = Math.floor(
    (seconds % 3600) / 60,
  );

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(minutes, 1)} min`;
}

function formatVolume(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 kg";
  }

  return `${Math.round(value).toLocaleString(
    "en-SG",
  )} kg`;
}

function calculateEstimatedOneRepMax(
  weightKg: number,
  repetitions: number,
): number {
  if (
    weightKg <= 0 ||
    repetitions <= 0
  ) {
    return 0;
  }

  if (repetitions === 1) {
    return weightKg;
  }

  // Epley estimated 1RM formula.
  return weightKg * (1 + repetitions / 30);
}

function calculateSetVolume(
  set: ExerciseSet,
): number {
  if (
    !set.completed ||
    set.weight_kg === null ||
    set.reps === null
  ) {
    return 0;
  }

  return (
    Number(set.weight_kg) *
    Number(set.reps)
  );
}

function getSessionTimestamp(
  session: WorkoutSession,
): string {
  return (
    session.completed_at ??
    session.started_at ??
    session.created_at
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function WorkoutHistoryPage() {
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
        "/dashboard/workouts/history",
      )}`,
    );
  }

  /* =======================================================
     LOAD COMPLETED SESSIONS

     No workout_logs query.
  ======================================================= */

  const {
    data: sessionsData,
    error: sessionsError,
  } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("session_state", "completed")
    .order("completed_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(100);

  if (sessionsError) {
    throw new Error(
      `Không thể tải workout history: ${sessionsError.message}`,
    );
  }

  const sessions: WorkoutSession[] =
    sessionsData ?? [];

  const sessionIds = sessions.map(
    (session) => session.id,
  );

  /* =======================================================
     LOAD SESSION EXERCISES
  ======================================================= */

  let sessionExercises:
    WorkoutSessionExercise[] = [];

  if (sessionIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from("workout_session_exercises")
      .select("*")
      .in("workout_session_id", sessionIds)
      .order("exercise_order", {
        ascending: true,
      });

    if (error) {
      throw new Error(
        `Không thể tải workout exercises: ${error.message}`,
      );
    }

    sessionExercises = data ?? [];
  }

  /* =======================================================
     LOAD EXERCISE SETS
  ======================================================= */

  let exerciseSets: ExerciseSet[] = [];

  if (sessionIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from("exercise_sets")
      .select("*")
      .in("workout_session_id", sessionIds)
      .order("set_number", {
        ascending: true,
      });

    if (error) {
      throw new Error(
        `Không thể tải exercise sets: ${error.message}`,
      );
    }

    exerciseSets = data ?? [];
  }

  /* =======================================================
     LOAD PLAN NAMES
  ======================================================= */

  const planIds = uniqueStrings(
    sessions
      .map(
        (session) =>
          session.workout_plan_id,
      )
      .filter(isDefined),
  );

  let plans: WorkoutPlan[] = [];

  if (planIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from("workout_plans")
      .select("*")
      .in("id", planIds);

    if (error) {
      throw new Error(
        `Không thể tải workout plans: ${error.message}`,
      );
    }

    plans = data ?? [];
  }

  /* =======================================================
     LOAD DAY NAMES
  ======================================================= */

  const dayIds = uniqueStrings(
    sessions
      .map(
        (session) =>
          session.workout_day_id,
      )
      .filter(isDefined),
  );

  let workoutDays: WorkoutDay[] = [];

  if (dayIds.length > 0) {
    const {
      data,
      error,
    } = await supabase
      .from("workout_days")
      .select("*")
      .in("id", dayIds);

    if (error) {
      throw new Error(
        `Không thể tải workout days: ${error.message}`,
      );
    }

    workoutDays = data ?? [];
  }

  /* =======================================================
     CREATE LOOKUP MAPS
  ======================================================= */

  const sessionById = new Map<
    string,
    WorkoutSession
  >();

  for (const session of sessions) {
    sessionById.set(session.id, session);
  }

  const planById = new Map<
    string,
    WorkoutPlan
  >();

  for (const plan of plans) {
    planById.set(plan.id, plan);
  }

  const dayById = new Map<
    string,
    WorkoutDay
  >();

  for (const day of workoutDays) {
    dayById.set(day.id, day);
  }

  const sessionExerciseById = new Map<
    string,
    WorkoutSessionExercise
  >();

  const exercisesBySession = new Map<
    string,
    WorkoutSessionExercise[]
  >();

  for (const exercise of sessionExercises) {
    sessionExerciseById.set(
      exercise.id,
      exercise,
    );

    const currentExercises =
      exercisesBySession.get(
        exercise.workout_session_id,
      ) ?? [];

    currentExercises.push(exercise);

    exercisesBySession.set(
      exercise.workout_session_id,
      currentExercises,
    );
  }

  const setsByExercise = new Map<
    string,
    ExerciseSet[]
  >();

  const setsBySession = new Map<
    string,
    ExerciseSet[]
  >();

  for (const set of exerciseSets) {
    const currentExerciseSets =
      setsByExercise.get(
        set.workout_session_exercise_id,
      ) ?? [];

    currentExerciseSets.push(set);

    setsByExercise.set(
      set.workout_session_exercise_id,
      currentExerciseSets,
    );

    const currentSessionSets =
      setsBySession.get(
        set.workout_session_id,
      ) ?? [];

    currentSessionSets.push(set);

    setsBySession.set(
      set.workout_session_id,
      currentSessionSets,
    );
  }

  /* =======================================================
     BUILD SESSION HISTORY
  ======================================================= */

  const historySessions: HistorySession[] =
    sessions.map((session) => {
      const sessionExerciseRows =
        exercisesBySession.get(session.id) ??
        [];

      const sessionSetRows =
        setsBySession.get(session.id) ??
        [];

      const activeExercises =
        sessionExerciseRows.filter(
          (exercise) =>
            !exercise.is_skipped,
        );

      const plannedSetCount =
        activeExercises.reduce(
          (total, exercise) =>
            total + exercise.target_sets,
          0,
        );

      const completedSetCount =
        sessionSetRows.filter(
          (set) => set.completed,
        ).length;

      const calculatedVolume =
        sessionSetRows.reduce(
          (total, set) =>
            total + calculateSetVolume(set),
          0,
        );

      const completionPercentage =
        plannedSetCount > 0
          ? Math.min(
              100,
              Math.round(
                (completedSetCount /
                  plannedSetCount) *
                  100,
              ),
            )
          : 0;

      const planName =
        session.workout_plan_id
          ? planById.get(
              session.workout_plan_id,
            )?.name ??
            "Deleted workout plan"
          : "Independent workout";

      const dayName =
        session.workout_day_id
          ? dayById.get(
              session.workout_day_id,
            )?.name ??
            "Deleted workout day"
          : "Custom session";

      const exercises: ExerciseWithSets[] =
        sessionExerciseRows.map(
          (exercise) => ({
            exercise,

            sets:
              setsByExercise.get(
                exercise.id,
              ) ?? [],
          }),
        );

      return {
        session,

        planName,
        dayName,

        exerciseCount:
          activeExercises.length,

        plannedSetCount,
        completedSetCount,

        completionPercentage,

        calculatedVolume:
          Number(session.total_volume) > 0
            ? Number(session.total_volume)
            : calculatedVolume,

        exercises,
      };
    });

  /* =======================================================
     DERIVE PERSONAL RECORDS

     No personal_records or exercise_library query.
  ======================================================= */

  const recordByExercise = new Map<
    string,
    DerivedPersonalRecord
  >();

  for (const set of exerciseSets) {
    if (
      !set.completed ||
      set.weight_kg === null ||
      set.reps === null
    ) {
      continue;
    }

    const weightKg = Number(set.weight_kg);
    const repetitions = Number(set.reps);

    if (
      !Number.isFinite(weightKg) ||
      !Number.isFinite(repetitions) ||
      weightKg <= 0 ||
      repetitions <= 0
    ) {
      continue;
    }

    const sessionExercise =
      sessionExerciseById.get(
        set.workout_session_exercise_id,
      );

    const session =
      sessionById.get(
        set.workout_session_id,
      );

    if (
      !sessionExercise ||
      !session
    ) {
      continue;
    }

    const estimatedOneRepMax =
      calculateEstimatedOneRepMax(
        weightKg,
        repetitions,
      );

    const candidate:
      DerivedPersonalRecord = {
      exerciseName:
        sessionExercise.exercise_name,

      weightKg,
      repetitions,

      estimatedOneRepMax,
      setVolume:
        weightKg * repetitions,

      performedAt:
        getSessionTimestamp(session),

      sessionId:
        session.id,
    };

    const currentRecord =
      recordByExercise.get(
        sessionExercise.exercise_name,
      );

    if (
      !currentRecord ||
      candidate.estimatedOneRepMax >
        currentRecord.estimatedOneRepMax
    ) {
      recordByExercise.set(
        sessionExercise.exercise_name,
        candidate,
      );
    }
  }

  const personalRecords =
    [...recordByExercise.values()]
      .sort(
        (first, second) =>
          second.estimatedOneRepMax -
          first.estimatedOneRepMax,
      )
      .slice(0, 8);

  /* =======================================================
     SUMMARY STATISTICS
  ======================================================= */

  const totalSessions =
    historySessions.length;

  const totalVolume =
    historySessions.reduce(
      (total, item) =>
        total + item.calculatedVolume,
      0,
    );

  const totalDurationSeconds =
    historySessions.reduce(
      (total, item) =>
        total +
        item.session.duration_seconds,
      0,
    );

  const averageDurationSeconds =
    totalSessions > 0
      ? Math.round(
          totalDurationSeconds /
            totalSessions,
        )
      : 0;

  const averageCompletion =
    totalSessions > 0
      ? Math.round(
          historySessions.reduce(
            (total, item) =>
              total +
              item.completionPercentage,
            0,
          ) / totalSessions,
        )
      : 0;

  const totalCompletedSets =
    exerciseSets.filter(
      (set) => set.completed,
    ).length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      {/* Background */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="absolute right-[-240px] top-[-260px] h-[650px] w-[650px] rounded-full bg-orange-500/[0.07] blur-[150px]" />

        <div className="absolute bottom-[-320px] left-[-260px] h-[700px] w-[700px] rounded-full bg-red-500/[0.045] blur-[170px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,7,7,0.9)_82%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Navigation */}

        <Link
          href="/dashboard/workouts"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />

          Back to workouts
        </Link>

        {/* Hero */}

        <header className="mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d]/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
                  <History className="h-5 w-5 text-orange-400" />
                </span>

                <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                  Training history
                </p>
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Workout History
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
                Review completed sessions,
                exercise performance, working
                sets, total volume and personal
                strength records.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
                Completed sessions
              </p>

              <p className="mt-2 text-3xl font-black text-orange-300">
                {totalSessions}
              </p>
            </div>
          </div>
        </header>

        {/* Summary */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={
              <CheckCircle2 className="h-5 w-5" />
            }
            label="Completed sessions"
            value={String(totalSessions)}
          />

          <MetricCard
            icon={
              <Scale className="h-5 w-5" />
            }
            label="Total volume"
            value={formatVolume(totalVolume)}
          />

          <MetricCard
            icon={
              <Clock3 className="h-5 w-5" />
            }
            label="Average duration"
            value={formatDuration(
              averageDurationSeconds,
            )}
          />

          <MetricCard
            icon={
              <Target className="h-5 w-5" />
            }
            label="Average completion"
            value={`${averageCompletion}%`}
          />
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <SmallMetricCard
            label="Completed working sets"
            value={totalCompletedSets}
          />

          <SmallMetricCard
            label="Exercise records"
            value={personalRecords.length}
          />
        </section>

        {/* Personal Records */}

        <section className="mt-10">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.27em] text-orange-400">
                Strength performance
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Personal Records
              </h2>

              <p className="mt-2 text-sm text-zinc-600">
                Calculated from your completed
                workout sets.
              </p>
            </div>

            <Trophy className="h-8 w-8 text-orange-400" />
          </div>

          {personalRecords.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
              <Trophy className="mx-auto h-8 w-8 text-zinc-700" />

              <h3 className="mt-4 text-lg font-black text-zinc-300">
                No personal records yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-600">
                Complete sets with recorded
                weight and repetitions to create
                your first strength record.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {personalRecords.map(
                (record, index) => (
                  <PersonalRecordCard
                    key={record.exerciseName}
                    record={record}
                    rank={index + 1}
                  />
                ),
              )}
            </div>
          )}
        </section>

        {/* Session History */}

        <section className="mt-12">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.27em] text-orange-400">
                Completed training
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Session Timeline
              </h2>
            </div>

            <p className="text-sm text-zinc-600">
              Showing up to 100 recent sessions
            </p>
          </div>

          {historySessions.length === 0 ? (
            <EmptyHistory />
          ) : (
            <div className="space-y-5">
              {historySessions.map(
                (historyItem, index) => (
                  <WorkoutHistoryCard
                    key={historyItem.session.id}
                    item={historyItem}
                    sessionNumber={
                      historySessions.length -
                      index
                    }
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

/* =========================================================
   COMPONENTS
========================================================= */

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

      <p className="mt-5 text-xs font-black uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-xl font-black text-zinc-100">
        {value}
      </p>
    </article>
  );
}

type SmallMetricCardProps = {
  label: string;
  value: number;
};

function SmallMetricCard({
  label,
  value,
}: SmallMetricCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 px-5 py-4">
      <p className="text-2xl font-black">
        {value}
      </p>

      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-600">
        {label}
      </p>
    </article>
  );
}

type PersonalRecordCardProps = {
  record: DerivedPersonalRecord;
  rank: number;
};

function PersonalRecordCard({
  record,
  rank,
}: PersonalRecordCardProps) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-white/[0.025] to-transparent p-5">
      <div className="absolute right-4 top-4 text-4xl font-black text-white/[0.035]">
        #{rank}
      </div>

      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
        <Trophy className="h-5 w-5" />
      </div>

      <h3 className="mt-5 line-clamp-2 font-black text-zinc-100">
        {record.exerciseName}
      </h3>

      <p className="mt-4 text-2xl font-black text-orange-300">
        {record.weightKg.toLocaleString(
          "en-SG",
          {
            maximumFractionDigits: 2,
          },
        )}{" "}
        kg
      </p>

      <p className="mt-1 text-xs font-semibold text-zinc-500">
        {record.repetitions} reps · Estimated
        1RM{" "}
        {Math.round(
          record.estimatedOneRepMax,
        ).toLocaleString("en-SG")}{" "}
        kg
      </p>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-xs text-zinc-600">
          {formatDate(record.performedAt)}
        </p>

        <Link
          href={`/dashboard/workouts/session/${record.sessionId}`}
          className="mt-2 inline-flex text-xs font-bold text-orange-400 transition hover:text-orange-300"
        >
          View session
        </Link>
      </div>
    </article>
  );
}

type WorkoutHistoryCardProps = {
  item: HistorySession;
  sessionNumber: number;
};

function WorkoutHistoryCard({
  item,
  sessionNumber,
}: WorkoutHistoryCardProps) {
  const {
    session,
    planName,
    dayName,
    exerciseCount,
    plannedSetCount,
    completedSetCount,
    completionPercentage,
    calculatedVolume,
    exercises,
  } = item;

  const completedAt =
    getSessionTimestamp(session);

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] shadow-[0_20px_70px_rgba(0,0,0,0.18)]">
      <header className="border-b border-white/10 p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-sm font-black text-orange-300">
              {sessionNumber}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="break-words text-xl font-black sm:text-2xl">
                  {dayName}
                </h3>

                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />

                  Completed
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-zinc-500">
                {planName}
              </p>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-zinc-600">
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />

                  {formatDateTime(completedAt)}
                </span>

                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />

                  {formatDuration(
                    session.duration_seconds,
                  )}
                </span>

                <span className="inline-flex items-center gap-2">
                  <Dumbbell className="h-4 w-4" />

                  {exerciseCount} exercises
                </span>
              </div>
            </div>
          </div>

          <Link
            href={`/dashboard/workouts/session/${session.id}`}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-orange-500/25 bg-orange-500/10 px-5 text-xs font-black uppercase tracking-[0.12em] text-orange-300 transition hover:bg-orange-500/20"
          >
            View session
          </Link>
        </div>
      </header>

      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-4">
        <SessionMetric
          icon={
            <ListChecks className="h-4 w-4" />
          }
          label="Sets"
          value={`${completedSetCount}/${plannedSetCount}`}
        />

        <SessionMetric
          icon={
            <Target className="h-4 w-4" />
          }
          label="Completion"
          value={`${completionPercentage}%`}
        />

        <SessionMetric
          icon={
            <Scale className="h-4 w-4" />
          }
          label="Volume"
          value={formatVolume(
            calculatedVolume,
          )}
        />

        <SessionMetric
          icon={
            <Flame className="h-4 w-4" />
          }
          label="Status"
          value="Finished"
        />
      </div>

      <details className="group border-t border-white/10">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-xs font-black uppercase tracking-[0.15em] text-zinc-500 transition hover:text-white sm:px-7">
          Exercise breakdown

          <span className="text-lg font-light transition group-open:rotate-45">
            +
          </span>
        </summary>

        <div className="space-y-3 border-t border-white/10 p-5 sm:p-7">
          {exercises.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-700">
              No exercises were recorded for
              this session.
            </p>
          ) : (
            exercises.map(
              ({ exercise, sets }) => {
                const completedSets =
                  sets.filter(
                    (set) =>
                      set.completed,
                  );

                const exerciseVolume =
                  completedSets.reduce(
                    (total, set) =>
                      total +
                      calculateSetVolume(
                        set,
                      ),
                    0,
                  );

                return (
                  <div
                    key={exercise.id}
                    className={`rounded-2xl border p-4 ${
                      exercise.is_skipped
                        ? "border-zinc-800 bg-zinc-950/60 opacity-60"
                        : "border-white/10 bg-white/[0.025]"
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex items-start gap-4">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-xs font-black text-orange-300">
                          {
                            exercise.exercise_order
                          }
                        </span>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-zinc-200">
                              {
                                exercise.exercise_name
                              }
                            </p>

                            {exercise.is_skipped ? (
                              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-500">
                                Skipped
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1 text-xs leading-6 text-zinc-600">
                            {
                              completedSets.length
                            }
                            /
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
                            target reps
                            {exercise.target_rir !==
                            null
                              ? ` · Target RIR ${exercise.target_rir}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-sm font-black text-zinc-300">
                          {formatVolume(
                            exerciseVolume,
                          )}
                        </p>

                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-700">
                          Exercise volume
                        </p>
                      </div>
                    </div>

                    {completedSets.length >
                    0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {completedSets.map(
                          (set) => (
                            <span
                              key={set.id}
                              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-500"
                            >
                              Set{" "}
                              {
                                set.set_number
                              }
                              :{" "}
                              {set.weight_kg !==
                              null
                                ? `${set.weight_kg} kg`
                                : "—"}{" "}
                              ×{" "}
                              {set.reps ??
                                "—"}
                              {set.rir !== null
                                ? ` · RIR ${set.rir}`
                                : ""}
                            </span>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              },
            )
          )}
        </div>
      </details>
    </article>
  );
}

type SessionMetricProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function SessionMetric({
  icon,
  label,
  value,
}: SessionMetricProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
      <div className="flex items-center gap-2 text-orange-400">
        {icon}

        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
          {label}
        </p>
      </div>

      <p className="mt-2 font-black text-zinc-200">
        {value}
      </p>
    </div>
  );
}

function EmptyHistory() {
  return (
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-20 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10">
        <Activity className="h-6 w-6 text-orange-400" />
      </div>

      <h2 className="mt-5 text-xl font-black text-zinc-200">
        No workout history yet
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-600">
        Complete your first workout session
        and it will appear here with your sets,
        volume and performance records.
      </p>

      <Link
        href="/dashboard/workouts"
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-400 px-5 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-300"
      >
        <Dumbbell className="h-4 w-4" />

        Open workouts
      </Link>
    </div>
  );
}