"use client";

import { motion, useReducedMotion } from "framer-motion";

import { describeArcPath, buildPillarArcs, type ArcSpec } from "@/lib/performance-halo/geometry";
import { MOTION, EASE_OUT } from "@/lib/motion/timings";
import { cn } from "@/lib/cn";

/**
 * PerformanceHalo — the Muscle Fitness signature component.
 *
 * Deliberately NOT a donut, pie chart, Apple-rings clone, or a
 * WHOOP-style single ring: three independent arcs at different
 * radii, each occupying its own asymmetric angular zone (different
 * start angle AND different sweep range — see PILLAR_SPECS below),
 * orbiting a shared center that shows the blended Readiness state.
 * Geometry math lives in lib/performance-halo/geometry.ts and is
 * unit-tested there (no browser available in this environment to
 * visually verify SVG output, so the arc math is verified by
 * asserting concrete coordinates instead).
 *
 * Every value here can be null (no data yet) — the component always
 * draws the dim background track so the pillar stays legible, but
 * never fabricates a filled arc for missing data.
 */

export type HaloPillar = {
  label: string;
  value: number | null;
  /** Short real-data caption shown in the legend, e.g. "4 of 5 sessions" — never invented. */
  detail: string;
  color: string;
};

export type PerformanceHaloProps = {
  center: {
    score: number | null;
    status: string | null;
    /** 0-1, only rendered when not null — never a fabricated confidence. */
    confidence: number | null;
  };
  train: HaloPillar;
  fuel: HaloPillar;
  recover: HaloPillar;
  className?: string;
};

const PILLAR_SPECS: Record<"train" | "fuel" | "recover", ArcSpec> = {
  train: { radius: 88, startAngle: 205, rangeAngle: 138 },
  fuel: { radius: 72, startAngle: 353, rangeAngle: 110 },
  recover: { radius: 56, startAngle: 113, rangeAngle: 86 },
};

function confidenceLabel(confidence: number | null): string | null {
  if (confidence === null) return null;
  // Same 0.66 / 0.33 buckets already used by
  // lib/dante-core/autoregulation-engine.ts's computeConfidence —
  // reusing the existing convention rather than inventing new cutoffs.
  if (confidence >= 0.66) return "High confidence";
  if (confidence >= 0.33) return "Moderate confidence";
  return "Limited data";
}

function PillarArc({
  pillar,
  spec,
  reduceMotion,
}: {
  pillar: HaloPillar;
  spec: ArcSpec;
  reduceMotion: boolean;
}) {
  const { trackPath, fillPath } = buildPillarArcs(spec, pillar.value);

  return (
    <g>
      {trackPath ? (
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} strokeLinecap="round" />
      ) : null}

      {fillPath ? (
        <motion.path
          d={fillPath}
          fill="none"
          stroke={pillar.color}
          strokeWidth={7}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${pillar.color}80)` }}
          initial={reduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduceMotion ? 0 : MOTION.section, ease: EASE_OUT }}
        />
      ) : null}
    </g>
  );
}

export function PerformanceHalo({ center, train, fuel, recover, className }: PerformanceHaloProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const confidence = confidenceLabel(center.confidence);

  // Outer decorative ring (always full circle, pure ambience — not a
  // data arc) gives the composition a defined edge at the largest
  // pillar's radius without reading as a fourth metric.
  const rimPath = describeArcPath(100, 100, 96, 0, 359.99);

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[280px]", className)}>
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-0">
        {rimPath ? (
          <path d={rimPath} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ) : null}

        <PillarArc pillar={train} spec={PILLAR_SPECS.train} reduceMotion={reduceMotion} />
        <PillarArc pillar={fuel} spec={PILLAR_SPECS.fuel} reduceMotion={reduceMotion} />
        <PillarArc pillar={recover} spec={PILLAR_SPECS.recover} reduceMotion={reduceMotion} />
      </svg>

      {/* Center — plain HTML over the SVG, so the number stays crisp
          and screen-reader-friendly text rather than SVG <text>. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-heading tabular-metric leading-none text-white"
          style={{ fontSize: "clamp(2.25rem, 8vw, 3.25rem)" }}
        >
          {center.score ?? "—"}
        </span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          Readiness
        </span>
        {center.status ? (
          <span className="mt-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
            {center.status}
          </span>
        ) : null}
        {confidence ? (
          <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
            {confidence}
          </span>
        ) : null}
      </div>

      {/* Legend — readable without animation, and gives each arc a
          name + real value so the composition never depends on
          color alone to communicate which pillar is which. */}
      <div className="sr-only">
        <p>Train: {train.value ?? "no data"}. {train.detail}</p>
        <p>Fuel: {fuel.value ?? "no data"}. {fuel.detail}</p>
        <p>Recover: {recover.value ?? "no data"}. {recover.detail}</p>
      </div>
    </div>
  );
}

export function PerformanceHaloLegend({
  train,
  fuel,
  recover,
}: {
  train: HaloPillar;
  fuel: HaloPillar;
  recover: HaloPillar;
}) {
  const pillars = [train, fuel, recover];

  // aria-hidden: this visually duplicates the sr-only summary already
  // rendered inside <PerformanceHalo>, so exposing both to assistive
  // tech would announce the same three values twice.
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-3">
      {pillars.map((pillar) => (
        <div key={pillar.label} className="text-center sm:text-left">
          <div className="flex items-center justify-center gap-1.5 sm:justify-start">
            <span className="size-2 rounded-full" style={{ backgroundColor: pillar.color }} />
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
              {pillar.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{pillar.detail}</p>
        </div>
      ))}
    </div>
  );
}
