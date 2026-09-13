import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TraceableDecision } from "@/lib/dante-core/types";
import { getExposureType, getOutcomeType } from "@/lib/experiments/catalog";
import type { ExperimentRecord } from "@/lib/experiments/mutations";
import { loadExperimentObservations } from "@/lib/experiments/load-daily-series";
import { buildExperimentResult, type ExperimentAnalysis } from "@/lib/experiments/engine";

function daysAgoIso(days: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Loads real observations for one stored experiment and runs the
 * deterministic analysis (spec Part "5.": QUESTION -> DEFINE EXPOSURE
 * -> DEFINE OUTCOME -> COLLECT OBSERVATIONS -> COMPARE -> INTERPRET).
 * Returns null only when the exposure/outcome type is unrecognized
 * (should never happen for a row written through mutations.ts's own
 * validation) — never a fabricated result.
 */
export async function buildExperimentResultFor(
  supabase: SupabaseClient,
  userId: string,
  experiment: ExperimentRecord,
  now: Date = new Date(),
): Promise<TraceableDecision<ExperimentAnalysis> | null> {
  const exposure = getExposureType(experiment.exposureType);
  const outcome = getOutcomeType(experiment.outcomeType);

  if (!exposure || !outcome) return null;

  const observations = await loadExperimentObservations(supabase, userId, {
    exposureType: experiment.exposureType,
    outcomeType: experiment.outcomeType,
    startDate: daysAgoIso(experiment.windowDays, now),
    endDate: now.toISOString().slice(0, 10),
  });

  return buildExperimentResult(exposure, outcome, experiment.question, observations);
}
