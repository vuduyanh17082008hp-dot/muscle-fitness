"use client";

import { useState } from "react";
import Image from "next/image";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

/**
 * The supplied intro artwork. Referenced by path rather than imported
 * so a missing file degrades at runtime instead of breaking the build —
 * drop the asset in at this exact path and it renders with no code
 * change.
 */
export const DANTE_HERO_SRC = "/images/dante-hero.png";

const DANTE_HERO_ALT =
  "Dante, the Muscle Fitness performance coach, lit from the side against a dark background";

/**
 * Left-hand visual for the intro: ambient glow layers, the Dante
 * artwork, and edge blending so the image dissolves into the page
 * instead of sitting in a visible rectangle.
 *
 * If the artwork is unavailable the component falls back to a
 * procedural amber/cyan composition — the intro's copy and CTAs are
 * never dependent on the image loading.
 */
export function DanteIntroVisual() {
  const [artworkFailed, setArtworkFailed] = useState(false);

  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-[min(30rem,84vw)] sm:max-w-[26rem] lg:max-w-none">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className={`${styles.introGlowWarm} absolute left-[6%] top-[12%] h-[70%] w-[78%] rounded-full`} />
        <div className={`${styles.introGlowCool} absolute bottom-[10%] right-[4%] h-[42%] w-[52%] rounded-full`} />
      </div>

      {artworkFailed ? (
        <DanteArtworkFallback />
      ) : (
        <div className={`${styles.introArtMask} absolute inset-0`}>
          <Image
            src={DANTE_HERO_SRC}
            alt={DANTE_HERO_ALT}
            fill
            priority
            sizes="(min-width: 1024px) 46vw, 88vw"
            className="object-contain object-bottom"
            onError={() => setArtworkFailed(true)}
          />
        </div>
      )}

      {/* Blend the bottom edge into the page so the art never reads as a pasted rectangle. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[var(--mf-pub-bg)] to-transparent"
      />
    </div>
  );
}

/**
 * Procedural stand-in used only when the artwork is absent. Abstract
 * on purpose — it suggests Dante's presence without pretending to be
 * the real mascot.
 */
function DanteArtworkFallback() {
  return (
    <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
      <div className={`${styles.introFallbackCore} relative aspect-square w-[62%] rounded-full`}>
        <span className="absolute inset-[14%] rounded-full border border-[var(--mf-brand)]/25" />
        <span className="absolute inset-[28%] rounded-full border border-[var(--mf-brand)]/15" />
        <span className="absolute inset-[42%] rounded-full border border-white/10" />
      </div>
    </div>
  );
}
