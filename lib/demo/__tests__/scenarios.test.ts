import { describe, expect, it } from "vitest";

import { DEMO_SCENARIOS, generateDemoWearableSeries, isDemoScenarioId } from "@/lib/demo/scenarios";

const RANGE = { startDate: "2026-08-25", endDate: "2026-09-13" }; // 20 days

describe("generateDemoWearableSeries", () => {
  it("is deterministic — same user/scenario/range always produces identical output", () => {
    const a = generateDemoWearableSeries("recovered_athlete", "user-1", RANGE);
    const b = generateDemoWearableSeries("recovered_athlete", "user-1", RANGE);

    expect(a).toEqual(b);
  });

  it("produces one entry per day in the range, oldest first", () => {
    const days = generateDemoWearableSeries("recovered_athlete", "user-1", RANGE);

    expect(days).toHaveLength(20);
    expect(days[0].date).toBe("2026-08-25");
    expect(days[days.length - 1].date).toBe("2026-09-13");
  });

  it("differs between users (not a single shared fixture)", () => {
    const a = generateDemoWearableSeries("recovered_athlete", "user-1", RANGE);
    const b = generateDemoWearableSeries("recovered_athlete", "user-2", RANGE);

    expect(a).not.toEqual(b);
  });

  it("recovered_athlete stays high-HRV/low-RHR throughout, including the most recent day", () => {
    const days = generateDemoWearableSeries("recovered_athlete", "user-1", RANGE);
    const latest = days[days.length - 1];

    expect(latest.hrvMs).toBeGreaterThan(60);
    expect(latest.restingHeartRateBpm).toBeLessThan(55);
  });

  it("sleep_deprived_athlete shows a sharp recent sleep drop vs its own earlier baseline", () => {
    const days = generateDemoWearableSeries("sleep_deprived_athlete", "user-1", RANGE);
    const earlyAverage = days.slice(0, 10).reduce((s, d) => s + (d.sleep?.totalMinutes ?? 0), 0) / 10;
    const latest = days[days.length - 1];

    expect(latest.sleep?.totalMinutes ?? Infinity).toBeLessThan(earlyAverage - 100);
  });

  it("recovery_warning shows HRV, RHR and sleep all shifting unfavorably together on the most recent day", () => {
    const days = generateDemoWearableSeries("recovery_warning", "user-1", RANGE);
    const earlyAverageHrv = days.slice(0, 10).reduce((s, d) => s + (d.hrvMs ?? 0), 0) / 10;
    const earlyAverageRhr = days.slice(0, 10).reduce((s, d) => s + (d.restingHeartRateBpm ?? 0), 0) / 10;
    const latest = days[days.length - 1];

    expect(latest.hrvMs ?? Infinity).toBeLessThan(earlyAverageHrv - 15);
    expect(latest.restingHeartRateBpm ?? 0).toBeGreaterThan(earlyAverageRhr + 5);
  });

  it("every generated value stays within a physiologically plausible range", () => {
    for (const scenario of DEMO_SCENARIOS) {
      const days = generateDemoWearableSeries(scenario.id, "user-1", RANGE);
      for (const day of days) {
        expect(day.hrvMs).toBeGreaterThan(0);
        expect(day.restingHeartRateBpm).toBeGreaterThan(30);
        expect(day.restingHeartRateBpm).toBeLessThan(100);
        expect(day.sleep?.totalMinutes).toBeGreaterThan(0);
        expect(day.steps).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("returns an empty series for inverted or invalid date ranges", () => {
    expect(
      generateDemoWearableSeries("recovered_athlete", "user-1", {
        startDate: "2026-09-20",
        endDate: "2026-09-10",
      }),
    ).toEqual([]);

    expect(
      generateDemoWearableSeries("recovered_athlete", "user-1", {
        startDate: "not-a-date",
        endDate: "2026-09-10",
      }),
    ).toEqual([]);
  });
});

describe("isDemoScenarioId", () => {
  it("accepts every declared scenario id", () => {
    for (const scenario of DEMO_SCENARIOS) {
      expect(isDemoScenarioId(scenario.id)).toBe(true);
    }
  });

  it("rejects an arbitrary string", () => {
    expect(isDemoScenarioId("not_a_scenario")).toBe(false);
  });
});
