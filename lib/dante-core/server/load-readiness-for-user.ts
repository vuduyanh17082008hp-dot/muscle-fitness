import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { loadTrainingContext, type TrainingContext } from "@/lib/training/load-training-context";
import { evaluateReadiness } from "@/lib/dante-core/readiness-engine";
import type { ReadinessResult } from "@/lib/dante-core/types";
import { CANONICAL_MUSCLES } from "@/lib/training/muscle-taxonomy";
import type { RecoveryContext } from "@/lib/recovery/load-recovery-context";

export type ReadinessForUser = {
  readiness: ReadinessResult;
  recoveryContext: RecoveryContext;
  trainingContext: TrainingContext;
};

/**
 * Shared by /api/dante/readiness and /api/dante/recommendation so both
 * routes load the same underlying data the same way — never two
 * slightly different readiness computations for the same user.
 */
export async function loadReadinessForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReadinessForUser> {
  const [recoveryContext, trainingContext] = await Promise.all([
    loadRecoveryContext(supabase, userId),
    loadTrainingContext(supabase, userId),
  ]);

  const muscles = CANONICAL_MUSCLES.map((muscle) => {
    const analytics = trainingContext.weeklyAnalytics.get(muscle);
    const baseline = trainingContext.baseline.get(muscle);

    return {
      muscle,
      lastTrainedDate: analytics?.lastTrainedDate ?? null,
      recentEffectiveSets: analytics?.currentWeek.totalEffectiveSets ?? null,
      typicalWeeklyVolume: baseline?.typicalWeeklyVolume ?? null,
    };
  });

  const readiness = evaluateReadiness({
    recoveryScore: recoveryContext.todayScoreResult,
    trainingLoad: recoveryContext.trainingLoad,
    muscles,
  });

  return { readiness, recoveryContext, trainingContext };
}
