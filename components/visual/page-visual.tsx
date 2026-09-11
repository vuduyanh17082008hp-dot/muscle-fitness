import { CinematicBackground } from "@/components/visual/cinematic-background";
import { pageVisuals, type PageVisualKey } from "@/config/page-visuals";

type PageVisualProps = {
  page: PageVisualKey;
  className?: string;
  /** Force a lower-intensity treatment regardless of the page default (e.g. a compact header module). */
  intensity?: "secondary" | "prominent";
  glow?: boolean;
};

/**
 * Looks up a page's entry in config/page-visuals.ts and renders the
 * matching CinematicBackground. This is the single call site pages
 * should use — keeps per-page visual decisions centralized instead
 * of hardcoded across dozens of files.
 */
export function PageVisual({ page, className, intensity, glow }: PageVisualProps) {
  const config = pageVisuals[page];

  return (
    <CinematicBackground
      imageSrc={config.imageSrc}
      imageAlt={config.imageAlt}
      overlayVariant={config.overlayVariant}
      intensity={intensity ?? config.intensity}
      glow={glow}
      className={className}
    />
  );
}
