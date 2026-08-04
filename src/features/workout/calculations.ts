import type {
  LoggedSet,
  MuscleGroup,
  NextSessionRecommendation,
  SessionExercise,
  WorkoutSession,
} from "./types";
import type { Exercise } from "./types";

/** Epley estimated 1RM */
export function estimated1Rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function volumeLoad(sets: LoggedSet[]): number {
  return sets
    .filter((s) => s.completed && !s.skipped)
    .reduce((sum, s) => sum + s.weightKg * s.reps, 0);
}

export function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce((sum, ex) => sum + volumeLoad(ex.sets), 0);
}

export function bestSet(sets: LoggedSet[]): LoggedSet | null {
  const completed = sets.filter((s) => s.completed && !s.skipped);
  if (!completed.length) return null;
  return completed.reduce((best, set) => {
    const bestScore = estimated1Rm(best.weightKg, best.reps);
    const score = estimated1Rm(set.weightKg, set.reps);
    return score > bestScore ? set : best;
  });
}

export function weeklySetsPerMuscle(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  weeksBack = 1,
): Record<MuscleGroup, number> {
  const cutoff = Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000;
  const map = Object.create(null) as Record<MuscleGroup, number>;
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  for (const session of sessions) {
    if (session.status !== "completed" || !session.completedAt) continue;
    if (new Date(session.completedAt).getTime() < cutoff) continue;

    for (const se of session.exercises) {
      if (se.skipped) continue;
      const completedSets = se.sets.filter((s) => s.completed && !s.skipped)
        .length;
      if (!completedSets) continue;
      const ex = exerciseMap.get(se.exerciseId);
      if (!ex) continue;
      map[ex.primaryMuscle] = (map[ex.primaryMuscle] ?? 0) + completedSets;
      for (const secondary of ex.secondaryMuscles) {
        map[secondary] = (map[secondary] ?? 0) + completedSets * 0.5;
      }
    }
  }

  return map;
}

export function personalRecords(
  sessions: WorkoutSession[],
  exercises: Exercise[],
): Array<{
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  estimated1Rm: number;
  completedAt: string;
}> {
  const byExercise = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      weightKg: number;
      reps: number;
      estimated1Rm: number;
      completedAt: string;
    }
  >();
  const names = new Map(exercises.map((e) => [e.id, e.name]));

  for (const session of sessions) {
    if (session.status !== "completed") continue;
    for (const se of session.exercises) {
      const top = bestSet(se.sets);
      if (!top || !top.completedAt) continue;
      const e1 = estimated1Rm(top.weightKg, top.reps);
      const prev = byExercise.get(se.exerciseId);
      if (!prev || e1 > prev.estimated1Rm) {
        byExercise.set(se.exerciseId, {
          exerciseId: se.exerciseId,
          exerciseName: names.get(se.exerciseId) ?? se.exerciseId,
          weightKg: top.weightKg,
          reps: top.reps,
          estimated1Rm: e1,
          completedAt: top.completedAt,
        });
      }
    }
  }

  return [...byExercise.values()].sort(
    (a, b) => b.estimated1Rm - a.estimated1Rm,
  );
}

function averageRir(sets: LoggedSet[]): number | null {
  const values = sets
    .filter((s) => s.completed && !s.skipped && typeof s.rir === "number")
    .map((s) => s.rir as number);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function findPreviousExercise(
  sessions: WorkoutSession[],
  exerciseId: string,
  beforeSessionId: string,
): SessionExercise | null {
  const completed = sessions
    .filter(
      (s) =>
        s.status === "completed" &&
        s.id !== beforeSessionId &&
        s.exercises.some((e) => e.exerciseId === exerciseId && !e.skipped),
    )
    .sort(
      (a, b) =>
        new Date(b.completedAt ?? b.startedAt).getTime() -
        new Date(a.completedAt ?? a.startedAt).getTime(),
    );

  for (const session of completed) {
    const match = session.exercises.find(
      (e) => e.exerciseId === exerciseId && !e.skipped,
    );
    if (match) return match;
  }
  return null;
}

export function buildNextSessionRecommendation(
  session: WorkoutSession,
  allSessions: WorkoutSession[],
  exercises: Exercise[],
): NextSessionRecommendation {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const adjustments: NextSessionRecommendation["adjustments"] = [];
  let hardSets = 0;
  let easySets = 0;

  for (const se of session.exercises) {
    if (se.skipped) continue;
    const completed = se.sets.filter((s) => s.completed && !s.skipped);
    if (!completed.length) continue;

    const avgRir = averageRir(completed);
    const top = bestSet(completed);
    const prev = findPreviousExercise(allSessions, se.exerciseId, session.id);
    const name = names.get(se.exerciseId) ?? se.exerciseId;

    if (avgRir !== null && avgRir <= 0.5) hardSets += 1;
    if (avgRir !== null && avgRir >= 3) easySets += 1;

    if (avgRir !== null && avgRir <= 0) {
      adjustments.push({
        exerciseId: se.exerciseId,
        exerciseName: name,
        action: "hold",
        detail:
          "RIR ≈ 0 — hold load next time and prioritize technique / recovery.",
        suggestedWeightKg: top?.weightKg,
        suggestedRepMin: se.repMin,
        suggestedRepMax: se.repMax,
      });
      continue;
    }

    if (
      top &&
      completed.every((s) => s.reps >= se.repMax) &&
      (avgRir === null || avgRir >= 2)
    ) {
      const nextWeight = Math.round((top.weightKg + 2.5) * 10) / 10;
      adjustments.push({
        exerciseId: se.exerciseId,
        exerciseName: name,
        action: "increase_weight",
        detail: `Hit top of rep range with RIR ≥ 2. Add ~2.5 kg (→ ${nextWeight} kg).`,
        suggestedWeightKg: nextWeight,
        suggestedRepMin: se.repMin,
        suggestedRepMax: se.repMax,
      });
      continue;
    }

    if (
      top &&
      completed.every((s) => s.reps >= se.repMin) &&
      (avgRir === null || avgRir >= 2)
    ) {
      adjustments.push({
        exerciseId: se.exerciseId,
        exerciseName: name,
        action: "increase_reps",
        detail: "Solid sets inside range — push +1 rep before adding load.",
        suggestedWeightKg: top.weightKg,
        suggestedRepMin: Math.min(se.repMax, se.repMin + 1),
        suggestedRepMax: se.repMax,
      });
      continue;
    }

    if (prev) {
      const prevTop = bestSet(prev.sets);
      if (
        top &&
        prevTop &&
        estimated1Rm(top.weightKg, top.reps) <
          estimated1Rm(prevTop.weightKg, prevTop.reps) * 0.95
      ) {
        adjustments.push({
          exerciseId: se.exerciseId,
          exerciseName: name,
          action: "deload",
          detail:
            "Performance dropped >5% vs last time — consider a lighter day or longer rest.",
          suggestedWeightKg: Math.round(prevTop.weightKg * 0.9 * 10) / 10,
          suggestedRepMin: se.repMin,
          suggestedRepMax: se.repMax,
        });
        continue;
      }
    }

    adjustments.push({
      exerciseId: se.exerciseId,
      exerciseName: name,
      action: "hold",
      detail: "Keep the same load and chase cleaner reps / better RIR targets.",
      suggestedWeightKg: top?.weightKg,
      suggestedRepMin: se.repMin,
      suggestedRepMax: se.repMax,
    });
  }

  const deloadSuggested = hardSets >= 3 && easySets === 0;
  const summary = deloadSuggested
    ? "Several sets were taken very close to failure. A deload or reduced volume next session is recommended."
    : adjustments.some((a) => a.action === "increase_weight")
      ? "Progressive overload opportunities found — add load where you topped the rep range."
      : "Stay the course: refine execution and fill out the prescribed rep ranges.";

  return {
    sessionName: session.name,
    summary,
    adjustments,
    deloadSuggested,
  };
}

export function adherenceRate(sessions: WorkoutSession[]): number {
  if (!sessions.length) return 0;
  const completed = sessions.filter((s) => s.status === "completed").length;
  return Math.round((completed / sessions.length) * 100);
}
