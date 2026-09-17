import type { WearableDailySnapshot, WearableSnapshotBundle } from "@/lib/wearables/types";

/**
 * Generic wearable connection status — provider-neutral (works
 * identically for the demo provider today and any real
 * server-to-server provider added later; see docs/wearables.md).
 *
 * Deliberately does NOT include "syncing" or "error": nothing in this
 * codebase runs an async sync job yet (that only exists once a real
 * OAuth provider is built — see FUTURE_WEARABLE_PROVIDERS in
 * lib/wearables/registry.ts), so those states would have no code path
 * that could ever produce them. Adding them now would be exactly the
 * kind of fake-but-unreachable state this project avoids elsewhere.
 */
export type WearableConnectionStatus =
  | "not_connected" // no provider resolved for this user (no real adapter yet, demo mode off)
  | "no_data" // a provider is resolved but returned zero days for the requested window
  | "stale" // a provider is resolved and has history, but nothing recent
  | "connected" // a provider is resolved with fresh data, isDemo: false
  | "demo"; // a provider is resolved with fresh data, isDemo: true

export type WearableConnectionState = {
  status: WearableConnectionStatus;
  providerLabel: string | null;
  isDemo: boolean;
  /** The most recent day this provider actually has data for — may be older than `today`. */
  lastDataDate: string | null;
  /** today - lastDataDate, in days. Null when there's no data at all. */
  daysSinceLastData: number | null;
};

/** A gap of more than this many days between "today" and the latest available day counts as stale. */
export const STALE_AFTER_DAYS = 2;

function daysBetweenIso(earlierIso: string, laterIso: string): number {
  const earlier = new Date(`${earlierIso}T00:00:00.000Z`).getTime();
  const later = new Date(`${laterIso}T00:00:00.000Z`).getTime();
  return Math.round((later - earlier) / (24 * 60 * 60 * 1000));
}

/**
 * Pure derivation — no I/O. `bundle` should be fetched over a real
 * trailing window (several days), not just "today": a single-day
 * request can never tell "no wearable" and "wearable stopped syncing
 * N days ago" apart, since both come back with zero rows for today.
 */
export function deriveWearableConnectionState(
  bundle: WearableSnapshotBundle | null,
  todayIso: string,
): WearableConnectionState {
  if (!bundle) {
    return {
      status: "not_connected",
      providerLabel: null,
      isDemo: false,
      lastDataDate: null,
      daysSinceLastData: null,
    };
  }

  const lastDay = bundle.days[bundle.days.length - 1] ?? null;

  if (!lastDay) {
    return {
      status: "no_data",
      providerLabel: bundle.providerLabel,
      isDemo: bundle.isDemo,
      lastDataDate: null,
      daysSinceLastData: null,
    };
  }

  const daysSinceLastData = daysBetweenIso(lastDay.date, todayIso);

  return {
    status: daysSinceLastData > STALE_AFTER_DAYS ? "stale" : bundle.isDemo ? "demo" : "connected",
    providerLabel: bundle.providerLabel,
    isDemo: bundle.isDemo,
    lastDataDate: lastDay.date,
    daysSinceLastData,
  };
}

/** The most recent day in a bundle, regardless of whether it's literally "today" — mirrors `deriveWearableConnectionState`'s own lookup so callers don't re-derive it differently. */
export function latestAvailableDay(bundle: WearableSnapshotBundle | null): WearableDailySnapshot | null {
  return bundle?.days[bundle.days.length - 1] ?? null;
}
