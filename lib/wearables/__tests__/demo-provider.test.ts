import { describe, expect, it } from "vitest";

import { createDemoWearableProvider } from "@/lib/wearables/demo-provider";
import { resolveWearableProvider, FUTURE_WEARABLE_PROVIDERS } from "@/lib/wearables/registry";

describe("createDemoWearableProvider", () => {
  it("is always configured and clearly labeled as demo", () => {
    const provider = createDemoWearableProvider("recovered_athlete");

    expect(provider.isConfigured()).toBe(true);
    expect(provider.isDemo).toBe(true);
    expect(provider.id).toBe("demo");
  });

  it("returns a bundle labeled isDemo: true with one day per requested date", async () => {
    const provider = createDemoWearableProvider("recovered_athlete");
    const bundle = await provider.fetchSnapshots("user-1", { startDate: "2026-09-01", endDate: "2026-09-05" });

    expect(bundle?.isDemo).toBe(true);
    expect(bundle?.days).toHaveLength(5);
  });

  it("stale_data: a caller requesting only 'today' gets an empty bundle, same as a real provider mid-outage would", async () => {
    const provider = createDemoWearableProvider("stale_data");
    const bundle = await provider.fetchSnapshots("user-1", { startDate: "2026-09-15", endDate: "2026-09-15" });

    expect(bundle?.days).toHaveLength(0);
  });

  it("partial_data: sleep is missing (not zero) on every returned day", async () => {
    const provider = createDemoWearableProvider("partial_data");
    const bundle = await provider.fetchSnapshots("user-1", { startDate: "2026-09-10", endDate: "2026-09-15" });

    expect(bundle?.days.length).toBeGreaterThan(0);
    for (const day of bundle?.days ?? []) {
      expect(day.sleep).toBeNull();
      expect(day.hrvMs).not.toBeNull();
    }
  });
});

describe("resolveWearableProvider", () => {
  it("returns null for a real user with demo mode off — never a silent demo fallback", () => {
    const provider = resolveWearableProvider({ enabled: false, scenario: null });
    expect(provider).toBeNull();
  });

  it("returns null when enabled but no scenario is selected", () => {
    const provider = resolveWearableProvider({ enabled: true, scenario: null });
    expect(provider).toBeNull();
  });

  it("returns the demo provider when explicitly enabled with a scenario", () => {
    const provider = resolveWearableProvider({ enabled: true, scenario: "high_training_load" });
    expect(provider?.isDemo).toBe(true);
  });
});

describe("FUTURE_WEARABLE_PROVIDERS", () => {
  it("documents Apple HealthKit and Health Connect as native-layer-required, not working adapters", () => {
    const healthKit = FUTURE_WEARABLE_PROVIDERS.find((p) => p.id === "apple_healthkit");
    const healthConnect = FUTURE_WEARABLE_PROVIDERS.find((p) => p.id === "health_connect");

    expect(healthKit?.requiresNativeLayer).toBe(true);
    expect(healthConnect?.requiresNativeLayer).toBe(true);
  });

  it("lists Garmin, Oura and WHOOP as server-to-server (no native layer needed) but still not implemented", () => {
    for (const id of ["garmin", "oura", "whoop"] as const) {
      const entry = FUTURE_WEARABLE_PROVIDERS.find((p) => p.id === id);
      expect(entry?.requiresNativeLayer).toBe(false);
      expect(entry?.note.length).toBeGreaterThan(0);
    }
  });
});
