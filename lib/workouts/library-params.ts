import { CANONICAL_MUSCLES, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Small pure query-param parsers for the Atlas -> library and
 * library/Program-Builder-prefill contracts — extracted out of the
 * page components so they're unit-testable (this repo's Vitest setup
 * has no jsdom/React Testing Library to test page components directly).
 */

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Validates a `?muscle=` query param against the real taxonomy — never trusts it blindly. */
export function parseMuscleParam(value: string | string[] | undefined): CanonicalMuscle | null {
  const raw = firstValue(value);
  if (!raw) return null;
  return (CANONICAL_MUSCLES as string[]).includes(raw) ? (raw as CanonicalMuscle) : null;
}

/** Validates a `?prefillExercise=` query param — just non-empty text, matched against real exercise names by the picker itself. */
export function parsePrefillExercise(value: string | string[] | undefined): string | null {
  const raw = firstValue(value)?.trim();
  return raw ? raw : null;
}
