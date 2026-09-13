/**
 * Wearable Provider Layer — canonical, provider-neutral contracts
 * (spec Part "1. WEARABLE PROVIDER LAYER").
 *
 * Muscle Fitness is a web product. Browser JavaScript cannot read
 * Apple HealthKit or Android Health Connect directly — both are
 * native, sandboxed platform APIs (see docs/wearables.md). This
 * module defines the SHAPE any wearable data source normalizes into
 * before it reaches the Athlete Digital Twin; it does not, and could
 * not, read from a real device today. The only provider actually
 * implemented in this phase is `demo` (lib/wearables/demo-provider.ts)
 * — every other id below is a documented future integration point,
 * not a working adapter.
 */

export type WearableProviderId =
  | "demo"
  | "apple_healthkit"
  | "health_connect"
  | "garmin"
  | "oura"
  | "whoop";

/** Providers with a real, working adapter TODAY. Keep this list honest — see registry.ts. */
export const IMPLEMENTED_WEARABLE_PROVIDERS: WearableProviderId[] = ["demo"];

export type WearableWorkoutSample = {
  startedAt: string;
  durationMinutes: number;
  activityType: string;
  averageHeartRateBpm: number | null;
};

/** One calendar day of normalized wearable signal. Every field independently nullable — a real provider rarely reports all of these. */
export type WearableDailySnapshot = {
  date: string; // YYYY-MM-DD
  restingHeartRateBpm: number | null;
  /** Daytime/average heart rate — distinct from resting HR. */
  averageHeartRateBpm: number | null;
  /** Root-mean-square of successive differences (RMSSD), ms — the most common consumer-wearable HRV metric. */
  hrvMs: number | null;
  sleep: {
    totalMinutes: number | null;
    remMinutes: number | null;
    deepMinutes: number | null;
  } | null;
  steps: number | null;
  respiratoryRateBrpm: number | null;
  /** Delta from the wearer's own baseline skin temperature, °C — only some devices (e.g. Oura) support this. */
  skinTemperatureDeltaC: number | null;
  workouts: WearableWorkoutSample[];
};

export type WearableSnapshotBundle = {
  providerId: WearableProviderId;
  providerLabel: string;
  /** True for every provider currently implemented — see the module doc above. UI must never let this look like a real device connection. */
  isDemo: boolean;
  /** Oldest first. */
  days: WearableDailySnapshot[];
};

export type WearableDateRange = { startDate: string; endDate: string };

/**
 * Every wearable adapter — real or demo — implements this exact
 * interface. The Athlete Digital Twin, Recovery Radar, and Experiment
 * Lab all consume `WearableSnapshotBundle`, never a provider-specific
 * shape, so adding a real provider later never touches those callers.
 */
export interface WearableProvider {
  id: WearableProviderId;
  displayName: string;
  isDemo: boolean;
  /** Whether this adapter can actually run right now (has credentials/config). The demo provider is always configured. */
  isConfigured(): boolean;
  fetchSnapshots(userId: string, range: WearableDateRange): Promise<WearableSnapshotBundle | null>;
}
