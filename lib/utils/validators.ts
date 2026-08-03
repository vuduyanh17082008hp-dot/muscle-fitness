// lib/utils/validators.ts

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function safeParseInt(value: string | undefined | null, fallback = 0): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export function safeParseFloat(value: string | undefined | null, fallback = 0): number {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

export function isPositiveNumber(value: number): boolean {
  return typeof value === 'number' && value > 0 && isFinite(value);
}

export function ensurePositive(value: number, fallback = 0): number {
  return isPositiveNumber(value) ? value : fallback;
}

export function getFirstSafe<T>(arr: T[] | undefined | null, fallback: T): T {
  return arr && arr.length > 0 ? arr[0] : fallback;
}