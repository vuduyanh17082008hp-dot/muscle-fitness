import "server-only";

import type { AnyDanteTool, DanteTool } from "@/lib/dante-core/tools/types";

import { getTodayPlanTool } from "@/lib/dante-core/tools/read/get-today-plan";
import { getCurrentWorkoutTool } from "@/lib/dante-core/tools/read/get-current-workout";
import { getTrainingStateTool } from "@/lib/dante-core/tools/read/get-training-state";
import { getAdaptiveRecommendationTool } from "@/lib/dante-core/tools/read/get-adaptive-recommendation";
import { getRecoveryStateTool } from "@/lib/dante-core/tools/read/get-recovery-state";
import { getNutritionStateTool } from "@/lib/dante-core/tools/read/get-nutrition-state";
import { getProgressSummaryTool } from "@/lib/dante-core/tools/read/get-progress-summary";
import { searchFoodTool } from "@/lib/dante-core/tools/read/search-food";
import { getExerciseGuidanceTool } from "@/lib/dante-core/tools/read/get-exercise-guidance";
import { retrieveKnowledgeTool } from "@/lib/dante-core/tools/read/retrieve-knowledge";

import { logFoodTool } from "@/lib/dante-core/tools/write/log-food";
import { logMealDraftTool } from "@/lib/dante-core/tools/write/log-meal-draft";
import { updateFoodLogTool } from "@/lib/dante-core/tools/write/update-food-log";
import { deleteFoodLogTool } from "@/lib/dante-core/tools/write/delete-food-log";
import { completeCheckinTool } from "@/lib/dante-core/tools/write/complete-checkin";
import { scheduleWorkoutTool } from "@/lib/dante-core/tools/write/schedule-workout";
import { acceptAdaptiveAdjustmentTool } from "@/lib/dante-core/tools/write/accept-adaptive-adjustment";
import { acceptNof1ExperimentTool } from "@/lib/dante-core/tools/write/accept-nof1-experiment";

/**
 * ONE server-only typed tool registry (Part 2). Every capability
 * Dante's orchestrator (lib/dante-core/tools/orchestrate.ts) can ever
 * select is listed here, by name, with its own validated schema and
 * confirmation policy — there is no other route into a domain
 * mutation from a model tool-call (Part 17, Part 21: new tools like
 * analyze_food_photo register here later without touching the loop).
 */
export const DANTE_TOOLS: AnyDanteTool[] = [
  getTodayPlanTool,
  getCurrentWorkoutTool,
  getTrainingStateTool,
  getAdaptiveRecommendationTool,
  getRecoveryStateTool,
  getNutritionStateTool,
  getProgressSummaryTool,
  searchFoodTool,
  getExerciseGuidanceTool,
  retrieveKnowledgeTool,

  logFoodTool,
  updateFoodLogTool,
  deleteFoodLogTool,
  completeCheckinTool,
  scheduleWorkoutTool,
  acceptAdaptiveAdjustmentTool,
  acceptNof1ExperimentTool,
] as AnyDanteTool[];

/**
 * Write tools owned by a specialist coach (Nutrition Coach). They are NOT in
 * DANTE_TOOLS, so Dante's model can never select them (orchestrate.ts also
 * checks membership), but they stay resolvable by name so the shared
 * pending-action confirmation path can execute them once a user confirms.
 */
export const SPECIALIST_COACH_TOOLS: AnyDanteTool[] = [logMealDraftTool] as AnyDanteTool[];

const TOOLS_BY_NAME = new Map<string, AnyDanteTool>([...DANTE_TOOLS, ...SPECIALIST_COACH_TOOLS].map((tool) => [tool.name, tool]));

/** Returns undefined for any name not in the registry — callers MUST reject unknown tools (Part 10/L) rather than guessing. */
export function getDanteTool(name: string): AnyDanteTool | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function listDanteToolNames(): string[] {
  return DANTE_TOOLS.map((tool) => tool.name);
}

export type { DanteTool };
