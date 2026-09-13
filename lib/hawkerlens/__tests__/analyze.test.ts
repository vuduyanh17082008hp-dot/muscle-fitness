import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Orchestration tests for analyzeHawkerLensPhoto — the full IMAGE ->
 * DISH -> COMPONENTS -> PORTION -> NUTRITION -> UNCERTAINTY pipeline
 * (spec Part A §3), including the DEMO adapter path (spec Part
 * "2. HAWKERLENS SG": "build a clearly labelled demo adapter... rather
 * than pretending") that runs when no live vision model is configured.
 */

vi.mock("@/lib/hawkerlens/vision", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hawkerlens/vision")>(
    "@/lib/hawkerlens/vision",
  );
  return {
    ...actual,
    isHawkerLensConfigured: vi.fn(),
    analyzeHawkerPhoto: vi.fn(),
  };
});

import { analyzeHawkerLensPhoto } from "@/lib/hawkerlens/analyze";
import { analyzeHawkerPhoto, isHawkerLensConfigured } from "@/lib/hawkerlens/vision";

beforeEach(() => {
  vi.mocked(isHawkerLensConfigured).mockReset();
  vi.mocked(analyzeHawkerPhoto).mockReset();
});

describe("analyzeHawkerLensPhoto — demo adapter (spec: high-confidence demo)", () => {
  it("runs the real pipeline on a fixed example and labels the result as a demo when no vision model is configured", async () => {
    vi.mocked(isHawkerLensConfigured).mockReturnValue(false);

    const result = await analyzeHawkerLensPhoto("data:image/jpeg;base64,irrelevant");

    expect(analyzeHawkerPhoto).not.toHaveBeenCalled(); // never pretends to call a real model
    expect(result.status).toBe("ok");
    expect(result.isDemo).toBe(true);
    expect(result.dish).toBe("chicken_rice");
    expect(result.overallConfidence).toBeGreaterThan(0.5); // "high-confidence demo"
    expect(result.message).toMatch(/demo/i);
    // Still never a bare point estimate, even in demo mode.
    expect(result.nutrition?.calories.lower).toBeLessThan(result.nutrition!.calories.estimate);
    expect(result.nutrition?.calories.upper).toBeGreaterThan(result.nutrition!.calories.estimate);
  });
});

describe("analyzeHawkerLensPhoto — real vision path", () => {
  it("returns status ok with isDemo false for a normal high-quality, recognized-dish photo", async () => {
    vi.mocked(isHawkerLensConfigured).mockReturnValue(true);
    vi.mocked(analyzeHawkerPhoto).mockResolvedValue({
      imageQuality: { usable: true, issues: [], qualityScore: 1, notes: null },
      dishClassification: { dish: "laksa", confidence: 0.8, signals: [] },
      components: [
        { name: "Laksa noodles in coconut curry gravy", visualEstimateGrams: 350, modelConfidence: "high" },
        { name: "Prawns", visualEstimateGrams: 40, modelConfidence: "medium" },
      ],
    });

    const result = await analyzeHawkerLensPhoto("data:image/jpeg;base64,real");

    expect(result.status).toBe("ok");
    expect(result.isDemo).toBe(false);
    expect(result.dish).toBe("laksa");
    expect(result.componentDetail).toHaveLength(2);
  });

  it("uncertain food: reports unknown_dish, never fabricating a nutrition range, when no dish is recognized", async () => {
    vi.mocked(isHawkerLensConfigured).mockReturnValue(true);
    vi.mocked(analyzeHawkerPhoto).mockResolvedValue({
      imageQuality: { usable: true, issues: [], qualityScore: 0.9, notes: null },
      dishClassification: { dish: null, confidence: 0, signals: ["unrecognized"] },
      components: [],
    });

    const result = await analyzeHawkerLensPhoto("data:image/jpeg;base64,unknown");

    expect(result.status).toBe("unknown_dish");
    expect(result.isDemo).toBe(false);
    expect(result.nutrition).toBeNull();
  });

  it("uncertain food: reports low_quality_image and skips estimation entirely when the photo isn't usable", async () => {
    vi.mocked(isHawkerLensConfigured).mockReturnValue(true);
    vi.mocked(analyzeHawkerPhoto).mockResolvedValue({
      imageQuality: { usable: false, issues: ["poor_lighting", "obstructed"], qualityScore: 0.25, notes: "Too dark" },
      dishClassification: { dish: null, confidence: 0, signals: [] },
      components: [],
    });

    const result = await analyzeHawkerLensPhoto("data:image/jpeg;base64,dark");

    expect(result.status).toBe("low_quality_image");
    expect(result.nutrition).toBeNull();
    expect(result.message).toContain("Too dark");
  });

  it("returns a plain error status when the vision call itself fails, without touching the demo adapter", async () => {
    vi.mocked(isHawkerLensConfigured).mockReturnValue(true);
    vi.mocked(analyzeHawkerPhoto).mockResolvedValue(null);

    const result = await analyzeHawkerLensPhoto("data:image/jpeg;base64,fail");

    expect(result.status).toBe("error");
    expect(result.isDemo).toBe(false);
  });
});
