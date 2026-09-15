import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { loadDemoSettings } from "@/lib/demo/settings";
import { resolveWearableProvider } from "@/lib/wearables/registry";
import { sanitizeHrvMs, sanitizeRestingHeartRateBpm } from "@/lib/wearables/sanitize";
import { localDateTimeParts, resolveUserTimeZone } from "@/lib/training/load-today-session";
import { addDaysIso } from "@/lib/nutrition/date-utils";
import type { RecoveryRadarInput } from "@/lib/health-radar/recovery-radar-engine";

const WEARABLE_WINDOW_DAYS = 21;

/**
 * Assembles the Recovery Radar's input from real, already-existing
 * data sources — the 30-day recovery trend (same series
 * lib/athlete-state/build-athlete-state.ts already uses for sleep/
 * recovery-score baselines) plus the resolved wearable provider
 * (demo-only today; see lib/wearables/registry.ts). No new recovery
 * computation happens here — this only reshapes existing series into
 * the engine's {history, today} input contract.
 *
 * "Today" is the user's local calendar date (profiles.timezone), the
 * same source loadRecoveryContext / the check-in API use — never a
 * second UTC-only clock that can disagree near midnight.
 */
export async function loadRadarContext(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<RecoveryRadarInput> {
  const timezone = await resolveUserTimeZone(supabase, userId);
  const todayIso = localDateTimeParts(now, timezone).localDate;
  const wearableStart = addDaysIso(todayIso, -(WEARABLE_WINDOW_DAYS - 1));

  const [recoveryContext, demoSettings] = await Promise.all([
    loadRecoveryContext(supabase, userId).catch((error: unknown) => {
      console.warn("[HEALTH RADAR] recovery context failed:", error);
      return null;
    }),
    loadDemoSettings(supabase, userId),
  ]);

  const wearableProvider = resolveWearableProvider(demoSettings);
  const wearableBundle = wearableProvider
    ? await wearableProvider.fetchSnapshots(userId, {
        startDate: wearableStart,
        endDate: todayIso,
      })
    : null;

  const todayCheckinDate = recoveryContext?.today?.checkin_date ?? null;

  const sleepHistory = recoveryContext
    ? recoveryContext.trend30Days.filter((p) => p.date !== todayCheckinDate).map((p) => p.sleepHours)
    : [];
  const sleepToday = recoveryContext?.today?.sleep_hours ?? null;

  const scoreHistory = recoveryContext
    ? recoveryContext.trend30Days.filter((p) => p.date !== todayCheckinDate).map((p) => p.score)
    : [];
  const scoreToday = recoveryContext?.todayScoreResult.score ?? null;

  const wearableDays = wearableBundle?.days ?? [];
  // Exact local-date match only — never fall back to the newest day in
  // the bundle, which would silently attribute yesterday's HRV/RHR to
  // "today" when the clocks disagree or the series is incomplete.
  const todayWearableDay = wearableDays.find((d) => d.date === todayIso) ?? null;
  const historicalWearableDays = wearableDays.filter((d) => d.date !== todayIso);

  return {
    hrv: {
      history: historicalWearableDays.map((d) => sanitizeHrvMs(d.hrvMs)),
      today: sanitizeHrvMs(todayWearableDay?.hrvMs ?? null),
    },
    restingHr: {
      history: historicalWearableDays.map((d) => sanitizeRestingHeartRateBpm(d.restingHeartRateBpm)),
      today: sanitizeRestingHeartRateBpm(todayWearableDay?.restingHeartRateBpm ?? null),
    },
    sleepHours: { history: sleepHistory, today: sleepToday },
    recoveryScore: { history: scoreHistory, today: scoreToday },
    dataSource: {
      wearable: wearableBundle !== null,
      isDemoWearable: wearableBundle?.isDemo ?? false,
      recoveryCheckins: (recoveryContext?.trend30Days.length ?? 0) > 0 || recoveryContext?.today !== null,
    },
  };
}
