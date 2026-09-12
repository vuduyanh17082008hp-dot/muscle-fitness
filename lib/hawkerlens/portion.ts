import type { DishComponentTemplate } from "@/lib/hawkerlens/dishes";
import type { ComponentPortion, DetectedComponent } from "@/lib/hawkerlens/types";

/**
 * Portion estimation (spec Part A §7).
 *
 * MVP approach chosen and why: a single uncalibrated photo has no
 * reliable absolute scale (no plate-diameter reference, no depth
 * data, no user calibration step in this pass — see
 * docs/hawkerlens.md "Portion estimation" for what a v2 could add).
 * Rather than presenting the model's raw gram guess as precise, this
 * blends it with the dish template's "typical portion" for that
 * component (dishes.ts) — a food-atlas-comparison-style approach —
 * and widens the uncertainty range as model confidence drops. This
 * NEVER implies gram-level certainty from a single photo (spec's
 * explicit requirement): even a "high confidence" component still
 * gets a ±15% range, not a bare number.
 */

const CONFIDENCE_WEIGHT: Record<DetectedComponent["modelConfidence"], number> = {
  high: 0.85,
  medium: 0.6,
  low: 0.35,
};

const VISUAL_BLEND_WEIGHT: Record<DetectedComponent["modelConfidence"], number> = {
  high: 0.85, // trust the model's visual read mostly
  medium: 0.6,
  low: 0.35, // lean more on the dish's typical portion
};

const RANGE_WIDTH: Record<DetectedComponent["modelConfidence"], number> = {
  high: 0.15,
  medium: 0.3,
  low: 0.45,
};

function round(value: number): number {
  return Math.round(value);
}

export function estimateComponentPortion(
  detected: DetectedComponent,
  template: DishComponentTemplate | null,
): ComponentPortion {
  const typicalGrams = template?.typicalGrams ?? detected.visualEstimateGrams;
  const blendWeight = VISUAL_BLEND_WEIGHT[detected.modelConfidence];

  const estimatedGrams = round(
    detected.visualEstimateGrams * blendWeight + typicalGrams * (1 - blendWeight),
  );

  const width = RANGE_WIDTH[detected.modelConfidence];

  return {
    name: detected.name,
    estimatedGrams,
    gramsLower: Math.max(0, round(estimatedGrams * (1 - width))),
    gramsUpper: round(estimatedGrams * (1 + width)),
    portionConfidence: CONFIDENCE_WEIGHT[detected.modelConfidence],
  };
}

