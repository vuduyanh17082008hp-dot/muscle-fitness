/**
 * Provider-neutral sanitization for wearable numeric signals.
 *
 * Real and demo adapters can emit null, 0, negatives, or absurd values.
 * Callers that classify against a personal baseline must treat
 * physiologically impossible readings as *missing* — never as a
 * catastrophic deviation from the athlete's own normal.
 */

export function sanitizeHrvMs(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  // RMSSD of 0 is not a real measurement; >300ms is outside consumer-wearable range.
  if (value <= 0 || value > 300) return null;
  return value;
}

export function sanitizeRestingHeartRateBpm(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value < 25 || value > 220) return null;
  return value;
}
