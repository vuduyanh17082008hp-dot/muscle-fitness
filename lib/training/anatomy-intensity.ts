/**
 * Reusable color/intensity mapping for the anatomical body map.
 *
 * The SAME SVG regions can represent Anatomy, Volume, Change,
 * Performance, Frequency, Recovery, or Priority — callers supply a
 * normalized intensity (0–1) plus an optional categorical tone.
 * Never hard-code visualization exclusively for Anatomy mode.
 */

export type AnatomyMapMode =
  | "anatomy"
  | "volume"
  | "change"
  | "performance"
  | "frequency"
  | "recovery"
  | "priority"
  | "exercise";

export type AnatomyIntensitySample = {
  /** Normalized 0–1 exposure / emphasis. Ignored when `tone` is set for categorical modes. */
  intensity?: number;
  /** Categorical override for modes like performance / recovery. */
  tone?: "positive" | "neutral" | "warning" | "negative" | "mixed" | "inactive";
};

export type AnatomyColorResult = {
  fill: string;
  opacity: number;
};

const ELEVATED = "var(--mf-glass-elevated)";
const BRAND = "var(--mf-glass-brand)";
const WARNING = "var(--mf-glass-warning)";
const MUTED = "var(--mf-glass-text-muted)";

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Lime-family heatmap: higher intensity → deeper / stronger fill. */
function limeHeat(intensity: number): string {
  const ratio = clamp01(intensity);
  const lightness = 78 - ratio * 46;
  return `hsl(83 80% ${lightness}%)`;
}

/** Cyan-family delta heatmap (Change mode chart differentiation). */
function cyanHeat(intensity: number): string {
  const ratio = clamp01(intensity);
  const lightness = 78 - ratio * 46;
  return `hsl(190 80% ${lightness}%)`;
}

/**
 * Maps a mode + sample into fill/opacity for one muscle region.
 * Extensible: new modes plug in here without changing SVG geometry.
 */
export function resolveAnatomyColor(
  mode: AnatomyMapMode,
  sample: AnatomyIntensitySample | null | undefined,
): AnatomyColorResult {
  if (!sample) {
    return { fill: ELEVATED, opacity: 1 };
  }

  switch (mode) {
    case "anatomy":
      return { fill: ELEVATED, opacity: 1 };

    case "volume":
    case "frequency":
    case "priority":
      return {
        fill: limeHeat(sample.intensity ?? 0),
        opacity: 1,
      };

    case "change":
      return {
        fill: cyanHeat(sample.intensity ?? 0),
        opacity: 1,
      };

    case "recovery": {
      switch (sample.tone) {
        case "positive":
          return { fill: BRAND, opacity: 0.85 };
        case "warning":
          return { fill: WARNING, opacity: 0.75 };
        case "negative":
          return { fill: WARNING, opacity: 0.95 };
        case "mixed":
          return { fill: "hsl(35 60% 60%)", opacity: 0.8 };
        default:
          return { fill: ELEVATED, opacity: 1 };
      }
    }

    case "performance": {
      switch (sample.tone) {
        case "positive":
          return { fill: BRAND, opacity: 1 };
        case "neutral":
          return { fill: "hsl(190 40% 58%)", opacity: 1 };
        case "negative":
          return { fill: WARNING, opacity: 1 };
        case "mixed":
          return { fill: "hsl(35 60% 60%)", opacity: 1 };
        default:
          return { fill: ELEVATED, opacity: 1 };
      }
    }

    case "exercise":
      return {
        fill: BRAND,
        opacity: 0.35 + clamp01(sample.intensity ?? 0.5) * 0.6,
      };

    default:
      return { fill: MUTED, opacity: 0.4 };
  }
}

/** Selection / hover overlays — independent of data-layer fill. */
export const ANATOMY_INTERACTION = {
  selectedStroke: "var(--mf-glass-brand, #d8ff20)",
  selectedStrokeWidth: 2.25,
  hoverOpacityBoost: 0.12,
  dimmedOpacity: 0.32,
  idleOpacity: 1,
} as const;
