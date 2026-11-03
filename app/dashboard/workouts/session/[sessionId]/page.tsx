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
import type { Database } from "@/database.types.generated";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { buildAdaptiveProgram, type ProgramAdaptation } from "@/lib/dante-core/adaptive-program-engine";
import { logProgramAdaptations } from "@/lib/dante-core/program-adaptation-log";
import { loadAdaptationHistory, type AdaptationHistoryEntry } from "@/lib/dante-core/load-adaptation-history";
import type { RecoveryStatusInput, TrainingLoadStateInput } from "@/lib/training/recommendations";
import type { TraceableDecision } from "@/lib/dante-core/types";
import { AdaptiveRecommendationCard } from "@/components/training/adaptive-recommendation-card";
import { WorkoutPlayer } from "@/features/workouts/workout-player";
import { resolveUserTimeZone } from "@/lib/training/load-today-session";
import { formatSessionDateTime } from "@/lib/training/session-time";
import { loadDailyDecision } from "@/lib/dante-core/server/load-daily-decision";
import { loadPreviousPerformance } from "@/lib/training/load-previous-performance";
import { loadExerciseFamiliarity } from "@/lib/training/load-exercise-familiarity";
import { parseExperience } from "@/lib/training/exercise-substitution";
import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library";
import { ScheduleConflictNote, TrainingHoldNotice, WorkoutStartButton } from "@/components/training/workout-start-control";
import type {
  WorkoutPlayerExercise,
  WorkoutReplacementOption,
} from "@/features/workouts/types";

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

function sessionLoadError(
  step: string,
  error: { message: string },
): ReactNode {
  console.error(
    `[SESSION PAGE] failed to load ${step}:`,
    error.message,
  );

  return (
    <main className="min-h-screen bg-mf-bg px-4 py-8 text-white sm:px-6 lg:px-10">
      <div
        role="alert"
        className="mx-auto max-w-3xl rounded-3xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center"
      >
        <h1 className="text-xl font-black">
          Workout session is unavailable
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          We could not load this session. Please try again in a
          moment.
        </p>
      </div>
    </main>
  );
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
      return "border-mf-training/30 bg-mf-training/10 text-mf-training";

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
    return sessionLoadError("session", sessionError);
  }

  if (!sessionData) {
    notFound();
  }

  const session: WorkoutSession =
    sessionData;

  const timeZone = await resolveUserTimeZone(supabase, user.id);

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
    return sessionLoadError("exercises", sessionExercisesError);
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
      .in(
        "session_exercise_id",
        sessionExercises.map((exercise) => exercise.id),
      )
      .order("set_number", {
        ascending: true,
      });

    if (exerciseSetsError) {
      return sessionLoadError("sets", exerciseSetsError);
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
        set.session_exercise_id,
      ) ?? [];

    currentSets.push(set);

    setsByExercise.set(
      set.session_exercise_id,
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

  const backHref =
    session.workout_plan_id
      ? `/dashboard/workouts/plans/${session.workout_plan_id}`
      : "/dashboard/workouts";

  // A direct link here must not bypass the Daily Brief's safety decision: while it holds training (pain/illness, or an
  // unconfirmed check-in) a planned session offers no Start, and an in-progress one shows the hold above the logger.
  // Finished sessions are history and need no decision.
  const trainable =
    session.session_state === "in_progress" ||
    session.session_state === "not_started" ||
    session.session_state === null;
  const daily = trainable ? await loadDailyDecision(supabase, user.id) : null;
  const hold = daily?.hold ?? null;
  // Today's not-started session on a plan REST day: the same "needs review" reading as the Today hero (F-03B / H).
  const scheduleConflict =
    daily?.todaySession?.id === session.id && daily.todaySessionStatus === "conflict";
  const holdNotice = hold ? (
    <TrainingHoldNotice hold={hold} secondary={{ label: "Review plan", href: backHref }} />
  ) : null;

  /* =========================================================
     ACTIVE SESSION — the one interactive logger (WorkoutPlayer).
     Only `in_progress` is active: it is the only state
     finish_workout accepts. Every other state falls through to
     the read-only view below.
  ========================================================= */

  if (session.session_state === "in_progress") {
    const exerciseIds = sessionExercises.map(
      (exercise) => exercise.exercise_id,
    );

    // Library metadata and the substitution flag only enrich the
    // player. A failed lookup must never block logging, so both
    // degrade to "no metadata / no substitution".
    const { data: libraryRows } =
      exerciseIds.length > 0
        ? await supabase
            .from("exercise_library")
            .select("id, slug, name, primary_muscle, equipment")
            .in("id", exerciseIds)
        : { data: [] };

    const libraryById = new Map(
      (libraryRows ?? []).map((row) => [row.id, row]),
    );

    const { data: plan } = session.workout_plan_id
      ? await supabase
          .from("workout_plans")
          .select("allow_client_substitution")
          .eq("id", session.workout_plan_id)
          .maybeSingle()
      : { data: null };

    const allowSubstitution =
      plan?.allow_client_substitution === true;

    // Find Alternative: the recommendation catalogue is static; only its slugs that
    // exist as PUBLIC rows here can be applied (RLS and the replace mutation still
    // authorize every write). A failed lookup degrades to review-only alternatives.
    const [{ data: catalogueRows }, familiarSlugs, { data: fitness }] = await Promise.all([
      supabase
        .from("exercise_library")
        .select("id, slug, name, primary_muscle, equipment")
        .is("owner_id", null)
        .eq("is_active", true)
        .in("slug", EXERCISE_CATALOGUE.map((item) => item.slug ?? "").filter(Boolean)),
      loadExerciseFamiliarity(supabase, user.id).catch(() => []),
      supabase.from("fitness_profiles").select("experience").eq("user_id", user.id).maybeSingle(),
    ]);

    const replacementOptions: WorkoutReplacementOption[] = (
      catalogueRows ?? []
    ).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      primaryMuscle: row.primary_muscle ?? "",
      equipment: row.equipment ?? "",
    }));

    const previousByExercise = await loadPreviousPerformance(supabase, user.id, exerciseIds);

    const playerExercises: WorkoutPlayerExercise[] =
      exercisesWithSets.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exercise_id,
        slug: libraryById.get(exercise.exercise_id)?.slug ?? null,
        name: exercise.display_name,
        primaryMuscle:
          libraryById.get(exercise.exercise_id)?.primary_muscle ?? "",
        equipment:
          libraryById.get(exercise.exercise_id)?.equipment ?? "",
        exerciseOrder: exercise.exercise_order,
        targetSets: exercise.target_sets,
        repMin: exercise.target_rep_min,
        repMax: exercise.target_rep_max,
        targetRir: exercise.target_rir,
        targetRpe: exercise.target_rpe,
        restSeconds: exercise.rest_seconds,
        notes: exercise.notes,
        isSkipped: exercise.is_skipped,
        sets: exercise.sets.map((set) => ({
          id: set.id,
          setNumber: set.set_number,
          setType: set.set_type,
          targetReps: set.target_reps,
          weightKg:
            set.weight_kg === null ? null : Number(set.weight_kg),
          reps: set.reps,
          rir: set.rir === null ? null : Number(set.rir),
          rpe: set.rpe === null ? null : Number(set.rpe),
          completed: set.completed,
        })),
        previous: previousByExercise.get(exercise.exercise_id) ?? null,
      }));

    return (
      <main className="min-h-screen bg-mf-bg px-4 pb-4 pt-2 text-white sm:py-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl">
          {/* 44px tap target without adding layout height (the first set input must clear the fold at 320×640). */}
          <Link
            href={backHref}
            className="-my-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-mf-glass-text-muted transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />

            Back to workout
          </Link>

          {holdNotice ? <div className="mt-8">{holdNotice}</div> : null}

          <div className="mt-3 sm:mt-8">
            {/* Keyed on the exercise ids so a replaced exercise
                remounts the player with the refreshed server data. */}
            <WorkoutPlayer
              key={exerciseIds.join(",")}
              sessionId={session.id}
              sessionName={session.name}
              startedAt={session.started_at}
              timeZone={timeZone}
              allowSubstitution={allowSubstitution}
              initialExercises={playerExercises}
              replacementOptions={replacementOptions}
              alternativeContext={{
                experience: parseExperience(fitness?.experience),
                familiarSlugs,
                hold: hold !== null,
              }}
            />
          </div>
        </div>
      </main>
    );
  }

  /* =========================================================
     ADAPTIVE RECOMMENDATIONS — only computed before the session
     starts, when "what should I aim for" is actually useful (once
     logging is underway the athlete is looking at real-time sets,
     not a pre-session target). Reuses the exact same deterministic
     engines the rest of Dante Core is built on
     (buildAthleteState/loadTrainingContext/buildAdaptiveProgram) —
     no second adaptive engine, no extra query when not needed.
  ========================================================= */

  const adaptationsByExerciseId = new Map<string, TraceableDecision<ProgramAdaptation>>();
  let recoveryScore: number | null = null;
  let recoveryStatusLabel: string | null = null;
  let recoveryStatusCode: RecoveryStatusInput = null;
  let trainingLoadState: TrainingLoadStateInput = null;
  const historyByExerciseId = new Map<string, AdaptationHistoryEntry[]>();

  if (session.session_state === "not_started" || session.session_state === null) {
    const [athleteState, trainingContext] = await Promise.all([
      buildAthleteState(supabase, user.id),
      loadTrainingContext(supabase, user.id),
    ]);

    recoveryScore = athleteState.recovery.score;
    recoveryStatusLabel = athleteState.recovery.status;
    recoveryStatusCode = athleteState.recovery.recoveryStatusCode;
    trainingLoadState = athleteState.recovery.trainingLoadState;

    const adaptations = buildAdaptiveProgram(athleteState, trainingContext);

    for (const decision of adaptations) {
      adaptationsByExerciseId.set(decision.decision.exerciseId, decision);
    }

    // Best-effort audit log — never blocks rendering (mirrors the
    // existing pattern in app/api/dante/daily-decision/route.ts).
    logProgramAdaptations(supabase, user.id, adaptations).catch((error: unknown) => {
      console.warn("[SESSION PAGE] Unable to log program adaptations:", error);
    });

    const exerciseIdsNeedingHistory = exercisesWithSets
      .map((exercise) => exercise.exercise_id)
      .filter((id): id is string => id !== null && adaptationsByExerciseId.has(id));

    const histories = await Promise.all(
      exerciseIdsNeedingHistory.map((exerciseId) => loadAdaptationHistory(supabase, user.id, exerciseId)),
    );

    exerciseIdsNeedingHistory.forEach((exerciseId, index) => {
      historyByExerciseId.set(exerciseId, histories[index]);
    });
  }

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

  return (
    <main className="min-h-screen bg-mf-bg px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />

          {session.workout_plan_id ? "Back to plan" : "Back to training"}
        </Link>

        <header className="relative mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-mf-surface p-6 sm:p-8">

          <div className="relative">
            <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-mf-training">
                    Workout session
                  </p>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${getStateClasses(
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

                <h1 className="mt-4 text-4xl font-black sm:text-5xl">
                  {session.name || session.title || "Training session"}
                </h1>

                <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-400">
                  {session.session_state === "completed"
                    ? "The sets, load and volume you logged in this session."
                    : "Track your working sets, repetitions, load, RIR and total training volume."}
                </p>

                {session.session_state === "completed" ? (
                  <Link
                    href={`/dashboard/training-intelligence?session=${session.id}`}
                    className="mt-4 inline-flex min-h-11 items-center rounded-md border border-mf-glass-border-strong px-4 text-sm font-bold text-mf-glass-text transition hover:bg-mf-glass-hover"
                  >
                    See muscles trained
                  </Link>
                ) : null}
              </div>

              {/* A planned session starts here, keeping its own (possibly adjusted) prescription — start_workout
                  begins this row rather than cloning the plan template. */}
              {(session.session_state === "not_started" || session.session_state === null) && session.workout_day_id ? (
                <WorkoutStartButton workoutDayId={session.workout_day_id} hold={hold} size="lg" />
              ) : null}
            </div>
          </div>
        </header>

        {holdNotice ? <div className="mt-6">{holdNotice}</div> : null}

        {!hold && scheduleConflict ? (
          <div className="mt-6">
            <ScheduleConflictNote />
          </div>
        ) : null}

        <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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
              (session.duration_minutes ?? 0) * 60,
            )}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <InfoCard
            label="Started"
            value={formatSessionDateTime(
              session.started_at,
              timeZone,
            )}
          />

          <InfoCard
            label="Completed"
            value={formatSessionDateTime(
              session.completed_at,
              timeZone,
            )}
          />
        </section>

        <section className="mt-10">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-mf-training">
                Exercise progress
              </p>

              <h2 className="mt-2 text-3xl font-black">
                Session exercises
              </h2>
            </div>

            <p className="text-sm text-zinc-400">
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
                    adaptation={
                      exercise.exercise_id
                        ? adaptationsByExerciseId.get(exercise.exercise_id) ?? null
                        : null
                    }
                    history={
                      exercise.exercise_id
                        ? historyByExerciseId.get(exercise.exercise_id) ?? []
                        : []
                    }
                    recoveryScore={recoveryScore}
                    recoveryStatusLabel={recoveryStatusLabel}
                    recoveryStatusCode={recoveryStatusCode}
                    trainingLoadState={trainingLoadState}
                    sessionDone={session.session_state === "completed"}
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
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-mf-training/25 bg-mf-training/10 text-mf-training">
        {icon}
      </div>

      <p className="mt-3 text-sm font-semibold text-zinc-400">
        {label}
      </p>

      <p className="mt-1 text-xl font-black tabular-nums">
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
      <p className="text-sm font-semibold text-zinc-400">
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
  adaptation: TraceableDecision<ProgramAdaptation> | null;
  history: AdaptationHistoryEntry[];
  recoveryScore: number | null;
  recoveryStatusLabel: string | null;
  recoveryStatusCode: RecoveryStatusInput;
  trainingLoadState: TrainingLoadStateInput;
  /** Finished session: an unlogged set was not done, not "pending". */
  sessionDone: boolean;
};

function SessionExerciseCard({
  exercise,
  adaptation,
  history,
  recoveryScore,
  recoveryStatusLabel,
  recoveryStatusCode,
  trainingLoadState,
  sessionDone,
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
          : "border-white/10 bg-mf-surface"
      }`}
    >
      <header className="border-b border-white/10 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-mf-training/25 bg-mf-training/10 font-black text-mf-training">
              {exercise.exercise_order}
            </span>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-black">
                  {exercise.display_name}
                </h3>

                {exercise.is_skipped ? (
                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-bold text-zinc-400">
                    Skipped
                  </span>
                ) : null}
              </div>

              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {exercise.target_sets} sets ·{" "}
                {exercise.target_rep_min}–
                {exercise.target_rep_max} reps ·{" "}
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

            <p className="mt-1 text-xs font-semibold text-zinc-400">
              Sets done
            </p>
          </div>
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {exercise.sets.length === 0 ? (
          adaptation ? (
            <AdaptiveRecommendationCard
              adaptation={adaptation.decision}
              confidence={adaptation.confidence}
              reasons={adaptation.why}
              recoveryScore={recoveryScore}
              recoveryStatusLabel={recoveryStatusLabel}
              history={history}
              recoveryStatusCode={recoveryStatusCode}
              trainingLoadState={trainingLoadState}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-700">
              No sets have been recorded.
            </p>
          )
        ) : (
          <div>
            {/* Mobile View: Stacked touch-friendly set cards */}
            <div className="flex flex-col gap-2.5 sm:hidden">
              {exercise.sets.map((set) => (
                <div
                  key={set.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-black">
                      #{set.set_number}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">
                        {set.weight_kg !== null ? `${set.weight_kg} kg` : "Bodyweight"}{" "}
                        <span className="text-zinc-500">×</span> {set.reps ?? "—"} reps
                      </p>
                      <p className="text-xs text-zinc-400">
                        {set.rir !== null ? `RIR ${set.rir}` : "Target effort"}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {set.completed ? (
                      <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="size-4" />
                        Done
                      </span>
                    ) : (
                      <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-400">
                        <Gauge className="size-4" />
                        {sessionDone ? "Not logged" : "Pending"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop / Tablet View: Structured Data Table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[620px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-semibold text-zinc-400">
                    <th className="px-4 py-2">Set</th>
                    <th className="px-4 py-2">Weight</th>
                    <th className="px-4 py-2">Reps</th>
                    <th className="px-4 py-2">RIR</th>
                    <th className="px-4 py-2">Status</th>
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
                            {sessionDone ? "Not logged" : "Pending"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}