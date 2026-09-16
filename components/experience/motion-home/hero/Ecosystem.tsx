"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import { CosmicCore } from "@/components/experience/motion-home/hero/CosmicCore";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";
import type { HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

type Tier = "primary" | "secondary";

type ModuleDef = {
  id: string;
  label: string;
  value: string;
  status: string;
  /** Offset from center, as a percentage of the container's half-width/height — canonical compass layout (N/NE/E/SE/S/SW/W/NW). */
  xPct: number;
  yPct: number;
  accentVar: string;
  tier: Tier;
};

type Module = ModuleDef & { href: string };

/** Viewbox half-extent — matches the container's half-width/height 1:1, so a module's xPct/yPct (percent-of-half-extent) converts to SVG units by a single scale factor below. */
const HALF = 200;

/** Compass positions — top-left/top-center/top-right/middle-right/bottom-right/bottom-center/bottom-left/middle-left, per the canonical ecosystem spec. Cardinal (N/E/S/W) modules stay visible at every breakpoint; corner (NE/SE/SW/NW) modules are lg+ only, to avoid crowding smaller screens. */
const MODULE_DEFS: ModuleDef[] = [
  { id: "recovery", label: "Recovery", value: "87", status: "Readiness", xPct: -36, yPct: -42, accentVar: "--mf-violet", tier: "secondary" },
  { id: "muscle", label: "Muscle Intel", value: "Chest", status: "Active", xPct: 0, yPct: -50, accentVar: "--mf-brand", tier: "primary" },
  { id: "training", label: "Training", value: "Push", status: "Today", xPct: 36, yPct: -42, accentVar: "--mf-brand", tier: "secondary" },
  { id: "adapt", label: "Adapt", value: "Session", status: "Updated", xPct: 50, yPct: 0, accentVar: "--mf-brand", tier: "primary" },
  { id: "progress", label: "Progress", value: "+14.7%", status: "Strength", xPct: 36, yPct: 42, accentVar: "--mf-cyan", tier: "secondary" },
  { id: "dante", label: "Dante", value: "AI Coach", status: "Online", xPct: 0, yPct: 50, accentVar: "--mf-violet", tier: "primary" },
  { id: "checkin", label: "Check-in", value: "Week 08", status: "Ready", xPct: -36, yPct: 42, accentVar: "--mf-violet", tier: "secondary" },
  { id: "nutrition", label: "Nutrition", value: "154 g", status: "Protein", xPct: -50, yPct: 0, accentVar: "--mf-brand", tier: "primary" },
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

/** percent-of-half-extent -> SVG viewBox units (viewBox half-extent === HALF, so this is a 1:1 linear scale). */
function svgUnits(pct: number) {
  return (pct / 50) * HALF;
}

/**
 * Hero ecosystem visualization — the Muscle Fitness "operating system"
 * core, with training/recovery/nutrition/progress/Dante/check-in nodes
 * orbiting it in the canonical compass layout.
 *
 * EXPLICIT, PERMANENT RULE: nodes never translate, scale, rotate, or
 * otherwise move on hover/pointer input. Hover may only change node
 * state (fill/border), connector opacity, and the dock label — never
 * position. Do not add cursor-follow, magnetic, or spring behavior.
 * Ambient (non-hover) rotation of the background rings is fine — it's
 * time-based, not interaction-driven, and never touches node position.
 */
export function Ecosystem({ routes }: { routes: HomepageRoutes }) {
  const [active, setActive] = useState<string | null>(null);
  const gradientId = useId();
  const connectorGradientId = useId();
  const { reducedMotion } = useMotionCapabilities();
  const modules = moduleList(routes);

  return (
    <div
      className="ecosystem relative mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center sm:max-w-[340px] lg:max-w-[520px] xl:max-w-[580px]"
      data-ecosystem-root
    >
      <svg
        viewBox={`-${HALF} -${HALF} ${HALF * 2} ${HALF * 2}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--mf-brand)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--mf-brand)" stopOpacity="0" />
          </radialGradient>
          {/* Connector base stroke — lime-to-transparent, radiating from the core, shared by every line since they all originate at the same center point. */}
          <radialGradient id={connectorGradientId} cx="0" cy="0" r={HALF + 40} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--mf-brand)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--mf-brand)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle r={60} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        <circle
          r={140}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1"
          className={reducedMotion ? "" : styles.heroOrbRingA}
          style={{ transformOrigin: "0px 0px" }}
        />
        <circle
          r={HALF - 5}
          fill="none"
          stroke="var(--mf-brand-border)"
          strokeWidth="1"
          strokeDasharray="2 10"
          className={`hidden lg:block ${reducedMotion ? "" : styles.heroOrbRingC}`}
          style={{ transformOrigin: "0px 0px" }}
        />

        {modules.map((mod) => {
          const x = svgUnits(mod.xPct);
          const y = svgUnits(mod.yPct);
          const isActive = active === mod.id;

          return (
            <line
              key={mod.id}
              x1={0}
              y1={0}
              x2={x}
              y2={y}
              className={`ecosystem-connector ${mod.tier === "secondary" ? "hidden lg:block" : ""}`}
              stroke={isActive ? `var(${mod.accentVar})` : `url(#${connectorGradientId})`}
              strokeWidth={isActive ? 1.5 : 1}
              strokeDasharray={reducedMotion ? undefined : "3 7"}
              style={{
                transition: "stroke 0.25s ease, stroke-width 0.25s ease",
                animation: reducedMotion ? undefined : "ecosystem-signal 2.4s linear infinite",
              }}
            />
          );
        })}

        <circle r={40} fill={`url(#${gradientId})`} />
      </svg>

      {/* CORE — cosmic intelligence nucleus (components/experience/motion-home/hero/CosmicCore.tsx). */}
      <CosmicCore />

      {modules.map((mod) => {
        const isActive = active === mod.id;

        return (
          <Link
            key={mod.id}
            href={mod.href}
            onPointerEnter={() => setActive(mod.id)}
            onPointerLeave={() => setActive((cur) => (cur === mod.id ? null : cur))}
            onFocus={() => setActive(mod.id)}
            onBlur={() => setActive((cur) => (cur === mod.id ? null : cur))}
            data-ecosystem-node
            className={`ecosystem-node absolute w-[96px] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-2 text-left ${
              mod.tier === "secondary" ? "hidden lg:block" : ""
            }`}
            style={{
              left: `calc(50% + ${mod.xPct}%)`,
              top: `calc(50% + ${mod.yPct}%)`,
              borderColor: isActive ? `var(${mod.accentVar})` : "rgba(255,255,255,0.14)",
              background: isActive ? `color-mix(in srgb, var(${mod.accentVar}) 14%, rgba(5,5,5,0.72))` : "rgba(5,5,5,0.55)",
              backdropFilter: "blur(6px)",
              transition: "border-color 0.25s ease, background 0.25s ease, color 0.25s ease",
            }}
          >
            {/* left accent bar */}
            <span
              aria-hidden="true"
              className="absolute inset-y-[18%] left-0 w-[2px] rounded-full"
              style={{ background: `var(${mod.accentVar})`, opacity: 0.85 }}
            />
            {/* pulsing status dot */}
            <span
              aria-hidden="true"
              className={`absolute right-2.5 top-2.5 size-[5px] rounded-full ${reducedMotion ? "" : styles.pulseDot}`}
              style={{ background: `var(${mod.accentVar})`, boxShadow: `0 0 6px var(${mod.accentVar})` }}
            />

            <p
              className="pl-1 text-[8px] font-black uppercase leading-none tracking-[0.1em]"
              style={{ color: isActive ? `var(${mod.accentVar})` : "var(--mf-pub-text-muted)" }}
            >
              {mod.label}
            </p>
            <p className="mt-1 pl-1 text-[11px] font-bold leading-tight text-[var(--mf-pub-text)]">{mod.value}</p>
            <p className="mt-0.5 pl-1 text-[7.5px] font-black uppercase leading-none tracking-[0.1em]" style={{ color: `var(${mod.accentVar})` }}>
              {mod.status}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
