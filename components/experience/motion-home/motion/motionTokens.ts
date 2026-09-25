/**
 * Motion vocabulary for the Motion Lab homepage (`/`). Each token
 * maps to a distinct visual mass per the approved spec — headline moves
 * "heavy", a signal dot moves "signal", scene handoffs move "cinematic".
 * Nothing in this file should be imported outside components/experience/.
 */

export const ease = {
  signal: "expo.out",
  heavy: "power4.out",
  cinematic: "power3.inOut",
  soft: "circ.out",
  precise: "power2.out",
  breathe: "sine.inOut",
} as const;

export const duration = {
  instant: 0.2,
  fast: 0.35,
  base: 0.6,
  slow: 0.9,
  cinematic: 1.2,
  breathe: 4,
} as const;

/**
 * Chapter order follows the master scroll sequence: Hero -> Problem ->
 * Session (Adaptive Training) -> Signal -> Training -> Muscle ->
 * Recovery -> Adapt -> Dante -> Convergence. This only drives the
 * right-side scroll progress rail (ChapterNav) — it is NOT the site's
 * main navigation (see MotionHomepage's header, which is a plain
 * product nav: Dashboard/Train/Nutrition/Progress/Dante). Convergence
 * is a closing CTA, not a nav destination, so it has no entry here.
 */
export const navChapters = [
  { id: "hero", index: "00", label: "Core" },
  { id: "problem", index: "01", label: "Problem" },
  { id: "system", index: "02", label: "Session" },
  { id: "signal", index: "03", label: "Signal" },
  { id: "training", index: "04", label: "Train" },
  { id: "muscle", index: "05", label: "Muscle" },
  { id: "recovery", index: "06", label: "Recover" },
  { id: "adapt", index: "07", label: "Adapt" },
  { id: "dante", index: "08", label: "Dante" },
] as const;

/** One-shot entrance. Never scrub, never pin — scrubbed fromTo
 *  (opacity 0 / yPercent 100 / clipPath) left full-section layout
 *  holes because the section occupied document flow while content
 *  stayed invisible until a long start→end range completed. */
export const enterOnce = {
  start: "top 90%",
  once: true,
} as const;

/** Clamp any backend-sourced numeric value before it drives a transform/animation. */
export function clampVisual(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
