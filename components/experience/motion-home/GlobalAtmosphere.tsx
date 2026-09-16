import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

/**
 * Global 80px technical grid + film grain, fixed behind all chapter
 * content (spec #16-17). Grain is a tiny tiled SVG turbulence data URI —
 * no raster image asset needed. Purely decorative: aria-hidden.
 */
export function GlobalAtmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <div className={styles.globalGrid} />
      <div className={styles.globalGrain} />
    </div>
  );
}
