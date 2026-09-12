import "server-only";

import { getDishTemplate } from "@/lib/hawkerlens/dishes";
import { lookupComponentNutrition } from "@/lib/hawkerlens/nutrition-lookup";
import { estimateComponentPortion } from "@/lib/hawkerlens/portion";
import { matchComponentTemplate } from "@/lib/hawkerlens/component-matching";
import { aggregateNutrition, computeUncertainty } from "@/lib/hawkerlens/uncertainty";
import { analyzeHawkerPhoto, isHawkerLensConfigured } from "@/lib/hawkerlens/vision";
import type { ComponentNutrition, HawkerLensResult } from "@/lib/hawkerlens/types";

/**
 * HawkerLens pipeline orchestrator (spec Part A §3):
 *
 *   PHOTO -> IMAGE QUALITY CHECK -> DISH CLASSIFICATION ->
 *   COMPONENT SEGMENTATION -> PORTION ESTIMATION ->
 *   NUTRITION LOOKUP -> UNCERTAINTY ESTIMATION -> (caller: USER CONFIRMATION -> SAVE)
 *
 * Each stage is its own module (vision.ts, portion.ts,
 * nutrition-lookup.ts, uncertainty.ts) — this function only sequences
 * them and decides the early-exit status codes. It never itself
 * computes a nutrition number.
 */

function emptyResult(status: HawkerLensResult["status"], message: string): HawkerLensResult {
  return {
    status,
    dish: null,
    dishClassification: { dish: null, confidence: 0, signals: [] },
    imageQuality: { usable: false, issues: [], qualityScore: 0, notes: null },
    components: [],
    componentDetail: [],
    nutrition: null,
    uncertainty: { modelConfidence: 0, portionConfidence: 0, nutritionConfidence: 0 },
    overallConfidence: 0,
    message,
  };
}

export async function analyzeHawkerLensPhoto(imageDataUrl: string): Promise<HawkerLensResult> {
  if (!isHawkerLensConfigured()) {
    return emptyResult(
      "unconfigured",
      "HawkerLens is not configured on this deployment (missing GROQ_VISION_MODEL).",
    );
  }

  const vision = await analyzeHawkerPhoto(imageDataUrl);

  if (!vision) {
    return emptyResult("error", "Photo analysis is temporarily unavailable. Please try again.");
  }

  if (!vision.imageQuality.usable) {
    return {
      ...emptyResult(
        "low_quality_image",
        "This photo isn't usable for estimation — " +
          (vision.imageQuality.notes ??
            `issues: ${vision.imageQuality.issues.join(", ") || "unspecified"}.`) +
          " Please try another photo, or add this meal manually.",
      ),
      imageQuality: vision.imageQuality,
      dishClassification: vision.dishClassification,
    };
  }

  if (!vision.dishClassification.dish || vision.components.length === 0) {
    return {
      ...emptyResult(
        "unknown_dish",
        "This doesn't look like one of the dishes HawkerLens currently supports. Try the general photo estimate or search/manual entry instead.",
      ),
      imageQuality: vision.imageQuality,
      dishClassification: vision.dishClassification,
    };
  }

  const dish = vision.dishClassification.dish;
  const template = getDishTemplate(dish);

  const componentDetail: ComponentNutrition[] = await Promise.all(
    vision.components.map(async (detected) => {
      const templateMatch = matchComponentTemplate(detected.name, template.components);
      const portion = estimateComponentPortion(detected, templateMatch);
      return lookupComponentNutrition(detected, portion, template);
    }),
  );

  const nutrition = aggregateNutrition(componentDetail);
  const uncertainty = computeUncertainty(vision.dishClassification, componentDetail);

  return {
    status: "ok",
    dish,
    dishClassification: vision.dishClassification,
    imageQuality: vision.imageQuality,
    components: componentDetail.map((c) => ({
      name: c.name,
      estimatedGrams: c.estimatedGrams,
      confidence: c.confidence,
    })),
    componentDetail,
    nutrition,
    uncertainty,
    overallConfidence: uncertainty.overallConfidence,
    message: null,
  };
}
