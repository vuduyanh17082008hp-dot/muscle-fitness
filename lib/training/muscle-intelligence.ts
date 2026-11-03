import { addDaysIso } from "@/lib/nutrition/date-utils";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";
import type { CompletedSessionRecord, LoggedSetRecord } from "@/lib/training/load-training-context";
import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Muscle Intelligence 2.0 — what the athlete actually logged, per muscle.
 *
 * Counts only: completed, non-warm-up sets from finished sessions. "Direct" = the
 * exercise lists the muscle as primary; "indirect" = listed as secondary. Stabilizer
 * roles are not counted — they are not a defined training stimulus here. Nothing in
 * this file estimates growth, damage, fatigue or recovery.
 */

export const MUSCLE_RANGES = [
  { id: "7d", days: 7, label: "7 days" },
  { id: "28d", days: 28, label: "4 weeks" },
  { id: "84d", days: 84, label: "12 weeks" },
] as const;

export type MuscleRangeId = (typeof MUSCLE_RANGES)[number]["id"];

export type MuscleExerciseUse = {
  exerciseId: string;
  name: string;
  role: "direct" | "indirect";
  sets: number;
  lastDate: string;
};

export type MuscleTrainingSummary = {
  directSets: number;
  indirectSets: number;
  sessions: number;
  lastTrainedDate: string | null;
  exercises: MuscleExerciseUse[];
};

export type MuscleRangeSnapshot = {
  startDate: string;
  muscles: Partial<Record<CanonicalMuscle, MuscleTrainingSummary>>;
  workingSets: number;
  sessions: number;
  /** Working sets whose exercise maps to no known muscle — shown as unknown, never guessed. */
  unmappedSets: number;
  unmappedExercises: string[];
};

export type SessionMuscles = {
  id: string;
  name: string;
  localDate: string;
  workingSets: number;
  direct: CanonicalMuscle[];
  indirect: CanonicalMuscle[];
};

export type MuscleIntelligenceData = {
  today: string;
  ranges: Record<MuscleRangeId, MuscleRangeSnapshot>;
  recentSessions: SessionMuscles[];
};

export type LoadLevel = "none" | "indirect" | "low" | "moderate" | "high";

const isWorkingSet = (set: LoggedSetRecord) => set.completed && set.setType !== "warmup";

function rolesFor(contributions: ExerciseMuscleContribution[] | undefined) {
  const direct = new Set<CanonicalMuscle>();
  const indirect = new Set<CanonicalMuscle>();
  for (const c of contributions ?? []) {
    if (c.role === "primary") direct.add(c.muscle);
    else if (c.role === "secondary") indirect.add(c.muscle);
  }
  for (const muscle of direct) indirect.delete(muscle);
  return { direct, indirect };
}

export function buildMuscleIntelligence(input: {
  today: string;
  loggedSets: LoggedSetRecord[];
  completedSessions: CompletedSessionRecord[];
  contributionsByExercise: Map<string, ExerciseMuscleContribution[]>;
}): MuscleIntelligenceData {
  const working = input.loggedSets.filter(isWorkingSet);
  const roles = new Map<string, ReturnType<typeof rolesFor>>();
  const roleOf = (exerciseId: string) => {
    let entry = roles.get(exerciseId);
    if (!entry) {
      entry = rolesFor(input.contributionsByExercise.get(exerciseId));
      roles.set(exerciseId, entry);
    }
    return entry;
  };

  const ranges = {} as Record<MuscleRangeId, MuscleRangeSnapshot>;

  for (const range of MUSCLE_RANGES) {
    const startDate = addDaysIso(input.today, -(range.days - 1));
    const inRange = working.filter((set) => set.localDate >= startDate && set.localDate <= input.today);
    const muscles: Partial<Record<CanonicalMuscle, MuscleTrainingSummary>> = {};
    const sessionsByMuscle = new Map<CanonicalMuscle, Set<string>>();
    const exerciseUse = new Map<string, MuscleExerciseUse>();
    const unmapped = new Map<string, number>();

    for (const set of inRange) {
      const { direct, indirect } = roleOf(set.exerciseId);
      if (direct.size === 0 && indirect.size === 0) {
        unmapped.set(set.exerciseName, (unmapped.get(set.exerciseName) ?? 0) + 1);
        continue;
      }
      for (const [muscle, role] of [
        ...[...direct].map((m) => [m, "direct"] as const),
        ...[...indirect].map((m) => [m, "indirect"] as const),
      ]) {
        const summary = (muscles[muscle] ??= { directSets: 0, indirectSets: 0, sessions: 0, lastTrainedDate: null, exercises: [] });
        if (role === "direct") summary.directSets += 1;
        else summary.indirectSets += 1;
        if (!summary.lastTrainedDate || set.localDate > summary.lastTrainedDate) summary.lastTrainedDate = set.localDate;

        const sessions = sessionsByMuscle.get(muscle) ?? new Set<string>();
        sessions.add(set.sessionId);
        sessionsByMuscle.set(muscle, sessions);

        const key = `${muscle}|${set.exerciseId}`;
        const use = exerciseUse.get(key) ?? { exerciseId: set.exerciseId, name: set.exerciseName, role, sets: 0, lastDate: set.localDate };
        use.sets += 1;
        if (set.localDate > use.lastDate) {
          use.lastDate = set.localDate;
          use.name = set.exerciseName;
        }
        exerciseUse.set(key, use);
      }
    }

    for (const [key, use] of exerciseUse) {
      const muscle = key.split("|")[0] as CanonicalMuscle;
      muscles[muscle]!.exercises.push(use);
    }
    for (const [muscle, summary] of Object.entries(muscles) as Array<[CanonicalMuscle, MuscleTrainingSummary]>) {
      summary.sessions = sessionsByMuscle.get(muscle)?.size ?? 0;
      summary.exercises.sort(
        (a, b) => (a.role === b.role ? 0 : a.role === "direct" ? -1 : 1) || b.lastDate.localeCompare(a.lastDate) || b.sets - a.sets,
      );
    }

    ranges[range.id] = {
      startDate,
      muscles,
      workingSets: inRange.length,
      sessions: new Set(inRange.map((set) => set.sessionId)).size,
      unmappedSets: [...unmapped.values()].reduce((a, b) => a + b, 0),
      unmappedExercises: [...unmapped.keys()].sort(),
    };
  }

  const recentSessions: SessionMuscles[] = [...input.completedSessions]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 12)
    .map((session) => {
      const sets = working.filter((set) => set.sessionId === session.id);
      const direct = new Set<CanonicalMuscle>();
      const indirect = new Set<CanonicalMuscle>();
      for (const set of sets) {
        const r = roleOf(set.exerciseId);
        r.direct.forEach((m) => direct.add(m));
        r.indirect.forEach((m) => indirect.add(m));
      }
      direct.forEach((m) => indirect.delete(m));
      return {
        id: session.id,
        name: session.name?.trim() || "Workout",
        localDate: session.localDate,
        workingSets: sets.length,
        direct: [...direct],
        indirect: [...indirect],
      };
    });

  return { today: input.today, ranges, recentSessions };
}

/**
 * Ordinal load band relative to the athlete's own most-trained muscle in the same
 * range — a comparison between their muscles, not a physiological measure.
 */
export function loadLevel(summary: MuscleTrainingSummary | undefined, maxDirect: number): LoadLevel {
  if (!summary || (summary.directSets === 0 && summary.indirectSets === 0)) return "none";
  if (summary.directSets === 0) return "indirect";
  if (maxDirect <= 0) return "low";
  const ratio = summary.directSets / maxDirect;
  return ratio > 2 / 3 ? "high" : ratio > 1 / 3 ? "moderate" : "low";
}

export function maxDirectSets(snapshot: MuscleRangeSnapshot): number {
  return Math.max(0, ...Object.values(snapshot.muscles).map((summary) => summary?.directSets ?? 0));
}
