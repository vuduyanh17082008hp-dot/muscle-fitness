import { describe, expect, it } from "vitest";
import { buildKnownFactsFromContext } from "@/lib/dante-core/verifier/known-facts-from-context";

describe("buildKnownFactsFromContext", () => {
  it("extracts recovery score, sleep hours, and readiness from a populated recovery summary", () => {
    const facts = buildKnownFactsFromContext({
      recovery: {
        today: { score: 72 },
        recent7DayAverages: { sleepHours: 7.5, readiness: 68 },
      },
      todayFoodLog: null,
    });

    expect(facts).toEqual(
      expect.arrayContaining([
        { label: "recovery score", value: 72 },
        { label: "sleep hours", value: 7.5 },
        { label: "readiness score", value: 68 },
      ]),
    );
  });

  it("extracts calories and protein consumed from a populated food log summary", () => {
    const facts = buildKnownFactsFromContext({
      recovery: null,
      todayFoodLog: {
        calories: { consumed: 1800, target: 2200, remaining: 400 },
        protein: { consumed: 120, target: 160, remaining: 40 },
      },
    });

    expect(facts).toEqual(
      expect.arrayContaining([
        { label: "calories", value: 1800 },
        { label: "protein", value: 120 },
      ]),
    );
  });

  it("never fabricates a fact for a missing dimension", () => {
    const facts = buildKnownFactsFromContext({
      recovery: { today: { score: null }, recent7DayAverages: {} },
      todayFoodLog: { hasTarget: false, note: "No nutrition plan target is available yet." },
    });

    expect(facts).toEqual([]);
  });

  it("handles non-record/garbage input without throwing", () => {
    expect(buildKnownFactsFromContext({ recovery: "unavailable", todayFoodLog: 42 })).toEqual([]);
    expect(buildKnownFactsFromContext({ recovery: null, todayFoodLog: undefined })).toEqual([]);
    expect(buildKnownFactsFromContext({ recovery: [1, 2, 3], todayFoodLog: null })).toEqual([]);
  });

  it("ignores non-finite numeric values (NaN/Infinity) rather than passing them through", () => {
    const facts = buildKnownFactsFromContext({
      recovery: { today: { score: Number.NaN }, recent7DayAverages: { sleepHours: Infinity } },
      todayFoodLog: null,
    });

    expect(facts).toEqual([]);
  });
});
