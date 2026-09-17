import { describe, expect, it } from "vitest";

import { deriveWearableConnectionState, latestAvailableDay, STALE_AFTER_DAYS } from "@/lib/wearables/connection-status";
import type { WearableDailySnapshot, WearableSnapshotBundle } from "@/lib/wearables/types";

function day(date: string): WearableDailySnapshot {
  return {
    date,
    restingHeartRateBpm: 55,
    averageHeartRateBpm: 70,
    hrvMs: 60,
    sleep: { totalMinutes: 450, remMinutes: 90, deepMinutes: 70 },
    steps: 8000,
    respiratoryRateBrpm: 14,
    skinTemperatureDeltaC: 0,
    workouts: [],
  };
}

function bundle(days: WearableDailySnapshot[], isDemo = true): WearableSnapshotBundle {
  return { providerId: "demo", providerLabel: "Demo Wearable (fixture data)", isDemo, days };
}

describe("deriveWearableConnectionState", () => {
  it("is not_connected when no provider resolved (null bundle)", () => {
    const state = deriveWearableConnectionState(null, "2026-09-15");

    expect(state.status).toBe("not_connected");
    expect(state.lastDataDate).toBeNull();
    expect(state.daysSinceLastData).toBeNull();
  });

  it("is no_data when a provider is resolved but returned zero days", () => {
    const state = deriveWearableConnectionState(bundle([]), "2026-09-15");

    expect(state.status).toBe("no_data");
    expect(state.lastDataDate).toBeNull();
  });

  it("is demo when the latest day is today (or within the fresh window) and isDemo is true", () => {
    const state = deriveWearableConnectionState(bundle([day("2026-09-14"), day("2026-09-15")]), "2026-09-15");

    expect(state.status).toBe("demo");
    expect(state.lastDataDate).toBe("2026-09-15");
    expect(state.daysSinceLastData).toBe(0);
  });

  it("is connected (not demo) under the same freshness rule when isDemo is false", () => {
    const state = deriveWearableConnectionState(bundle([day("2026-09-15")], false), "2026-09-15");

    expect(state.status).toBe("connected");
  });

  it(`is stale once the gap exceeds ${STALE_AFTER_DAYS} days, distinct from no_data`, () => {
    const state = deriveWearableConnectionState(bundle([day("2026-09-10")]), "2026-09-15");

    expect(state.status).toBe("stale");
    expect(state.lastDataDate).toBe("2026-09-10");
    expect(state.daysSinceLastData).toBe(5);
  });

  it("stays within the fresh window right at the STALE_AFTER_DAYS boundary", () => {
    const state = deriveWearableConnectionState(bundle([day("2026-09-13")]), "2026-09-15");

    expect(state.daysSinceLastData).toBe(STALE_AFTER_DAYS);
    expect(state.status).toBe("demo");
  });
});

describe("latestAvailableDay", () => {
  it("returns null for a null bundle", () => {
    expect(latestAvailableDay(null)).toBeNull();
  });

  it("returns the last (most recent) day, not the first", () => {
    const b = bundle([day("2026-09-01"), day("2026-09-02")]);
    expect(latestAvailableDay(b)?.date).toBe("2026-09-02");
  });
});
