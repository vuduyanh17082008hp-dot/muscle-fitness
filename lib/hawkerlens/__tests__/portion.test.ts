import { describe, expect, it } from "vitest";
import { estimateComponentPortion } from "@/lib/hawkerlens/portion";
import type { DishComponentTemplate } from "@/lib/hawkerlens/dishes";
import type { DetectedComponent } from "@/lib/hawkerlens/types";

const RICE_TEMPLATE: DishComponentTemplate = {
  name: "Hainanese-style oily rice",
  typicalGrams: 220,
  per100g: { calories: 200, protein: 4.2, carbs: 33, fat: 5.5 },
  usuallyPresent: true,
};

function detected(overrides: Partial<DetectedComponent> = {}): DetectedComponent {
  return {
    name: "rice",
    visualEstimateGrams: 200,
    modelConfidence: "high",
    ...overrides,
  };
}

describe("estimateComponentPortion", () => {
  it("never returns a bare point estimate — always a lower/upper range", () => {
    const result = estimateComponentPortion(detected(), RICE_TEMPLATE);
    expect(result.gramsLower).toBeLessThan(result.estimatedGrams);
    expect(result.gramsUpper).toBeGreaterThan(result.estimatedGrams);
  });

  it("trusts the visual estimate more when model confidence is high", () => {
    const result = estimateComponentPortion(detected({ modelConfidence: "high" }), RICE_TEMPLATE);
    // 200 visual vs 220 typical, high confidence should land close to 200.
    expect(result.estimatedGrams).toBeLessThan(210);
  });

  it("leans toward the dish's typical portion when model confidence is low", () => {
    const result = estimateComponentPortion(
      detected({ visualEstimateGrams: 50, modelConfidence: "low" }),
      RICE_TEMPLATE,
    );
    // 50 visual vs 220 typical, low confidence should pull well above 50.
    expect(result.estimatedGrams).toBeGreaterThan(100);
  });

  it("widens the uncertainty range as confidence drops", () => {
    const high = estimateComponentPortion(detected({ modelConfidence: "high" }), RICE_TEMPLATE);
    const low = estimateComponentPortion(detected({ modelConfidence: "low" }), RICE_TEMPLATE);

    const highWidth = high.gramsUpper - high.gramsLower;
    const lowWidth = low.gramsUpper - low.gramsLower;

    expect(lowWidth).toBeGreaterThan(highWidth);
  });

  it("falls back to the visual estimate as the anchor when no template exists", () => {
    const result = estimateComponentPortion(detected({ visualEstimateGrams: 75 }), null);
    expect(result.estimatedGrams).toBe(75);
  });

  it("never returns a negative lower bound", () => {
    const result = estimateComponentPortion(
      detected({ visualEstimateGrams: 5, modelConfidence: "low" }),
      null,
    );
    expect(result.gramsLower).toBeGreaterThanOrEqual(0);
  });
});
