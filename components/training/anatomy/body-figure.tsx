"use client";

import { useState } from "react";

import { BACK_ATLAS, BACK_SILHOUETTE, FRONT_ATLAS, FRONT_SILHOUETTE } from "@/lib/training/anatomy/atlas-geometry";
import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { cn } from "@/lib/cn";

/**
 * The one anatomical body renderer (front or back), shared by Muscle Intelligence,
 * the Today card and exercise technique panels. Geometry: lib/training/anatomy/.
 *
 * Pointer selection is an enhancement only. The SVG is aria-hidden and its regions
 * are never focusable; every caller that lets you select a muscle also renders a
 * real button list, so keyboard and screen-reader users get the same function
 * without small, nested tap targets.
 */

export type MuscleFill = { fill: string; opacity?: number };
export type MuscleFills = Partial<Record<CanonicalMuscle, MuscleFill>>;

export const ANATOMY_COLOR = {
  body: "var(--mf-glass-bg-deep)",
  outline: "var(--mf-glass-text-muted)",
  idle: "color-mix(in srgb, var(--mf-glass-text-muted) 24%, var(--mf-glass-bg-deep))",
  edge: "color-mix(in srgb, var(--mf-glass-text-muted) 55%, transparent)",
  accent: "var(--mf-training, var(--mf-glass-brand))",
  selected: "var(--mf-glass-brand)",
  ink: "var(--mf-glass-text)",
} as const;

const VIEWS = {
  front: { pieces: FRONT_ATLAS, silhouette: FRONT_SILHOUETTE },
  back: { pieces: BACK_ATLAS, silhouette: BACK_SILHOUETTE },
} as const;

export type BodyFigureProps = {
  view: "front" | "back";
  fills?: MuscleFills;
  selected?: CanonicalMuscle | null;
  onSelect?: (muscle: CanonicalMuscle) => void;
  /** When set, the SVG is exposed as one labelled image (no interactive children). Otherwise aria-hidden. */
  label?: string;
  className?: string;
};

export function BodyFigure({ view, fills = {}, selected = null, onSelect, label, className }: BodyFigureProps) {
  const [hovered, setHovered] = useState<CanonicalMuscle | null>(null);
  const { pieces, silhouette } = VIEWS[view];

  return (
    <svg
      viewBox="-3 -3 106 206"
      className={cn("block h-auto w-full select-none", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      focusable="false"
      onPointerLeave={() => setHovered(null)}
    >
      <path d={silhouette} fillRule="evenodd" fill={ANATOMY_COLOR.body} stroke={ANATOMY_COLOR.outline} strokeWidth={0.6} strokeLinejoin="round" />

      {pieces.map((piece) => {
        if (piece.muscle === null) {
          return <path key={piece.id} d={piece.d} fill="none" stroke={ANATOMY_COLOR.edge} strokeWidth={0.25} />;
        }

        const muscle = piece.muscle;
        const isSelected = muscle === selected;
        const isHovered = muscle === hovered && Boolean(onSelect);
        const custom = fills[muscle];
        const fill = isSelected && !custom ? ANATOMY_COLOR.selected : (custom?.fill ?? ANATOMY_COLOR.idle);

        return (
          <path
            key={piece.id}
            d={piece.d}
            data-muscle={muscle}
            fill={fill}
            fillOpacity={custom?.opacity ?? 1}
            stroke={isSelected || isHovered ? ANATOMY_COLOR.ink : ANATOMY_COLOR.edge}
            strokeWidth={isSelected ? 1.1 : isHovered ? 0.8 : 0.3}
            strokeLinejoin="round"
            className={cn(
              "transition-[fill,fill-opacity,stroke-width] duration-200 motion-reduce:transition-none",
              onSelect && "cursor-pointer",
            )}
            onPointerEnter={onSelect ? () => setHovered(muscle) : undefined}
            onClick={onSelect ? () => onSelect(muscle) : undefined}
          >
            {onSelect ? <title>{MUSCLE_DISPLAY_NAME[muscle]}</title> : null}
          </path>
        );
      })}
    </svg>
  );
}
