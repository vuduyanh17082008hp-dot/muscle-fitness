import type { CompletedRep, RepTempo } from "@/lib/setvision/types";

/**
 * Tempo (spec Part B §16). Directly derived from the rep state
 * machine's phase-transition timestamps — no separate estimation
 * logic, so tempo can never disagree with the rep boundaries shown
 * elsewhere in the UI.
 */

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeRepTempo(rep: CompletedRep): RepTempo {
  return {
    repNumber: rep.repNumber,
    eccentricSec: rep.startObserved ? round((rep.bottomAtMs - rep.topAtMs) / 1000) : null,
    pauseSec: rep.startObserved ? round((rep.ascentStartAtMs - rep.bottomAtMs) / 1000) : null,
    concentricSec: round((rep.ascentEndAtMs - rep.ascentStartAtMs) / 1000),
    descentStartMs: rep.startObserved ? rep.topAtMs : null,
    bottomReachedMs: rep.startObserved ? rep.bottomAtMs : null,
    ascentStartMs: rep.ascentStartAtMs,
    repEndMs: rep.ascentEndAtMs,
  };
}

export function computeAllRepTempo(reps: CompletedRep[]): RepTempo[] {
  return reps.map(computeRepTempo);
}

function average(maybeValues: Array<number | null>): number | null {
  const values = maybeValues.filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function averageEccentricTime(tempos: RepTempo[]): number | null {
  return average(tempos.map((t) => t.eccentricSec));
}

export function averageConcentricTime(tempos: RepTempo[]): number | null {
  return average(tempos.map((t) => t.concentricSec));
}

/**
 * Tempo consistency across reps: 1 - coefficient of variation of
 * total rep duration (eccentric + pause + concentric), clamped to
 * [0, 1]. Null with fewer than 2 fully observed reps.
 */
export function computeTempoConsistency(tempos: RepTempo[]): number | null {
  // Only fully observed reps: a rep with an unobserved descent has no comparable total.
  const totals = tempos.flatMap((t) =>
    t.eccentricSec === null || t.pauseSec === null ? [] : [t.eccentricSec + t.pauseSec + t.concentricSec],
  );

  if (totals.length < 2) {
    return null;
  }

  const mean = totals.reduce((sum, v) => sum + v, 0) / totals.length;

  if (mean <= 0) {
    return null;
  }

  const variance = totals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / totals.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = stdDev / mean;

  return round(Math.min(1, Math.max(0, 1 - coefficientOfVariation)));
}
