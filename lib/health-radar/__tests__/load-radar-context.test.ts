import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchSnapshots = vi.fn();

vi.mock("@/lib/wearables/registry", () => ({
  resolveWearableProvider: (settings: { enabled: boolean } | null) => {
    if (!settings?.enabled) return null;
    return {
      id: "demo",
      displayName: "Demo",
      isDemo: true,
      isConfigured: () => true,
      fetchSnapshots,
    };
  },
}));

vi.mock("@/lib/demo/settings", () => ({
  loadDemoSettings: async () => ({ enabled: true, scenario: "recovery_warning" }),
}));

vi.mock("@/lib/recovery/load-recovery-context", () => ({
  loadRecoveryContext: async () => ({
    today: null,
    todayScoreResult: {
      score: null,
      status: null,
      drivers: [],
      missingInputs: [],
      baseline: null,
    },
    trend30Days: [],
    averages7Days: { score: null, sleepHours: null, stress: null, fatigue: null, soreness: null, readiness: null, sampleSize: 0 },
    averages30Days: { score: null, sleepHours: null, stress: null, fatigue: null, soreness: null, readiness: null, sampleSize: 0 },
    trainingLoad: {
      state: "green",
      reason: "n/a",
      sessionsLast7Days: 0,
      restDaysLast7Days: 7,
      averageSessionRpe: null,
      totalVolumeKgLast7Days: null,
      lastSessionDaysAgo: null,
    },
  }),
}));

import { loadRadarContext } from "@/lib/health-radar/load-radar-context";

function profileClient(timezone: string) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { timezone }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  fetchSnapshots.mockReset();
});

beforeEach(() => {
  fetchSnapshots.mockResolvedValue({
    providerId: "demo",
    providerLabel: "Demo Wearable (fixture data)",
    isDemo: true,
    days: [],
  });
});

describe("loadRadarContext", () => {
  it("requests the wearable window on the user's local date across UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T17:00:00Z")); // Singapore already 2026-09-15

    await loadRadarContext(profileClient("Asia/Singapore") as never, "user-1");

    expect(fetchSnapshots).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ endDate: "2026-09-15", startDate: "2026-08-26" }),
    );
  });

  it("uses the exact local-date wearable row and never falls back to a stale day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T17:00:00Z"));

    fetchSnapshots.mockResolvedValue({
      providerId: "demo",
      providerLabel: "Demo",
      isDemo: true,
      days: [
        {
          date: "2026-09-14",
          restingHeartRateBpm: 55,
          averageHeartRateBpm: 70,
          hrvMs: 60,
          sleep: null,
          steps: null,
          respiratoryRateBrpm: null,
          skinTemperatureDeltaC: null,
          workouts: [],
        },
        {
          date: "2026-09-15",
          restingHeartRateBpm: 70,
          averageHeartRateBpm: 85,
          hrvMs: 35,
          sleep: null,
          steps: null,
          respiratoryRateBrpm: null,
          skinTemperatureDeltaC: null,
          workouts: [],
        },
      ],
    });

    const input = await loadRadarContext(profileClient("Asia/Singapore") as never, "user-1");

    expect(input.hrv.today).toBe(35);
    expect(input.restingHr.today).toBe(70);
    expect(input.hrv.history).toEqual([60]);
  });

  it("returns null wearable today when the local date is missing — no last-day attribution", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T17:00:00Z"));

    fetchSnapshots.mockResolvedValue({
      providerId: "demo",
      providerLabel: "Demo",
      isDemo: true,
      days: [
        {
          date: "2026-09-13",
          restingHeartRateBpm: 55,
          averageHeartRateBpm: 70,
          hrvMs: 60,
          sleep: null,
          steps: null,
          respiratoryRateBrpm: null,
          skinTemperatureDeltaC: null,
          workouts: [],
        },
      ],
    });

    const input = await loadRadarContext(profileClient("Asia/Singapore") as never, "user-1");

    expect(input.hrv.today).toBeNull();
    expect(input.restingHr.today).toBeNull();
    expect(input.hrv.history).toEqual([60]);
  });

  it("sanitizes HRV = 0 and absurd resting HR out of the radar input", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));

    fetchSnapshots.mockResolvedValue({
      providerId: "demo",
      providerLabel: "Demo",
      isDemo: true,
      days: [
        {
          date: "2026-09-15",
          restingHeartRateBpm: 5,
          averageHeartRateBpm: 70,
          hrvMs: 0,
          sleep: null,
          steps: null,
          respiratoryRateBrpm: null,
          skinTemperatureDeltaC: null,
          workouts: [],
        },
      ],
    });

    const input = await loadRadarContext(profileClient("UTC") as never, "user-1");

    expect(input.hrv.today).toBeNull();
    expect(input.restingHr.today).toBeNull();
  });
});
