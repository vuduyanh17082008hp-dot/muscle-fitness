import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TraceableDecision } from "@/lib/dante-core/types";
import { getExposureType, getOutcomeType } from "@/lib/experiments/catalog";
import type { ExperimentRecord } from "@/lib/experiments/mutations";
import { loadExperimentObservations } from "@/lib/experiments/load-daily-series";
import { buildExperimentResult, type ExperimentAnalysis } from "@/lib/experiments/engine";
import { addDaysIso } from "@/lib/nutrition/date-utils";
import {
  localDateTimeParts,
  resolveUserTimeZone,
} from "@/lib/training/load-today-session";

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
  timeZoneOverride?: string | null,
): Promise<TraceableDecision<ExperimentAnalysis> | null> {
  const exposure = getExposureType(experiment.exposureType);
  const outcome = getOutcomeType(experiment.outcomeType);

  if (!exposure || !outcome) return null;

  const timeZone = await resolveUserTimeZone(supabase, userId, timeZoneOverride);
  const endDate = localDateTimeParts(now, timeZone).localDate;
  const observations = await loadExperimentObservations(supabase, userId, {
    exposureType: experiment.exposureType,
    outcomeType: experiment.outcomeType,
    startDate: addDaysIso(endDate, -experiment.windowDays),
    endDate,
    timeZone,
  });

  return buildExperimentResult(exposure, outcome, experiment.question, observations);
}
