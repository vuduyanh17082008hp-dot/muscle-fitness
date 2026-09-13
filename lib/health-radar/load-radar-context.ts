import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { loadDemoSettings } from "@/lib/demo/settings";
import { resolveWearableProvider } from "@/lib/wearables/registry";
import type { RecoveryRadarInput } from "@/lib/health-radar/recovery-radar-engine";

const WEARABLE_WINDOW_DAYS = 21;

function daysAgoIso(days: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Assembles the Recovery Radar's input from real, already-existing
 * data sources — the 30-day recovery trend (same series
 * lib/athlete-state/build-athlete-state.ts already uses for sleep/
 * recovery-score baselines) plus the resolved wearable provider
 * (demo-only today; see lib/wearables/registry.ts). No new recovery
 * computation happens here — this only reshapes existing series into
 * the engine's {history, today} input contract.
 */
export async function loadRadarContext(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<RecoveryRadarInput> {
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
        startDate: daysAgoIso(WEARABLE_WINDOW_DAYS, now),
        endDate: now.toISOString().slice(0, 10),
      })
    : null;

  const todayIso = now.toISOString().slice(0, 10);
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
  const todayWearableDay = wearableDays.find((d) => d.date === todayIso) ?? wearableDays[wearableDays.length - 1] ?? null;
  const historicalWearableDays = wearableDays.filter((d) => d !== todayWearableDay);

  return {
    hrv: {
      history: historicalWearableDays.map((d) => d.hrvMs),
      today: todayWearableDay?.hrvMs ?? null,
    },
    restingHr: {
      history: historicalWearableDays.map((d) => d.restingHeartRateBpm),
      today: todayWearableDay?.restingHeartRateBpm ?? null,
    },
    sleepHours: { history: sleepHistory, today: sleepToday },
    recoveryScore: { history: scoreHistory, today: scoreToday },
    dataSource: {
      wearable: wearableBundle !== null,
      isDemoWearable: wearableBundle?.isDemo ?? false,
      recoveryCheckins: recoveryContext !== null,
    },
  };
}
