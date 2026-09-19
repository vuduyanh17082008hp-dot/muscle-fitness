"use client";

import { useId, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import { CosmicCore } from "@/components/experience/motion-home/hero/CosmicCore";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";
import coreStyles from "@/components/experience/motion-home/styles/cosmic-core.module.css";
import type { HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

type Tier = "primary" | "secondary";

type ModuleDef = {
  id: string;
  label: string;
  value: string;
  status: string;
  angle: number; // Initial position angle in degrees (index * 45deg)
  accentVar: string;
  tier: Tier;
};

type Module = ModuleDef & { href: string };

/** Viewbox half-extent for SVG coordinates — matches container scale. */
const HALF = 280;
const ORBIT_RADIUS_SVG = 195;

/** 8 Satellites evenly spaced at 45-degree intervals along the single circular orbit path */
const MODULE_DEFS: ModuleDef[] = [
  { id: "muscle", label: "Muscle Intel", value: "Chest", status: "Active", angle: 0, accentVar: "--mf-brand", tier: "primary" },
  { id: "training", label: "Training", value: "Push", status: "Today", angle: 45, accentVar: "--mf-brand", tier: "secondary" },
  { id: "nutrition", label: "Nutrition", value: "154 g", status: "Protein", angle: 90, accentVar: "--mf-brand", tier: "primary" },
  { id: "adapt", label: "Adapt", value: "Session", status: "Updated", angle: 135, accentVar: "--mf-brand", tier: "primary" },
  { id: "dante", label: "Dante", value: "AI Coach", status: "Online", angle: 180, accentVar: "--mf-violet", tier: "primary" },
  { id: "checkin", label: "Check-in", value: "Week 08", status: "Ready", angle: 225, accentVar: "--mf-violet", tier: "secondary" },
  { id: "progress", label: "Progress", value: "+14.7%", status: "Strength", angle: 270, accentVar: "--mf-cyan", tier: "secondary" },
  { id: "recovery", label: "Recovery", value: "87", status: "Readiness", angle: 315, accentVar: "--mf-violet", tier: "secondary" },
];

function moduleList(routes: HomepageRoutes): Module[] {
  const hrefs: Record<string, string> = {
    recovery: routes.recovery,
    muscle: routes.muscleIntelligence,
    training: routes.training,
    adapt: "#adapt",
    progress: routes.progress,
    dante: routes.chatbot,
    checkin: routes.recovery,
    nutrition: routes.nutrition,
  };

  return MODULE_DEFS.map((mod) => ({ ...mod, href: hrefs[mod.id] }));
}

/** Calculate SVG endpoint coordinates for a node given radius & initial angle (0deg = top). */
function getSvgPoint(radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * radius,
    y: -Math.cos(rad) * radius,
  };
}

/**
 * Muscle Fitness Core — Single Coplanar Orbit System (Solar System Style).
 *
 * All 8 Satellite Nodes orbit along a single shared circular track (R = 195px)
 * evenly spaced at 45-degree intervals.
 *
 * Absolute Upright Orientation: Decoupled nested wrappers cancel track rotation
 * and initial position offsets so typography & metric cards remain permanently level,
 * vertical, and 100% readable at all 360 degrees.
 */
export function Ecosystem({ routes }: { routes: HomepageRoutes }) {
  const [active, setActive] = useState<string | null>(null);
  const gradientId = useId();
  const connectorGradientId = useId();
  const { reducedMotion } = useMotionCapabilities();
  const modules = moduleList(routes);

  return (
    <div
      className={`ecosystem ${coreStyles.ecosystemRoot} relative mx-auto flex aspect-square w-full max-w-[320px] sm:max-w-[400px] md:max-w-[500px] lg:max-w-[580px] xl:max-w-[640px] items-center justify-center`}
      data-ecosystem-root
    >
      {/* SVG CONNECTORS, SINGLE ORBIT CIRCLE & ENERGY PULSES LAYER */}
      <svg
        viewBox={`-${HALF} -${HALF} ${HALF * 2} ${HALF * 2}`}
        className="absolute inset-0 h-full w-full overflow-visible pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--mf-brand)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--mf-brand)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={connectorGradientId} cx="0" cy="0" r={HALF} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--mf-brand)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--mf-brand)" stopOpacity="0.1" />
          </radialGradient>
        </defs>

        {/* Subtle Single Circular Track Ring (R=195) */}
        <circle
          r={ORBIT_RADIUS_SVG}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="1"
          strokeDasharray="3 6"
        />

        {/* Unified Orbiting SVG Group (Connectors & Energy Pulses) */}
        <g
          className={reducedMotion ? "" : coreStyles.unifiedTrack}
          style={{ transformOrigin: "0px 0px" }}
        >
          {modules.map((mod) => {
            const pt = getSvgPoint(ORBIT_RADIUS_SVG, mod.angle);
            const isActive = active === mod.id;

            return (
              <g key={mod.id} className={mod.tier === "secondary" ? "hidden lg:block" : ""}>
                {/* Radial Connector Line */}
                <line
                  x1={0}
                  y1={0}
                  x2={pt.x}
                  y2={pt.y}
                  stroke={isActive ? `var(${mod.accentVar})` : `url(#${connectorGradientId})`}
                  strokeWidth={isActive ? 2 : 1}
                  strokeDasharray={reducedMotion || isActive ? undefined : "3 7"}
                  style={{ transition: "stroke 0.25s ease, stroke-width 0.25s ease" }}
                />
                {/* Incoming Energy Pulse Dot (towards core) */}
                {!reducedMotion && (
                  <circle
                    r={isActive ? 3.5 : 2.5}
                    fill={`var(${mod.accentVar})`}
                    className={coreStyles.signalPulseToCore}
                    style={
                      {
                        "--tx": `${pt.x}px`,
                        "--ty": `${pt.y}px`,
                        animationDelay: `${((mod.angle % 180) / 180) * 2.8}s`,
                      } as CSSProperties
                    }
                  />
                )}
              </g>
            );
          })}
        </g>

        <circle r={50} fill={`url(#${gradientId})`} />
      </svg>

      {/* CORE — Cosmic Intelligence Nucleus */}
      <CosmicCore />

      {/* SATELLITE NODES HTML LAYER (Unified Orbit + True Counter-Rotation) */}
      <div
        className={`absolute inset-0 pointer-events-none ${reducedMotion ? "" : coreStyles.unifiedTrack}`}
      >
        {modules.map((mod) => {
          const isActive = active === mod.id;

          return (
            /* Initial Angle Offset */
            <div
              key={mod.id}
              className="absolute left-1/2 top-1/2 pointer-events-none"
              style={{ transform: `rotate(${mod.angle}deg)` }}
            >
              {/* Radial Distance Translation */}
              <div
                className="pointer-events-none"
                style={{ transform: `translateY(calc(-1 * var(--r)))` }}
              >
                {/* Cancel Initial Angle */}
                <div
                  className="pointer-events-none"
                  style={{ transform: `rotate(${-mod.angle}deg)` }}
                >
                  {/* Cancel Track Rotation (Unified Counter Spin Animation) */}
                  <div
                    className={`pointer-events-auto ${reducedMotion ? "" : coreStyles.unifiedCounter}`}
                  >
                    <Link
                      href={mod.href}
                      onPointerEnter={() => setActive(mod.id)}
                      onPointerLeave={() => setActive((cur) => (cur === mod.id ? null : cur))}
                      onFocus={() => setActive(mod.id)}
                      onBlur={() => setActive((cur) => (cur === mod.id ? null : cur))}
                      data-ecosystem-node
                      className={`ecosystem-node relative block w-[88px] sm:w-[96px] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-2 py-1.5 text-left ${
                        mod.tier === "secondary" ? "hidden lg:block" : ""
                      }`}
                      style={{
                        borderColor: isActive ? `var(${mod.accentVar})` : "rgba(255,255,255,0.14)",
                        background: isActive
                          ? `color-mix(in srgb, var(${mod.accentVar}) 16%, rgba(5,5,5,0.88))`
                          : "rgba(5,5,5,0.65)",
                        backdropFilter: "blur(8px)",
                        boxShadow: isActive
                          ? `0 0 20px color-mix(in srgb, var(${mod.accentVar}) 35%, transparent)`
                          : "0 4px 12px rgba(0,0,0,0.4)",
                        transition: "border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease",
                      }}
                    >
                      {/* Left accent bar */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-[18%] left-0 w-[2.5px] rounded-full"
                        style={{ background: `var(${mod.accentVar})`, opacity: isActive ? 1 : 0.75 }}
                      />
                      {/* Pulsing status dot */}
                      <span
                        aria-hidden="true"
                        className={`absolute right-2 top-2 size-[4.5px] rounded-full ${reducedMotion ? "" : styles.pulseDot}`}
                        style={{ background: `var(${mod.accentVar})`, boxShadow: `0 0 6px var(${mod.accentVar})` }}
                      />

                      <p
                        className="pl-1 text-[7.5px] font-black uppercase leading-none tracking-[0.1em]"
                        style={{ color: isActive ? `var(${mod.accentVar})` : "var(--mf-pub-text-muted)" }}
                      >
                        {mod.label}
                      </p>
                      <p className="mt-0.5 pl-1 text-[10.5px] font-bold leading-tight text-[var(--mf-pub-text)]">{mod.value}</p>
                      <p
                        className="mt-0.5 pl-1 text-[7px] font-black uppercase leading-none tracking-[0.1em]"
                        style={{ color: `var(${mod.accentVar})` }}
                      >
                        {mod.status}
                      </p>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Restrained Explanatory Cue */}
      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-center lg:hidden">
        <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--mf-pub-text-muted)] backdrop-blur-md">
          8 connected systems
        </span>
      </div>
    </div>
  );
}
