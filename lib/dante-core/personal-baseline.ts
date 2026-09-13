/**
 * Personal Baseline Engine (generic).
 *
 * lib/training/baseline.ts already computes a rolling personal
 * baseline, but only for per-muscle training volume. Rather than
 * write a second, parallel "baseline" concept for sleep/recovery/
 * training-load/SetVision, this module is the ONE generic primitive:
 * given a user's own historical series of some numeric signal and
 * today's value, it reports how today compares to that user's own
 * recent normal — never to a generic population average.
 *
 * Every output is honest about how little or much history backs it:
 * `confidence` is a direct function of `sampleCount`, and callers
 * must not present a baseline built from too few samples as a firm
 * fact (see MIN_SAMPLES_FOR_BASELINE below).
 */

export type BaselineDeviation = {
  /** Today's / most-recent value. Null if there is nothing to compare. */
  current: number | null;
  /** Mean of the historical window (excluding `current`'s own day). Null if insufficient history. */
  baseline: number | null;
  /** current - baseline. Null whenever either side is null. */
  delta: number | null;
  /** How many historical data points fed the baseline. */
  sampleCount: number;
  /** 0-1, purely a function of sampleCount vs the minimum/ideal window — not a statistical p-value. */
  confidence: number;
};

const MIN_SAMPLES_FOR_BASELINE = 5;
/** Confidence reaches 1.0 once sampleCount hits this many points. */
const IDEAL_SAMPLES_FOR_FULL_CONFIDENCE = 14;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Lower-level primitive shared by `computeBaselineDeviation` (below)
 * and any caller that has already reduced its own history down to a
 * mean + sample count elsewhere (e.g. aggregating the existing
 * per-muscle training-volume baselines from lib/training/baseline.ts
 * into one whole-body figure) — so there is exactly one confidence
 * formula in the codebase, not one per call site.
 */
export function deviationFromSummary(
  current: number | null,
  baselineMean: number | null,
  sampleCount: number,
): BaselineDeviation {
  if (baselineMean === null || sampleCount < MIN_SAMPLES_FOR_BASELINE) {
    return {
      current,
      baseline: null,
      delta: null,
      sampleCount,
      confidence: 0,
    };
  }

  const baseline = round(baselineMean);
  const delta = current !== null ? round(current - baseline) : null;
  const confidence = round(Math.min(1, sampleCount / IDEAL_SAMPLES_FOR_FULL_CONFIDENCE), 2);

  return { current, baseline, delta, sampleCount, confidence };
}

/**
 * `history` should already exclude the value being compared (e.g.
 * today), and be whatever recent window the caller considers
 * relevant (7/14/30 days) — this function does not do any date
 * filtering itself, it only does the statistics, so it stays usable
 * for sleep, recovery score, training load or SetVision metrics
 * alike.
 */
export function computeBaselineDeviation(
  history: Array<number | null>,
  current: number | null,
): BaselineDeviation {
  const samples = history.filter((value): value is number => value !== null);

  if (samples.length === 0) {
    return deviationFromSummary(current, null, 0);
  }

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return deviationFromSummary(current, mean, samples.length);
}

export { MIN_SAMPLES_FOR_BASELINE };
