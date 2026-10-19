import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CANONICAL_MUSCLES,
  resolveCanonicalMuscle,
  type CanonicalMuscle,
} from "@/lib/training/muscle-taxonomy";
import {
  CURRENT_MAPPING_VERSION,
  deriveFallbackContributions,
  type ExerciseMuscleContribution,
  type MuscleContributionRole,
} from "@/lib/training/exercise-muscle-map";
import type { ExerciseSetLog, SetClassification } from "@/lib/training/volume-engine";
import {
  computeWeeklyMuscleAnalytics,
  type DatedExerciseSetLog,
  type WeeklyMuscleAnalytics,
} from "@/lib/training/weekly-analytics";
import { computePersonalBaseline, type PersonalBaseline } from "@/lib/training/baseline";
import type { PerformanceDataPoint } from "@/lib/training/performance";
import type { LoggedSetForProgression } from "@/lib/training/progression-engine";
import { addDaysIso } from "@/lib/nutrition/date-utils";
import {
  localDateRangeUtc,
  localDateTimeParts,
  resolveUserTimeZone,
} from "@/lib/training/load-today-session";

const DEFAULT_WINDOW_DAYS = 12 * 7; // 12 weeks, matches the widest personal-baseline window

export type ExerciseSummary = {
  id: string;
  slug: string;
  name: string;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
  ownerId: string | null;
};

export type LastSessionForExercise = {
  sessionExerciseId: string;
  displayName: string;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  targetRir: number | null;
  targetRpe: number | null;
  completedAt: string | null;
  sets: LoggedSetForProgression[];
};

export type TrainingContext = {
  dataWindow: {
    startDate: string;
    endDate: string;
    weeksOfHistory: number;
  };
  exercisesById: Map<string, ExerciseSummary>;
  contributionsByExercise: Map<string, ExerciseMuscleContribution[]>;
  weeklyAnalytics: Map<CanonicalMuscle, WeeklyMuscleAnalytics>;
  baseline: Map<CanonicalMuscle, PersonalBaseline>;
  currentWeekSets: ExerciseSetLog[];
  lastSessionByExercise: Map<string, LastSessionForExercise>;
  e1RmHistoryByExercise: Map<string, PerformanceDataPoint[]>;
  hasAnyLoggedData: boolean;
};

function isCanonicalMuscle(value: string): value is CanonicalMuscle {
  return (CANONICAL_MUSCLES as string[]).includes(value);
}

type WorkoutSessionRow = {
  id: string;
  completed_at: string | null;
  session_state: string | null;
};

type SessionExerciseRow = {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  display_name: string;
  target_sets: number;
  target_rep_min: number;
  target_rep_max: number;
  target_rir: number | null;
  target_rpe: number | null;
};

type ExerciseSetRow = {
  id: string;
  session_exercise_id: string;
  set_type: string | null;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean | null;
  completed_at: string | null;
  estimated_1rm_kg: number | null;
};

type ExerciseLibraryRow = {
  id: string;
  slug: string;
  name: string;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  owner_id: string | null;
};

type ContributionRow = {
  exercise_id: string;
  muscle: string;
  role: MuscleContributionRole;
  contribution: number;
  mapping_version: number;
  source: ExerciseMuscleContribution["source"];
};

function emptyContext(windowDays: number, endDate: string): TrainingContext {
  const startDate = addDaysIso(endDate, -windowDays);
  return {
    dataWindow: { startDate, endDate, weeksOfHistory: 0 },
    exercisesById: new Map(),
    contributionsByExercise: new Map(),
    weeklyAnalytics: new Map(),
    baseline: new Map(),
    currentWeekSets: [],
    lastSessionByExercise: new Map(),
    e1RmHistoryByExercise: new Map(),
    hasAnyLoggedData: false,
  };
}

export async function loadTrainingContext(
  supabase: SupabaseClient,
  userId: string,
  options: {
    windowDays?: number;
    now?: Date;
    timeZoneOffsetMinutes?: number;
    timeZone?: string | null;
  } = {},
): Promise<TrainingContext> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const timeZoneOffsetMinutes = options.timeZoneOffsetMinutes ?? 0;
  const timeZone =
    options.timeZone ??
    (options.timeZoneOffsetMinutes === undefined
      ? await resolveUserTimeZone(supabase, userId)
      : undefined);
  const endDate = timeZone
    ? localDateTimeParts(now, timeZone).localDate
    : new Date(now.getTime() + timeZoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
  const startDate = addDaysIso(endDate, -windowDays);
  const windowStartIso = timeZone
    ? localDateRangeUtc(startDate, timeZone).startIso
    : new Date(
        Date.parse(`${startDate}T00:00:00.000Z`) -
          timeZoneOffsetMinutes * 60_000,
      ).toISOString();

  const { data: sessionRows, error: sessionsError } = await supabase
    .from("workout_sessions")
    .select("id, completed_at, session_state")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .gte("completed_at", windowStartIso)
    .order("completed_at", { ascending: true });

  if (sessionsError) {
    console.warn("[TRAINING INTELLIGENCE] Unable to load workout_sessions:", sessionsError.message);
  }

  const sessions = (sessionRows as WorkoutSessionRow[] | null) ?? [];

  if (sessions.length === 0) {
    return emptyContext(windowDays, endDate);
  }

  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const sessionIds = sessions.map((session) => session.id);

  const { data: sessionExerciseRows, error: sessionExerciseError } = await supabase
    .from("workout_session_exercises")
    .select(
      "id, workout_session_id, exercise_id, display_name, target_sets, target_rep_min, target_rep_max, target_rir, target_rpe",
    )
    .in("workout_session_id", sessionIds);

  if (sessionExerciseError) {
    console.warn(
      "[TRAINING INTELLIGENCE] Unable to load workout_session_exercises:",
      sessionExerciseError.message,
    );
  }

  const sessionExercises = (sessionExerciseRows as SessionExerciseRow[] | null) ?? [];

  if (sessionExercises.length === 0) {
    return emptyContext(windowDays, endDate);
  }

  const sessionExerciseById = new Map(
    sessionExercises.map((row) => [row.id, row]),
  );
  const sessionExerciseIds = sessionExercises.map((row) => row.id);
  const exerciseIds = Array.from(new Set(sessionExercises.map((row) => row.exercise_id)));

  const [{ data: setRows, error: setsError }, { data: exerciseRows, error: exercisesError }, { data: contributionRows, error: contributionsError }] =
    await Promise.all([
      supabase
        .from("exercise_sets")
        .select(
          "id, session_exercise_id, set_type, weight_kg, reps, rir, completed, completed_at, estimated_1rm_kg",
        )
        .in("session_exercise_id", sessionExerciseIds),

      supabase
        .from("exercise_library")
        .select("id, slug, name, primary_muscle, secondary_muscles, owner_id")
        .in("id", exerciseIds),

      supabase
        .from("exercise_muscle_contributions")
        .select("exercise_id, muscle, role, contribution, mapping_version, source")
        .in("exercise_id", exerciseIds)
        .eq("mapping_version", CURRENT_MAPPING_VERSION),
    ]);

  if (setsError) {
    console.warn("[TRAINING INTELLIGENCE] Unable to load exercise_sets:", setsError.message);
  }

  if (exercisesError) {
    console.warn("[TRAINING INTELLIGENCE] Unable to load exercise_library:", exercisesError.message);
  }

  if (contributionsError) {
    console.warn(
      "[TRAINING INTELLIGENCE] Unable to load exercise_muscle_contributions:",
      contributionsError.message,
    );
  }

  const sets = (setRows as ExerciseSetRow[] | null) ?? [];
  const exercises = (exerciseRows as ExerciseLibraryRow[] | null) ?? [];
  const contributions = (contributionRows as ContributionRow[] | null) ?? [];

  const exercisesById = new Map<string, ExerciseSummary>();

  for (const exercise of exercises) {
    exercisesById.set(exercise.id, {
      id: exercise.id,
      slug: exercise.slug,
      name: exercise.name,
      primaryMuscle: exercise.primary_muscle,
      secondaryMuscles: exercise.secondary_muscles ?? [],
      ownerId: exercise.owner_id,
    });
  }

  const explicitContributionsByExercise = new Map<string, ExerciseMuscleContribution[]>();

  for (const row of contributions) {
    if (!isCanonicalMuscle(row.muscle)) {
      continue;
    }

    const entry: ExerciseMuscleContribution = {
      muscle: row.muscle,
      role: row.role,
      contribution: row.contribution,
      mappingVersion: row.mapping_version,
      source: row.source,
    };

    const existing = explicitContributionsByExercise.get(row.exercise_id);

    if (existing) {
      existing.push(entry);
    } else {
      explicitContributionsByExercise.set(row.exercise_id, [entry]);
    }
  }

  const contributionsByExercise = new Map<string, ExerciseMuscleContribution[]>();

  for (const exerciseId of exerciseIds) {
    const explicit = explicitContributionsByExercise.get(exerciseId);

    if (explicit && explicit.length > 0) {
      contributionsByExercise.set(exerciseId, explicit);
      continue;
    }

    const exercise = exercisesById.get(exerciseId);

    contributionsByExercise.set(
      exerciseId,
      deriveFallbackContributions(exercise?.primaryMuscle ?? null, exercise?.secondaryMuscles ?? []),
    );
  }

  // ---- Dated sets for weekly analytics / baseline ----

  const datedSets: DatedExerciseSetLog[] = [];

  for (const set of sets) {
    const sessionExercise = sessionExerciseById.get(set.session_exercise_id);

    if (!sessionExercise) {
      continue;
    }

    const session = sessionById.get(sessionExercise.workout_session_id);
    const completedAt = set.completed_at ?? session?.completed_at ?? null;

    if (!completedAt) {
      continue;
    }

    const setType: SetClassification =
      set.set_type === "warmup" ||
      set.set_type === "working" ||
      set.set_type === "backoff" ||
      set.set_type === "drop" ||
      set.set_type === "failure"
        ? set.set_type
        : "working";

    datedSets.push({
      exerciseId: sessionExercise.exercise_id,
      setType,
      completed: set.completed === true,
      sessionId: sessionExercise.workout_session_id,
      completedAt,
    });
  }

  const weeklyAnalytics = computeWeeklyMuscleAnalytics(datedSets, contributionsByExercise, {
    now,
    timeZoneOffsetMinutes,
    timeZone,
  });

  const baseline = computePersonalBaseline(datedSets, contributionsByExercise, {
    now,
    timeZoneOffsetMinutes,
    timeZone,
  });

  const currentWeekSets: ExerciseSetLog[] = datedSets.map((set) => ({
    exerciseId: set.exerciseId,
    setType: set.setType,
    completed: set.completed,
  }));

  // ---- Last session per exercise, for the progression engine ----

  const lastSessionExerciseIdByExercise = new Map<string, string>();
  const lastSessionCompletedAtByExercise = new Map<string, string>();

  for (const sessionExercise of sessionExercises) {
    const session = sessionById.get(sessionExercise.workout_session_id);
    const completedAt = session?.completed_at;

    if (!completedAt) {
      continue;
    }

    const currentBest = lastSessionCompletedAtByExercise.get(sessionExercise.exercise_id);

    if (!currentBest || completedAt > currentBest) {
      lastSessionCompletedAtByExercise.set(sessionExercise.exercise_id, completedAt);
      lastSessionExerciseIdByExercise.set(sessionExercise.exercise_id, sessionExercise.id);
    }
  }

  const lastSessionByExercise = new Map<string, LastSessionForExercise>();

  for (const [exerciseId, sessionExerciseId] of lastSessionExerciseIdByExercise) {
    const sessionExercise = sessionExerciseById.get(sessionExerciseId);

    if (!sessionExercise) {
      continue;
    }

    const exerciseSets = sets
      .filter(
        (set) => set.session_exercise_id === sessionExerciseId && set.set_type !== "warmup",
      )
      .map((set) => ({
        weightKg: set.weight_kg,
        reps: set.reps,
        rir: set.rir,
        completed: set.completed === true,
      }));

    lastSessionByExercise.set(exerciseId, {
      sessionExerciseId,
      displayName: sessionExercise.display_name,
      targetSets: sessionExercise.target_sets,
      targetRepMin: sessionExercise.target_rep_min,
      targetRepMax: sessionExercise.target_rep_max,
      targetRir: sessionExercise.target_rir,
      targetRpe: sessionExercise.target_rpe,
      completedAt: lastSessionCompletedAtByExercise.get(exerciseId) ?? null,
      sets: exerciseSets,
    });
  }

  // ---- e1RM history per exercise (uses the DB's Epley-based generated column) ----

  const e1RmHistoryByExercise = new Map<string, PerformanceDataPoint[]>();

  for (const set of sets) {
    if (set.completed !== true || set.estimated_1rm_kg === null) {
      continue;
    }

    const sessionExercise = sessionExerciseById.get(set.session_exercise_id);

    if (!sessionExercise) {
      continue;
    }

    const session = sessionById.get(sessionExercise.workout_session_id);
    const completedAt = set.completed_at ?? session?.completed_at ?? "";
    const date = completedAt
      ? timeZone
        ? localDateTimeParts(new Date(completedAt), timeZone).localDate
        : new Date(
            new Date(completedAt).getTime() + timeZoneOffsetMinutes * 60_000,
          ).toISOString().slice(0, 10)
      : "";

    if (!date) {
      continue;
    }

    const point: PerformanceDataPoint = { date, estimated1RmKg: set.estimated_1rm_kg };
    const existing = e1RmHistoryByExercise.get(sessionExercise.exercise_id);

    if (existing) {
      existing.push(point);
    } else {
      e1RmHistoryByExercise.set(sessionExercise.exercise_id, [point]);
    }
  }

  const distinctWeekKeys = new Set(
    datedSets.map((set) =>
      timeZone
        ? localDateTimeParts(new Date(set.completedAt), timeZone).localDate
        : new Date(
            new Date(set.completedAt).getTime() + timeZoneOffsetMinutes * 60_000,
          ).toISOString().slice(0, 10),
    ),
  );

  return {
    dataWindow: {
      startDate,
      endDate,
      weeksOfHistory: Math.max(1, Math.ceil(distinctWeekKeys.size / 7)),
    },
    exercisesById,
    contributionsByExercise,
    weeklyAnalytics,
    baseline,
    currentWeekSets,
    lastSessionByExercise,
    e1RmHistoryByExercise,
    hasAnyLoggedData: datedSets.length > 0,
  };
}

export { resolveCanonicalMuscle };
