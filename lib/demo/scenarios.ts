import { seededRandom, seededRange } from "@/lib/demo/prng";
import type { WearableDailySnapshot } from "@/lib/wearables/types";

/**
 * Competition-safe Demo Data Control (spec Part "2. DEMO DATA
 * CONTROL"). Six named, deterministic scenarios — never raw
 * randomness a judge could catch flip-flopping between page loads.
 * Four define a BASELINE period and a RECENT deviation window —
 * giving the Recovery Radar (which needs real baseline-vs-current
 * contrast) and the Experiment Lab (which needs a multi-day history
 * to bucket) something real to compute against, not a single flat
 * number. The other two exercise data-quality edges rather than a
 * physiological deviation: `partial_data` (a whole metric category
 * missing, never zeroed) and `stale_data` (a real sync gap — no rows
 * for the recent window, not different-looking rows).
 */

/** How many of the most recent days `stale_data` drops entirely from its own series — simulating a provider that stopped syncing, not one with nothing to report. */
export const STALE_GAP_DAYS = 4;

export type DemoScenarioId =
  | "recovered_athlete"
  | "sleep_deprived_athlete"
  | "high_training_load"
  | "recovery_warning"
  | "partial_data"
  | "stale_data";

export const DEMO_SCENARIOS: Array<{ id: DemoScenarioId; label: string; description: string }> = [
  {
    id: "recovered_athlete",
    label: "Recovered Athlete",
    description: "Strong sleep, high HRV, low resting HR — consistently well-recovered across the window.",
  },
  {
    id: "sleep_deprived_athlete",
    label: "Sleep-Deprived Athlete",
    description: "Normal baseline, but the last few nights show a sharp, sustained drop in sleep duration.",
  },
  {
    id: "high_training_load",
    label: "High Training Load",
    description: "Recovery signals gradually trend downward across the window, consistent with accumulating fatigue.",
  },
  {
    id: "recovery_warning",
    label: "Recovery Warning",
    description: "HRV, resting HR and sleep all shift unfavorably together in the last couple of days — a multi-signal deviation.",
  },
  {
    id: "partial_data",
    label: "Partial Data",
    description: "A device that never tracks sleep — HRV, resting HR and steps report normally, but sleep is missing every day, not zeroed.",
  },
  {
    id: "stale_data",
    label: "Stale Data",
    description: `Sync stopped ${STALE_GAP_DAYS} days ago — the provider has real history, but nothing for the recent window, unlike a device that was never connected.`,
  },
] as const;

const DEMO_SCENARIO_IDS = DEMO_SCENARIOS.map((s) => s.id);

export function isDemoScenarioId(value: string): value is DemoScenarioId {
  return (DEMO_SCENARIO_IDS as string[]).includes(value);
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dateIso(offsetDaysFromToday: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + offsetDaysFromToday);
  return d.toISOString().slice(0, 10);
}

/**
 * Generates ONE day of a scenario's series. `daysFromEnd` is 0 for the
 * most recent day, increasing going further into the past — this is
 * what lets a scenario define "the last N days look different from
 * the rest" without the caller needing to know total window length.
 */
function generateDay(
  scenario: DemoScenarioId,
  date: string,
  daysFromEnd: number,
  seedPrefix: string,
): WearableDailySnapshot {
  const rng = seededRandom(`${seedPrefix}:${scenario}:${date}`);

  // Defaults: a plausible, unremarkable recreational-athlete baseline.
  let hrv = seededRange(rng, 55, 65);
  let restingHr = seededRange(rng, 54, 60);
  let sleepMinutes = seededRange(rng, 420, 480); // 7-8h
  let steps = seededRange(rng, 6000, 9500);

  const inRecentWindow = daysFromEnd < 3;

  switch (scenario) {
    case "recovered_athlete":
      hrv = seededRange(rng, 65, 78);
      restingHr = seededRange(rng, 46, 52);
      sleepMinutes = seededRange(rng, 450, 510); // 7.5-8.5h
      steps = seededRange(rng, 7000, 11500);
      break;

    case "sleep_deprived_athlete":
      if (inRecentWindow) {
        sleepMinutes = seededRange(rng, 240, 300); // 4-5h
        hrv = seededRange(rng, 42, 52);
        restingHr = seededRange(rng, 58, 64);
      }
      break;

    case "high_training_load": {
      // Gradual downward drift across the whole window, not a cliff.
      const driftFraction = 1 - Math.min(1, daysFromEnd / 18);
      hrv = seededRange(rng, 55, 65) - driftFraction * 14;
      restingHr = seededRange(rng, 54, 60) + driftFraction * 8;
      sleepMinutes = seededRange(rng, 420, 480) - driftFraction * 60;
      steps = seededRange(rng, 8000, 12000);
      break;
    }

    case "recovery_warning":
      if (inRecentWindow) {
        hrv = seededRange(rng, 30, 40);
        restingHr = seededRange(rng, 66, 74);
        sleepMinutes = seededRange(rng, 260, 320);
      }
      break;

    // "partial_data": handled below — sleep is omitted entirely
    // rather than given a different number, since the point of this
    // scenario is a device category gap (missing != zero), not a
    // different sleep VALUE.
    //
    // "stale_data": per-day values stay at the plausible baseline
    // above — staleness is a SERIES-level property (recent days are
    // dropped entirely, see generateDemoWearableSeries), not a
    // per-day value shift.
  }

  return {
    date,
    restingHeartRateBpm: round(restingHr),
    averageHeartRateBpm: round(restingHr + seededRange(rng, 14, 22)),
    hrvMs: round(hrv),
    sleep:
      scenario === "partial_data"
        ? null
        : {
            totalMinutes: round(sleepMinutes),
            remMinutes: round(sleepMinutes * seededRange(rng, 0.18, 0.24)),
            deepMinutes: round(sleepMinutes * seededRange(rng, 0.12, 0.18)),
          },
    steps: round(steps),
    respiratoryRateBrpm: round(seededRange(rng, 13, 16), 1),
    skinTemperatureDeltaC: round(seededRange(rng, -0.3, 0.3), 1),
    workouts: [],
  };
}

/**
 * Generates a full daily series for [startDate, endDate] (inclusive),
 * deterministic per (userId, scenario, date) — the same request
 * always returns the same values.
 */
export function generateDemoWearableSeries(
  scenario: DemoScenarioId,
  userId: string,
  range: { startDate: string; endDate: string },
): WearableDailySnapshot[] {
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDate}T00:00:00.000Z`);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);

  const days: WearableDailySnapshot[] = [];

  for (let i = 0; i < totalDays; i += 1) {
    const date = dateIso(-(totalDays - 1 - i), new Date(`${range.endDate}T00:00:00.000Z`));
    const daysFromEnd = totalDays - 1 - i;

    // "stale_data": the most recent STALE_GAP_DAYS are dropped from
    // the series entirely rather than generated with different
    // values — a provider that stopped syncing has NO row for those
    // dates, it doesn't report a row with stale-looking numbers. A
    // caller asking only for today's date against this scenario
    // legitimately gets an empty array, same as it would from a real
    // provider mid-outage.
    if (scenario === "stale_data" && daysFromEnd < STALE_GAP_DAYS) {
      continue;
    }

    days.push(generateDay(scenario, date, daysFromEnd, userId));
  }

  return days;
}
