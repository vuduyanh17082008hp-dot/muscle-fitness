"use client";

import { useRef, type CSSProperties } from "react";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import styles from "@/components/experience/motion-home/styles/cosmic-core.module.css";

/** Deterministic — never Math.random() at render, to avoid SSR/CSR hydration drift. */
const STAR_FIELD: { x: number; y: number; r: number; delay: number; bright?: boolean }[] = [
  { x: 28, y: 24, r: 0.9, delay: 0 },
  { x: 62, y: 18, r: 0.6, delay: 1.4 },
  { x: 74, y: 36, r: 1.1, delay: 2.8, bright: true },
  { x: 40, y: 46, r: 0.5, delay: 0.6 },
  { x: 20, y: 58, r: 0.7, delay: 3.6 },
  { x: 56, y: 62, r: 0.9, delay: 2.1, bright: true },
  { x: 78, y: 60, r: 0.5, delay: 4.4 },
  { x: 34, y: 72, r: 0.6, delay: 1.9 },
  { x: 64, y: 78, r: 0.5, delay: 3.1 },
];

const ORBIT_PARTICLES: { size: number; duration: number; delay: number; rx: number; ry: number; trail?: boolean }[] = [
  { size: 3, duration: 14, delay: 0, rx: 62, ry: 30, trail: true },
  { size: 2, duration: 19, delay: -4, rx: 68, ry: 34 },
  { size: 2.5, duration: 23, delay: -11, rx: 58, ry: 27 },
];

/** "Data packets" emitted outward from the core — angle (deg) + travel distance (px), converted to a --tx/--ty translate below. Deterministic, no Math.random. */
const DATA_PACKET_DEFS: { angle: number; distance: number; duration: number; delay: number }[] = [
  { angle: -60, distance: 34, duration: 2.8, delay: 0 },
  { angle: 40, distance: 30, duration: 3.2, delay: 1.6 },
  { angle: 170, distance: 32, duration: 3, delay: 3.1 },
  { angle: 250, distance: 28, duration: 2.6, delay: 4.4 },
];

const DATA_PACKETS = DATA_PACKET_DEFS.map((packet) => {
  const rad = (packet.angle * Math.PI) / 180;
  return { ...packet, tx: Math.cos(rad) * packet.distance, ty: Math.sin(rad) * packet.distance };
});

/** Half-ellipse arc in a local 0..100 viewBox, split so a "top" and
 * "bottom" copy of the same ring can be painted either side of the
 * sphere for a Saturn-ring occlusion illusion (see ringLayer/ringLayerFront). */
function ellipseArc(rx: number, ry: number, half: "top" | "bottom") {
  const sweep = half === "top" ? 1 : 0;
  return `M ${50 - rx} 50 A ${rx} ${ry} 0 0 ${sweep} ${50 + rx} 50`;
}

/**
 * The ecosystem's central intelligence nucleus. Visual-only upgrade of
 * the previous flat gradient orb — layered gradients/SVG/CSS only, no
 * WebGL, no per-frame React state. Pointer tilt is a direct DOM style
 * mutation (same pattern as TiltCard), gated to fine-pointer + motion-ok.
 */
export function CosmicCore() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion, finePointer } = useMotionCapabilities();
  const pointerActive = finePointer && !reducedMotion;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerActive) return;
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    root.style.setProperty("--tilt-x", `${(px * 3).toFixed(2)}px`);
    root.style.setProperty("--tilt-y", `${(py * 3).toFixed(2)}px`);
  };

  const onPointerLeave = () => {
    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty("--tilt-x", "0px");
    root.style.setProperty("--tilt-y", "0px");
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`${styles.cosmicCore} relative z-10 grid size-[72px] place-items-center lg:size-[92px]`}
      data-cosmic-core
    >
      <div aria-hidden="true" className={reducedMotion ? "absolute inset-0 rounded-full opacity-40" : `absolute inset-0 rounded-full ${styles.atmosphereOuter}`} />
      <div aria-hidden="true" className={reducedMotion ? "absolute inset-0 rounded-full opacity-45" : `absolute inset-0 rounded-full ${styles.atmosphereInner}`} />

      <svg aria-hidden="true" viewBox="0 0 100 100" className={styles.ringLayer}>
        <path d={ellipseArc(48, 20, "top")} className={reducedMotion ? styles.ringPathStatic : styles.ringPathBack} />
      </svg>

      <div className={`${styles.sphere} ${reducedMotion ? "" : styles.sphereBreath}`}>
        <div className={styles.sphereBase} />
        <div aria-hidden="true" className={`${styles.nebulaLayer} ${reducedMotion ? "" : styles.nebulaA}`} />
        <div aria-hidden="true" className={`${styles.nebulaLayer} ${reducedMotion ? "" : styles.nebulaB}`} />

        <svg aria-hidden="true" viewBox="0 0 100 100" className={styles.filaments}>
          <path d="M20,60 C35,40 45,70 60,45 S80,30 85,50" className={reducedMotion ? styles.filamentStatic : styles.filamentAnim} />
          <path d="M15,35 C30,55 50,25 65,50 S82,65 88,42" className={reducedMotion ? styles.filamentStatic : styles.filamentAnimSlow} />
        </svg>

        <div aria-hidden="true" className={styles.starField}>
          {STAR_FIELD.map((star, i) => (
            <span
              key={i}
              className={`${styles.star} ${star.bright ? styles.starBright : ""} ${reducedMotion ? "" : styles.starTwinkle}`}
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.r * 2}px`,
                height: `${star.r * 2}px`,
                animationDelay: `${star.delay}s`,
              }}
            />
          ))}
        </div>

        <div aria-hidden="true" className={styles.terminator} />
        <div aria-hidden="true" className={styles.specular} />
        <div aria-hidden="true" className={`${styles.rim} ${reducedMotion ? "" : styles.eventPulse}`} />

        <span className={styles.coreLabel}>
          <span className={styles.coreLabelSmall}>Muscle Fitness</span>
          <span className={styles.coreLabelMain}>Core</span>
        </span>
      </div>

      <svg aria-hidden="true" viewBox="0 0 100 100" className={`${styles.ringLayer} ${styles.ringLayerFront}`}>
        <path d={ellipseArc(48, 20, "bottom")} className={reducedMotion ? styles.ringPathStatic : styles.ringPathFront} />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 100 100" className={`${styles.ringLayer} ${styles.ringLayerFront}`} style={{ inset: "-70%" }}>
        <ellipse cx="50" cy="50" rx="46" ry="14" transform="rotate(-8 50 50)" className={reducedMotion ? styles.ringPathStatic : styles.ringPathThin} />
      </svg>

      {!reducedMotion && (
        <div aria-hidden="true" className={styles.orbitField}>
          {ORBIT_PARTICLES.map((p, i) => (
            <span
              key={i}
              className={`${styles.orbitParticle} ${p.trail ? styles.orbitParticleTrail : ""}`}
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                offsetPath: `ellipse(${p.rx}% ${p.ry}% at 50% 50%)`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}

          {DATA_PACKETS.map((packet, i) => (
            <span
              key={i}
              className={styles.dataPacket}
              style={
                {
                  "--tx": `${packet.tx}px`,
                  "--ty": `${packet.ty}px`,
                  animationDuration: `${packet.duration}s`,
                  animationDelay: `${packet.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
