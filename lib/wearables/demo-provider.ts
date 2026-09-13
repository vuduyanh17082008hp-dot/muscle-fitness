import { generateDemoWearableSeries, type DemoScenarioId } from "@/lib/demo/scenarios";
import type { WearableDateRange, WearableProvider, WearableSnapshotBundle } from "@/lib/wearables/types";

/**
 * The DEMO wearable provider (spec Part "1. WEARABLE PROVIDER LAYER":
 * "implement a clearly labelled DEMO provider using realistic test
 * fixtures. Do not claim live integration unless it actually
 * exists."). This is the ONLY WearableProvider implementation that
 * exists today — see lib/wearables/registry.ts and docs/wearables.md
 * for the other five, which are documented future integration points,
 * not working code.
 *
 * Deterministic and in-memory: nothing here is persisted, and nothing
 * here ever writes to a real user's recovery/training tables — a
 * scenario is only ever surfaced to the user who explicitly turned
 * their own demo mode on (lib/demo/settings.ts).
 */
export function createDemoWearableProvider(scenario: DemoScenarioId): WearableProvider {
  return {
    id: "demo",
    displayName: "Demo Wearable (fixture data)",
    isDemo: true,
    isConfigured: () => true,
    async fetchSnapshots(userId: string, range: WearableDateRange): Promise<WearableSnapshotBundle | null> {
      const days = generateDemoWearableSeries(scenario, userId, range);

      return {
        providerId: "demo",
        providerLabel: "Demo Wearable (fixture data)",
        isDemo: true,
        days,
      };
    },
  };
}
