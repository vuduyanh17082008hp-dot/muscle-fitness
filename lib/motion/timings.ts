/**
 * ONE restrained motion system, shared across the app rather than
 * every component inventing its own duration. Values in seconds
 * (Framer Motion's unit). Pick the tier by what's changing, not by
 * feel:
 *
 *  - micro   — a hover/press/focus acknowledgment
 *  - state   — a value or status just changed (tab switch, metric update)
 *  - section — a whole section/card is entering (Halo reveal, panel mount)
 *  - large   — a page-level or layout-level transition
 *
 * Reduced-motion: every consumer should still branch on
 * `useReducedMotion()` and drop to duration 0 — this file only
 * supplies the numbers, it doesn't enforce the check.
 */
export const MOTION = {
  micro: 0.2,
  state: 0.26,
  section: 0.4,
  large: 0.5,
} as const;

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
