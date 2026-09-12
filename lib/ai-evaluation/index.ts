import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluateSetVisionDemo } from "@/lib/ai-evaluation/setvision-demo";
import { evaluateHawkerLensDemo } from "@/lib/ai-evaluation/hawkerlens-demo";
import { evaluateDante } from "@/lib/ai-evaluation/dante-checks";
import { evaluateSystem } from "@/lib/ai-evaluation/system-health";
import type { AiEvaluationSnapshot } from "@/lib/ai-evaluation/types";

export async function buildAiEvaluationSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiEvaluationSnapshot> {
  const [system] = await Promise.all([evaluateSystem(supabase, userId)]);

  return {
    setvision: evaluateSetVisionDemo(),
    hawkerlens: evaluateHawkerLensDemo(),
    dante: evaluateDante(),
    system,
    generatedAt: new Date().toISOString(),
  };
}

export type {
  AiEvaluationSnapshot,
  Metric,
  MetricSource,
  SetVisionEvaluation,
  HawkerLensEvaluation,
  DanteEvaluation,
  SystemEvaluation,
} from "@/lib/ai-evaluation/types";
