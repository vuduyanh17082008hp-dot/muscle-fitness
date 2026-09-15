"use client";

import type { KeyboardEvent } from "react";
import { motion } from "framer-motion";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import {
  BODY_SILHOUETTE,
  flattenMuscleRegions,
  type AnatomyView,
} from "@/lib/training/muscle-regions";
import { ANATOMY_INTERACTION } from "@/lib/training/anatomy-intensity";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { cn } from "@/lib/cn";

export type AnatomicalBodySvgProps = {
  view: AnatomyView;
  fillFor: (muscle: CanonicalMuscle) => string;
  opacityFor: (muscle: CanonicalMuscle) => number;
  ariaLabelFor: (muscle: CanonicalMuscle) => string;
  selectedMuscle?: CanonicalMuscle | null;
  hoveredMuscle?: CanonicalMuscle | null;
  onSelectMuscle?: (muscle: CanonicalMuscle) => void;
  onHoverMuscle?: (muscle: CanonicalMuscle | null) => void;
  className?: string;
  /** Larger maps for the Atlas; compact for dashboard card. */
  size?: "atlas" | "compact";
};

/**
 * Shared interactive SVG anatomy figure — front or back.
 * Geometry lives in lib/training/muscle-regions.ts; this component
 * only handles interaction + data-driven fill/opacity.
 */
export function AnatomicalBodySvg({
  view,
  fillFor,
  opacityFor,
  ariaLabelFor,
  selectedMuscle = null,
  hoveredMuscle = null,
  onSelectMuscle,
  onHoverMuscle,
  className,
  size = "atlas",
}: AnatomicalBodySvgProps) {
  const reduceMotion = useReducedMotion();
  const paths = flattenMuscleRegions(view);
  const interactive = Boolean(onSelectMuscle);

  return (
    <svg
      viewBox="0 0 200 400"
      role="img"
      aria-label={`${view === "front" ? "Front" : "Back"} muscle anatomy map`}
      className={cn(
        "mx-auto w-full",
        size === "atlas" ? "max-w-[280px] sm:max-w-[300px]" : "max-w-[140px]",
        className,
      )}
    >
      {/* Soft ground glow */}
      <ellipse cx="100" cy="388" rx="48" ry="6" fill="rgba(255,255,255,0.04)" />

      {/* Human silhouette underlay */}
      <path
        d={BODY_SILHOUETTE[view]}
        fill="rgba(255,255,255,0.035)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1.25}
        strokeLinejoin="round"
      />

      {paths.map((region) => {
        const isSelected = region.muscle === selectedMuscle;
        const isHovered = region.muscle === hoveredMuscle;
        const baseOpacity = opacityFor(region.muscle);
        const opacity = Math.min(
          1,
          baseOpacity + (isHovered && !isSelected ? ANATOMY_INTERACTION.hoverOpacityBoost : 0),
        );
        const fill = fillFor(region.muscle);
        const key = `${view}-${region.muscle}-${region.pathIndex}`;

        const handleSelect = () => onSelectMuscle?.(region.muscle);

        const interactionProps = interactive
          ? {
              tabIndex: region.pathIndex === 0 ? 0 : -1,
              role: "button" as const,
              "aria-label": ariaLabelFor(region.muscle),
              "aria-pressed": isSelected,
              onClick: handleSelect,
              onKeyDown: (event: KeyboardEvent<SVGPathElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelect();
                }
              },
              onMouseEnter: () => onHoverMuscle?.(region.muscle),
              onMouseLeave: () => onHoverMuscle?.(null),
              onFocus: () => onHoverMuscle?.(region.muscle),
              onBlur: () => onHoverMuscle?.(null),
              className:
                "cursor-pointer outline-none focus-visible:stroke-[var(--mf-glass-brand)]",
            }
          : {};

        return (
          <motion.path
            key={key}
            d={region.d}
            fill={fill}
            stroke={
              isSelected
                ? ANATOMY_INTERACTION.selectedStroke
                : isHovered
                  ? "rgba(216,255,32,0.45)"
                  : "rgba(255,255,255,0.08)"
            }
            style={{
              strokeWidth: isSelected
                ? ANATOMY_INTERACTION.selectedStrokeWidth
                : isHovered
                  ? 1.75
                  : 1,
              transformOrigin: "center",
            }}
            initial={false}
            animate={{
              opacity,
              scale: isSelected ? 1.015 : 1,
            }}
            transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
            {...interactionProps}
          />
        );
      })}
    </svg>
  );
}

/** Compact non-motion helper for SSR-friendly dashboard cards when framer isn't needed. */
export function AnatomicalBodyStatic({
  view,
  fillFor,
  opacityFor,
  selectedMuscle = null,
  onSelectMuscle,
  className,
}: {
  view: AnatomyView;
  fillFor: (muscle: CanonicalMuscle) => string;
  opacityFor: (muscle: CanonicalMuscle) => number;
  selectedMuscle?: CanonicalMuscle | null;
  onSelectMuscle?: (muscle: CanonicalMuscle) => void;
  className?: string;
}) {
  const paths = flattenMuscleRegions(view);
  const interactive = Boolean(onSelectMuscle);

  return (
    <svg
      viewBox="0 0 200 400"
      role="img"
      aria-label={`${view === "front" ? "Front" : "Back"} muscle anatomy map`}
      className={cn("mx-auto h-48 w-full max-w-[120px]", className)}
    >
      <path
        d={BODY_SILHOUETTE[view]}
        fill="rgba(255,255,255,0.035)"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1.25}
        strokeLinejoin="round"
      />

      {paths.map((region) => {
        const isSelected = region.muscle === selectedMuscle;
        const handleSelect = () => onSelectMuscle?.(region.muscle);

        return (
          <path
            key={`${view}-${region.muscle}-${region.pathIndex}`}
            d={region.d}
            fill={fillFor(region.muscle)}
            opacity={opacityFor(region.muscle)}
            stroke={
              isSelected ? ANATOMY_INTERACTION.selectedStroke : "rgba(255,255,255,0.08)"
            }
            strokeWidth={isSelected ? ANATOMY_INTERACTION.selectedStrokeWidth : 1}
            className={interactive ? "cursor-pointer" : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive && region.pathIndex === 0 ? 0 : undefined}
            aria-label={
              interactive
                ? `${MUSCLE_DISPLAY_NAME[region.muscle]}${isSelected ? ", selected" : ""}`
                : undefined
            }
            aria-pressed={interactive ? isSelected : undefined}
            onClick={interactive ? handleSelect : undefined}
            onKeyDown={
              interactive
                ? (event: KeyboardEvent<SVGPathElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelect();
                    }
                  }
                : undefined
            }
          />
        );
      })}
    </svg>
  );
}
