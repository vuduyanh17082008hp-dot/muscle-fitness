import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";
import {
  computeMuscleVolume,
  type ExerciseSetLog,
  type MuscleVolumeBreakdown,
} from "@/lib/training/volume-engine";
import {
  WEEK_MS,
  currentWeekStart as computeCurrentWeekStart,
  startOfWeekMonday,
  toLocalDate,
  weekKey,
} from "@/lib/training/week-bucketing";

/**
 * A logged set with the session/date information needed to bucket it
 * into weeks. `completedAt` must be an ISO timestamp.
 */
export type DatedExerciseSetLog = ExerciseSetLog & {
  sessionId: string;
  completedAt: string;
};

export type WeeklyMuscleAnalytics = {
  muscle: CanonicalMuscle;
  currentWeek: MuscleVolumeBreakdown;
  previousWeek: MuscleVolumeBreakdown | null;
  /** null when there is no previous-week data to compare against. */
  changeAbsolute: number | null;
  /** null when the previous week's volume was 0 (percent change is undefined, not infinite). */
  changePercent: number | null;
  /** Distinct sessions this week that included at least one eligible set for this muscle. */
  frequency: number;
  rolling4WeekAverage: number | null;
  rolling8WeekAverage: number | null;
  lastTrainedDate: string | null;
};

export type WeeklyAnalyticsOptions = {
  /** Reference instant that defines "the current week". Defaults to now. */
  now?: Date;
  /** Minutes to add to UTC to get the user's local wall-clock time. Defaults to 0 (UTC). */
  timeZoneOffsetMinutes?: number;
};

type WeekBucket = {
  weekStart: Date;
  sets: DatedExerciseSetLog[];
};

function bucketByWeek(
  sets: DatedExerciseSetLog[],
  timeZoneOffsetMinutes: number,
): Map<string, WeekBucket> {
  const buckets = new Map<string, WeekBucket>();

  for (const set of sets) {
    const localDate = toLocalDate(set.completedAt, timeZoneOffsetMinutes);
    const weekStart = startOfWeekMonday(localDate);
    const key = weekKey(weekStart);

    const existing = buckets.get(key);

    if (existing) {
      existing.sets.push(set);
    } else {
      buckets.set(key, { weekStart, sets: [set] });
    }
  }

  return buckets;
}

function emptyBreakdown(muscle: CanonicalMuscle): MuscleVolumeBreakdown {
  return {
    muscle,
    directSets: 0,
    indirectRawSets: 0,
    indirectEffectiveSets: 0,
    totalEffectiveSets: 0,
    contributingExercises: [],
  };
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Computes per-muscle weekly training analytics: current vs previous
 * week, % change, meaningful training frequency, rolling averages and
 * last-trained date. Pure/deterministic — no database access.
 */
export function computeWeeklyMuscleAnalytics(
  sets: DatedExerciseSetLog[],
  contributionsByExercise: Map<string, ExerciseMuscleContribution[]>,
  options: WeeklyAnalyticsOptions = {},
): Map<CanonicalMuscle, WeeklyMuscleAnalytics> {
  const timeZoneOffsetMinutes = options.timeZoneOffsetMinutes ?? 0;
  const now = options.now ?? new Date();

  const currentWeekStart = computeCurrentWeekStart(now, timeZoneOffsetMinutes);
  const currentWeekKey = weekKey(currentWeekStart);

  const previousWeekStart = new Date(currentWeekStart.getTime() - WEEK_MS);
  const previousWeekKey = weekKey(previousWeekStart);

  const buckets = bucketByWeek(sets, timeZoneOffsetMinutes);

  const breakdownByWeek = new Map<
    string,
    Map<CanonicalMuscle, MuscleVolumeBreakdown>
  >();

  for (const [key, bucket] of buckets) {
    breakdownByWeek.set(
      key,
      computeMuscleVolume(bucket.sets, contributionsByExercise),
    );
  }

  const currentBreakdown = breakdownByWeek.get(currentWeekKey) ?? new Map();
  const previousBreakdown = breakdownByWeek.get(previousWeekKey) ?? null;

  const muscles = new Set<CanonicalMuscle>();

  for (const breakdown of breakdownByWeek.values()) {
    for (const muscle of breakdown.keys()) {
      muscles.add(muscle);
    }
  }

  // Rolling windows: the current week plus the 3 (or 7) preceding weeks
  // that actually exist in the data.
  const rollingWeekKeys = (weeks: number): string[] => {
    const keys: string[] = [];

    for (let i = 0; i < weeks; i += 1) {
      const start = new Date(currentWeekStart.getTime() - i * WEEK_MS);
      const key = weekKey(start);

      if (breakdownByWeek.has(key)) {
        keys.push(key);
      }
    }

    return keys;
  };

  const rolling4Keys = rollingWeekKeys(4);
  const rolling8Keys = rollingWeekKeys(8);

  function rollingAverage(
    muscle: CanonicalMuscle,
    keys: string[],
  ): number | null {
    if (keys.length === 0) {
      return null;
    }

    const total = keys.reduce((sum, key) => {
      const breakdown = breakdownByWeek.get(key);
      return sum + (breakdown?.get(muscle)?.totalEffectiveSets ?? 0);
    }, 0);

    return round(total / keys.length);
  }

  function lastTrainedDate(muscle: CanonicalMuscle): string | null {
    let latest: string | null = null;

    for (const set of sets) {
      if (!set.completed) {
        continue;
      }

      const contributions = contributionsByExercise.get(set.exerciseId);

      if (!contributions?.some((c) => c.muscle === muscle)) {
        continue;
      }

      const date = set.completedAt.slice(0, 10);

      if (!latest || date > latest) {
        latest = date;
      }
    }

    return latest;
  }

  function frequency(muscle: CanonicalMuscle): number {
    const currentBucket = buckets.get(currentWeekKey);

    if (!currentBucket) {
      return 0;
    }

    const sessionIds = new Set<string>();

    for (const set of currentBucket.sets) {
      if (!set.completed) {
        continue;
      }

      const contributions = contributionsByExercise.get(set.exerciseId);

      if (contributions?.some((c) => c.muscle === muscle)) {
        sessionIds.add(set.sessionId);
      }
    }

    return sessionIds.size;
  }

  const result = new Map<CanonicalMuscle, WeeklyMuscleAnalytics>();

  for (const muscle of muscles) {
    const current = currentBreakdown.get(muscle) ?? emptyBreakdown(muscle);
    const previous = previousBreakdown?.get(muscle) ?? null;

    const changeAbsolute =
      previousBreakdown !== null
        ? round(current.totalEffectiveSets - (previous?.totalEffectiveSets ?? 0))
        : null;

    const changePercent =
      previous && previous.totalEffectiveSets > 0
        ? round(
            ((current.totalEffectiveSets - previous.totalEffectiveSets) /
              previous.totalEffectiveSets) *
              100,
          )
        : null;

    result.set(muscle, {
      muscle,
      currentWeek: current,
      previousWeek: previous,
      changeAbsolute,
      changePercent,
      frequency: frequency(muscle),
      rolling4WeekAverage: rollingAverage(muscle, rolling4Keys),
      rolling8WeekAverage: rollingAverage(muscle, rolling8Keys),
      lastTrainedDate: lastTrainedDate(muscle),
    });
  }

  return result;
}
