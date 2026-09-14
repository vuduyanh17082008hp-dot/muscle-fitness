import { DanteRobot, type DanteRobotProps } from "@/components/dante/dante-robot";

/**
 * Canonical Dante mascot — the ONE approved visual identity (dark
 * shell, violet accent, coded SVG, no raster asset). Marketing
 * placements (First Rep, Dante hero moments) should render this
 * rather than re-implementing sizing/aria defaults per call site.
 *
 * The old brown/bronze 3D placeholder figure (components/dante-avatar/,
 * a Three.js primitive-geometry humanoid) has been removed — this is
 * its replacement everywhere the mascot appears in marketing copy.
 */
export function DanteMascot({
  size = "hero",
  state = "idle",
  ariaLabel = "Dante, the Muscle Fitness performance coach",
  interactive = false,
  className,
  onClick,
}: DanteRobotProps) {
  return (
    <DanteRobot
      state={state}
      size={size}
      interactive={interactive}
      ariaLabel={ariaLabel}
      className={className}
      onClick={onClick}
    />
  );
}

export default DanteMascot;
