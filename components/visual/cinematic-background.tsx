"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

import { VisualOverlay, type VisualOverlayVariant } from "@/components/visual/visual-overlay";

export type CinematicBackgroundProps = {
  /** Real generated asset path under /public/visuals — omit until the asset exists (see docs/AI_VISUAL_PROMPTS.md). */
  imageSrc?: string;
  imageAlt?: string;
  overlayVariant?: VisualOverlayVariant;
  /** How visible the image layer is allowed to be. Dashboard pages should stay "secondary". */
  intensity?: "secondary" | "prominent";
  glow?: boolean;
  className?: string;
};

/**
 * The five-layer background stack from docs/VISUAL_SYSTEM.md:
 *   1. dark base
 *   2. page-specific image (optional — falls back to a procedural
 *      gradient composition when no real asset has been generated yet)
 *   3. gradient mask (readability guarantee)
 *   4. technical/data overlay
 *   5. optional amber glow (breathing, reduced-motion aware)
 *
 * Never crashes or shows a broken-image icon when `imageSrc` is
 * omitted — this is the safe fallback path required when no real
 * photography exists yet.
 */
export function CinematicBackground({
  imageSrc,
  imageAlt = "",
  overlayVariant = "grid",
  intensity = "secondary",
  glow = true,
  className = "",
}: CinematicBackgroundProps) {
  const reduceMotion = useReducedMotion();
  const imageOpacity = intensity === "prominent" ? "opacity-45 sm:opacity-60" : "opacity-25 sm:opacity-35";

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* 1. dark base */}
      <div className="absolute inset-0 bg-[#050505]" />

      {/* 2. page-specific image OR procedural fallback */}
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          sizes="100vw"
          className={`object-cover ${imageOpacity}`}
          priority={false}
        />
      ) : (
        <div
          className={`absolute inset-0 ${imageOpacity}`}
          style={{
            background:
              "radial-gradient(circle at 78% 30%, rgba(184,115,51,0.22), transparent 45%), radial-gradient(circle at 30% 80%, rgba(255,255,255,0.05), transparent 50%)",
          }}
        />
      )}

      {/* 3. gradient mask — content always stays readable */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-[#050505]/40" />

      {/* 4. technical / data overlay */}
      <VisualOverlay variant={overlayVariant} className="opacity-70" />

      {/* 5. optional amber glow, breathing slowly */}
      {glow ? (
        <motion.div
          className="absolute -right-24 top-1/4 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(184,115,51,0.28), transparent 70%)" }}
          animate={
            reduceMotion
              ? undefined
              : { opacity: [0.5, 0.85, 0.5] }
          }
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
    </div>
  );
}
