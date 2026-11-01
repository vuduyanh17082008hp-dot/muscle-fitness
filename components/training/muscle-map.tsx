"use client";

import { ANATOMY_COLOR, BodyFigure, type MuscleFills } from "@/components/training/anatomy/body-figure";
import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { cn } from "@/lib/cn";

/**
 * Compact front + back anatomical map coloured by involvement
 * (primary/secondary/stabilizer). Educational, not a medical illustration.
 * Muscle ids are the shared CanonicalMuscle taxonomy, so this map and the
 * training analytics always agree on naming.
 */

export type MuscleInvolvement = "primary" | "secondary" | "stabilizer";

export type MuscleMapHighlights = Partial<Record<CanonicalMuscle, MuscleInvolvement>>;

const INVOLVEMENT_OPACITY: Record<MuscleInvolvement, number> = {
  primary: 0.9,
  secondary: 0.5,
  stabilizer: 0.35,
};

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
  /** Set false to suppress the built-in per-muscle-name legend (e.g. when the caller renders its own swatch legend). */
  legend?: boolean;
  selectedMuscle?: CanonicalMuscle | null;
  /** Pointer shortcut only — callers must also offer an accessible list (see BodyFigure). */
  onSelectMuscle?: (muscle: CanonicalMuscle) => void;
  /** Overrides the primary/secondary highlight colour (default: the training accent). */
  accentColor?: string;
}) {
  const accent = accentColor ?? ANATOMY_COLOR.accent;
  const fills: MuscleFills = {};
  for (const [muscle, involvement] of Object.entries(highlights) as Array<[CanonicalMuscle, MuscleInvolvement]>) {
    fills[muscle] = {
      fill: involvement === "stabilizer" ? ANATOMY_COLOR.outline : accent,
      opacity: INVOLVEMENT_OPACITY[involvement],
    };
  }

  const legendEntries = Object.entries(highlights) as Array<[CanonicalMuscle, MuscleInvolvement]>;
  const summary = legendEntries.length
    ? legendEntries.map(([muscle, involvement]) => `${MUSCLE_DISPLAY_NAME[muscle]} (${involvement})`).join(", ")
    : "no muscles highlighted";

  return (
    <div className={cn("rounded-md border border-mf-glass-border p-4", className)}>
      <div className="grid grid-cols-2 gap-3">
        {(["front", "back"] as const).map((view) => (
          <figure key={view} className="mx-auto w-full max-w-[130px]">
            <BodyFigure
              view={view}
              fills={fills}
              selected={selectedMuscle ?? null}
              onSelect={onSelectMuscle}
              label={onSelectMuscle ? undefined : `${view === "front" ? "Front" : "Back"} muscle map: ${summary}`}
            />
            <figcaption className="mt-1 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-mf-glass-text-muted">
              {view === "front" ? "Front" : "Back"}
            </figcaption>
          </figure>
        ))}
      </div>

      {legend && legendEntries.length > 0 ? (
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-mf-glass-border pt-3">
          {legendEntries.map(([muscle, involvement]) => (
            <span key={muscle} className="flex items-center gap-1.5 text-[11px] font-semibold text-mf-glass-text-muted">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: involvement === "stabilizer" ? ANATOMY_COLOR.outline : accent, opacity: INVOLVEMENT_OPACITY[involvement] }}
              />
              {MUSCLE_DISPLAY_NAME[muscle]}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
