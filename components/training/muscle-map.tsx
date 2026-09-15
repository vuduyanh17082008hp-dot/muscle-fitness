"use client";

import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import { ANATOMY_INTERACTION } from "@/lib/training/anatomy-intensity";
import { AnatomicalBodyStatic } from "@/components/training/muscle-map/AnatomicalBodySvg";
import { cn } from "@/lib/cn";

/**
 * Compact dashboard anatomical muscle map — front + back, shared
 * geometry with the Muscle Intelligence Atlas (muscle-regions.ts).
 * Educational/schematic stylized anatomy, not a medical illustration.
 */

export type MuscleInvolvement = "primary" | "secondary" | "stabilizer";

export type MuscleMapHighlights = Partial<Record<CanonicalMuscle, MuscleInvolvement>>;

/**
 * Ocean Sunset anatomy convention (spec: "Primary muscle: strong
 * sunset highlight. Secondary: lower-opacity accent. Inactive
 * anatomy: ocean/slate."). Primary and secondary share the SAME
 * sunset hue — the distinction is opacity/strength, not a second
 * competing color — and stabilizers fall back to a quiet ocean-slate
 * tone rather than an arbitrary blue.
 */
const INVOLVEMENT_FILL: Record<MuscleInvolvement, string> = {
  primary: "var(--color-domain-training)",
  secondary: "var(--color-domain-training)",
  stabilizer: "var(--mf-text-muted)",
};

const INVOLVEMENT_OPACITY: Record<MuscleInvolvement, number> = {
  primary: 0.85,
  secondary: 0.4,
  stabilizer: 0.3,
};

const IDLE_FILL = "rgba(255,255,255,0.08)";
const IDLE_OPACITY = 0.55;

export function MuscleMap({
  highlights,
  className,
  legend = true,
  selectedMuscle,
  onSelectMuscle,
  accentColor,
}: {
  highlights: MuscleMapHighlights;
  className?: string;
  /** Set false to suppress the built-in per-muscle-name legend (e.g. when the caller renders its own High/Moderate/Low swatch legend instead). */
  legend?: boolean;
  selectedMuscle?: CanonicalMuscle | null;
  onSelectMuscle?: (muscle: CanonicalMuscle) => void;
  /** Overrides the primary/secondary highlight color (default: the Ocean Sunset training accent) — e.g. the Dashboard's Performance Glass lime. */
  accentColor?: string;
}) {
  const legendEntries = Object.entries(highlights) as Array<[CanonicalMuscle, MuscleInvolvement]>;

  function fillFor(muscle: CanonicalMuscle): string {
    const involvement = highlights[muscle];
    if (!involvement) return IDLE_FILL;
    if (involvement === "stabilizer") return INVOLVEMENT_FILL.stabilizer;
    return accentColor ?? INVOLVEMENT_FILL[involvement];
  }

  function opacityFor(muscle: CanonicalMuscle): number {
    const involvement = highlights[muscle];
    if (!involvement) {
      if (selectedMuscle && muscle !== selectedMuscle) return ANATOMY_INTERACTION.dimmedOpacity;
      return IDLE_OPACITY;
    }

    const base = INVOLVEMENT_OPACITY[involvement];
    if (selectedMuscle && muscle !== selectedMuscle) {
      return Math.min(base, ANATOMY_INTERACTION.dimmedOpacity);
    }
    return base;
  }

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/20 p-4", className)}>
      <div className="grid grid-cols-2 gap-3">
        <figure>
          <AnatomicalBodyStatic
            view="front"
            fillFor={fillFor}
            opacityFor={opacityFor}
            selectedMuscle={selectedMuscle}
            onSelectMuscle={onSelectMuscle}
          />
          <figcaption className="mt-1 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            Front
          </figcaption>
        </figure>

        <figure>
          <AnatomicalBodyStatic
            view="back"
            fillFor={fillFor}
            opacityFor={opacityFor}
            selectedMuscle={selectedMuscle}
            onSelectMuscle={onSelectMuscle}
          />
          <figcaption className="mt-1 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600">
            Back
          </figcaption>
        </figure>
      </div>

      {legend && legendEntries.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-3">
          {legendEntries.map(([muscle, involvement]) => (
            <span key={muscle} className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500">
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor:
                    involvement === "stabilizer"
                      ? INVOLVEMENT_FILL.stabilizer
                      : (accentColor ?? INVOLVEMENT_FILL[involvement]),
                  opacity: INVOLVEMENT_OPACITY[involvement],
                }}
              />
              {MUSCLE_DISPLAY_NAME[muscle]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
