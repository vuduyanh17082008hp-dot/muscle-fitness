import { describe, expect, it } from "vitest";

import { computeFreshness, FRESHNESS_THRESHOLDS } from "../data-freshness";

const NOW = new Date("2026-09-13T12:00:00.000Z");

describe("computeFreshness", () => {
  it("reports missing when there is no timestamp at all", () => {
    const result = computeFreshness(null, FRESHNESS_THRESHOLDS.setVision, NOW);
    expect(result.status).toBe("missing");
    expect(result.lastUpdated).toBeNull();
    expect(result.humanReadable).toBe("No recent sample");
  });

  it("reports current when well within the threshold", () => {
    const eightHoursAgo = new Date(NOW.getTime() - 8 * 60 * 60 * 1000).toISOString();
    const result = computeFreshness(eightHoursAgo, FRESHNESS_THRESHOLDS.recoveryCheckin, NOW);
    expect(result.status).toBe("current");
    expect(result.humanReadable).toBe("Updated 8h ago");
  });

  it("reports stale once past the threshold, never silently treated as current", () => {
    const elevenDaysAgo = new Date(NOW.getTime() - 11 * 24 * 60 * 60 * 1000).toISOString();
    const result = computeFreshness(elevenDaysAgo, FRESHNESS_THRESHOLDS.recoveryCheckin, NOW);
    expect(result.status).toBe("stale");
    expect(result.humanReadable).toBe("Updated 11d ago");
  });

  it("treats an invalid date string as missing rather than throwing", () => {
    const result = computeFreshness("not-a-date", FRESHNESS_THRESHOLDS.training, NOW);
    expect(result.status).toBe("missing");
  });

  it("is deterministic for identical input", () => {
    const ts = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const a = computeFreshness(ts, FRESHNESS_THRESHOLDS.nutritionLog, NOW);
    const b = computeFreshness(ts, FRESHNESS_THRESHOLDS.nutritionLog, NOW);
    expect(a).toEqual(b);
  });
});
