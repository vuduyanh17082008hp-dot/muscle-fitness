import { createDemoWearableProvider } from "@/lib/wearables/demo-provider";
import type { DemoScenarioId } from "@/lib/demo/scenarios";
import type { WearableProvider, WearableProviderId } from "@/lib/wearables/types";

/**
 * Wearable provider registry (spec Part "1. WEARABLE PROVIDER LAYER"
 * + "3. HEALTH CONNECT / HEALTHKIT READINESS").
 *
 * `FUTURE_WEARABLE_PROVIDERS` exists so the product surface (settings
 * UI, docs) can honestly show "coming soon" entries WITHOUT any of
 * them being wired to fake code — there is no `createAppleHealthKit
 * Provider()` stub anywhere that silently no-ops or returns fabricated
 * data. See docs/wearables.md for what each one would actually
 * require to build for real.
 */
export const FUTURE_WEARABLE_PROVIDERS: Array<{
  id: WearableProviderId;
  displayName: string;
  requiresNativeLayer: boolean;
  note: string;
}> = [
  {
    id: "apple_healthkit",
    displayName: "Apple HealthKit",
    requiresNativeLayer: true,
    note: "HealthKit is an iOS-native, sandboxed API — it cannot be read from web JavaScript. Requires a native iOS app (or an app-clip/companion) that syncs to this backend.",
  },
  {
    id: "health_connect",
    displayName: "Android Health Connect",
    requiresNativeLayer: true,
    note: "Health Connect is an Android-native API with the same constraint as HealthKit — requires a native Android integration.",
  },
  {
    id: "garmin",
    displayName: "Garmin",
    requiresNativeLayer: false,
    note: "Garmin Connect has a server-to-server OAuth API — buildable from this web backend, but needs a developer account, OAuth flow, and a webhook/sync job. Not started.",
  },
  {
    id: "oura",
    displayName: "Oura",
    requiresNativeLayer: false,
    note: "Oura Cloud API is a server-to-server OAuth API — same shape of work as Garmin. Not started.",
  },
  {
    id: "whoop",
    displayName: "WHOOP",
    requiresNativeLayer: false,
    note: "WHOOP API is a server-to-server OAuth API — same shape of work as Garmin/Oura. Not started.",
  },
];

/**
 * Resolves the ACTIVE provider for a user. Real production users with
 * demo mode off get `null` — never a silent fallback to demo data.
 */
export function resolveWearableProvider(demoSettings: {
  enabled: boolean;
  scenario: DemoScenarioId | null;
}): WearableProvider | null {
  if (demoSettings.enabled && demoSettings.scenario) {
    return createDemoWearableProvider(demoSettings.scenario);
  }

  // No real adapter is implemented yet (see FUTURE_WEARABLE_PROVIDERS above).
  return null;
}
