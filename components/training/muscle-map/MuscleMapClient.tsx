"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_REGIONS, type MuscleRegion } from "@/lib/training/muscle-regions";
import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";
import { useReducedMotion } from "@/lib/useReducedMotion";
import type { MuscleMapEntry, MuscleMapProps } from "@/components/training/muscle-map/types";
import { MuscleSearchBar } from "@/components/training/muscle-map/MuscleSearchBar";
import { MuscleDetailPanel } from "@/components/training/muscle-map/MuscleDetailPanel";

export type MapMode = "anatomy" | "volume" | "change" | "performance";

const MODE_LABEL: Record<MapMode, string> = {
  anatomy: "Anatomy",
  volume: "Volume",
  change: "Change",
  performance: "Performance",
};

function volumeFill(value: number, max: number): string {
  if (max <= 0) return "var(--mf-glass-elevated)";
  const ratio = Math.min(1, value / max);
  const lightness = 78 - ratio * 46;
  return `hsl(83 80% ${lightness}%)`; // acid-lime hue, intensity by exposure
}

function changeFill(changePercent: number | null): string {
  if (changePercent === null) return "var(--mf-glass-elevated)";
  const magnitude = Math.min(1, Math.abs(changePercent) / 50);
  const lightness = 78 - magnitude * 46;
  return `hsl(190 80% ${lightness}%)`; // analytics cyan — chart differentiation only, per Client OS color rules
}

function performanceFill(trend: string): string {
  switch (trend) {
    case "improving":
      return "var(--mf-glass-brand)";
    case "stable":
      return "hsl(190 40% 58%)";
    case "declining":
      return "var(--mf-glass-warning)";
    case "mixed":
      return "hsl(35 60% 60%)";
    default:
      return "var(--mf-glass-elevated)";
  }
}

export function MuscleMapClient({
  muscles,
  exerciseNames,
  hasAnyLoggedData,
  dataWindow,
  availableEquipment,
}: MuscleMapProps) {
  const [view, setView] = useState<"front" | "back">("front");
  const [mode, setMode] = useState<MapMode>("anatomy");
  const [selectedMuscle, setSelectedMuscle] = useState<CanonicalMuscle | null>(null);
  const reduceMotion = useReducedMotion();

  const byMuscle = useMemo(() => {
    const map = new Map<CanonicalMuscle, MuscleMapEntry>();
    for (const entry of muscles) {
      map.set(entry.muscle, entry);
    }
    return map;
  }, [muscles]);

  const maxVolume = useMemo(
    () => Math.max(0, ...muscles.map((m) => m.analytics.currentWeek.totalEffectiveSets)),
    [muscles],
  );

  const regions = MUSCLE_REGIONS.filter((region) => region.view === view);
  const selectedEntry = selectedMuscle ? byMuscle.get(selectedMuscle) ?? null : null;

  function fillFor(muscle: CanonicalMuscle): string {
    if (mode === "anatomy") return "var(--mf-glass-elevated)";

    const entry = byMuscle.get(muscle);
    if (!entry) return "var(--mf-glass-elevated)";

    if (mode === "volume") return volumeFill(entry.analytics.currentWeek.totalEffectiveSets, maxVolume);
    if (mode === "change") return changeFill(entry.analytics.changePercent);
    return performanceFill(entry.recommendation.inputs.performanceTrend);
  }

  /** Cinematic dim/highlight: only opacity-shifts when something is selected — never on plain hover/idle. */
  function opacityFor(muscle: CanonicalMuscle): number {
    if (!selectedMuscle) return 1;
    return muscle === selectedMuscle ? 1 : 0.32;
  }

  function ariaLabelFor(muscle: CanonicalMuscle): string {
    const entry = byMuscle.get(muscle);
    const name = MUSCLE_DISPLAY_NAME[muscle];

    if (mode === "anatomy" || !entry) {
      return `${name}${entry ? "" : " — no logged training data"}`;
    }

    if (mode === "volume") {
      return `${name} — ${entry.analytics.currentWeek.totalEffectiveSets} modeled effective sets this week`;
    }
    if (mode === "change") {
      return entry.analytics.changePercent === null
        ? `${name} — no previous week to compare`
        : `${name} — ${entry.analytics.changePercent > 0 ? "+" : ""}${entry.analytics.changePercent}% versus last week`;
    }
    return `${name} — performance trend: ${entry.recommendation.inputs.performanceTrend.replace("_", " ")}`;
  }

  /** Selecting via the body map itself doesn't change view — the user is already looking at the right one. */
  function handleSelectFromMap(muscle: CanonicalMuscle) {
    setSelectedMuscle(muscle);
  }

  /** Selecting via search auto-switches to the muscle's preferred view (spec §9) — a deliberate one-shot action, not a persistent fight with a manual toggle. */
  function handleSelectFromSearch(muscle: CanonicalMuscle) {
    setSelectedMuscle(muscle);
    setView(MUSCLE_ATLAS_ENTRIES[muscle].preferredView);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div className="flex flex-col gap-4">
        <MuscleSearchBar onResolve={handleSelectFromSearch} />

        <div className="flex gap-2">
          {(["front", "back"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`min-h-11 flex-1 rounded-xl border text-sm font-medium capitalize transition-colors ${
                view === v
                  ? "border-mf-glass-border-strong bg-white/10 text-mf-glass-text"
                  : "border-mf-glass-border text-mf-glass-text-muted hover:text-mf-glass-text"
              }`}
            >
              {v} view
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(MODE_LABEL) as MapMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors ${
                mode === m
                  ? "border-mf-glass-border-strong bg-white/10 text-mf-glass-text"
                  : "border-mf-glass-border text-mf-glass-text-muted hover:text-mf-glass-text"
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <svg
          viewBox="0 0 200 400"
          role="img"
          aria-label={`Muscle map, ${view} view, ${MODE_LABEL[mode].toLowerCase()} mode`}
          className="mx-auto w-full max-w-[280px]"
        >
          <rect x="70" y="20" width="60" height="60" rx="28" fill="var(--mf-glass-bg-deep)" />
          <rect x="72" y="76" width="56" height="130" rx="18" fill="var(--mf-glass-bg-deep)" />

          {regions.map((region, index) => {
            const fill = fillFor(region.muscle);
            const label = ariaLabelFor(region.muscle);
            const regionKey = `${region.muscle}-${index}`;
            const isSelected = region.muscle === selectedMuscle;

            const commonProps = {
              tabIndex: 0,
              role: "button" as const,
              "aria-label": label,
              "aria-pressed": isSelected,
              onClick: () => handleSelectFromMap(region.muscle),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelectFromMap(region.muscle);
                }
              },
              className: "cursor-pointer transition-colors hover:opacity-90 focus:outline-none focus-visible:stroke-mf-glass-brand",
              stroke: isSelected ? "var(--mf-glass-brand)" : "rgba(255,255,255,0.1)",
              style: { strokeWidth: isSelected ? 2.5 : 1.5, transformOrigin: "center" as const },
              fill,
              initial: false as const,
              animate: { opacity: opacityFor(region.muscle), scale: isSelected ? 1.03 : 1 },
              transition: { duration: reduceMotion ? 0 : 0.35, ease: "easeOut" as const },
            };

            return renderRegionShape(region, regionKey, commonProps);
          })}
        </svg>

        <MuscleMapLegend mode={mode} />
      </div>

      <MuscleDetailPanel
        muscle={selectedMuscle}
        entry={selectedEntry}
        exerciseNames={exerciseNames}
        hasAnyLoggedData={hasAnyLoggedData}
        dataWindowWeeks={dataWindow.weeksOfHistory}
        availableEquipment={availableEquipment}
        onClose={() => setSelectedMuscle(null)}
      />
    </div>
  );
}

type RegionCommonProps = {
  tabIndex: number;
  role: "button";
  "aria-label": string;
  "aria-pressed": boolean;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  className: string;
  stroke: string;
  style: { strokeWidth: number; transformOrigin: string };
  fill: string;
  initial: false;
  animate: { opacity: number; scale: number };
  transition: { duration: number; ease: "easeOut" };
};

function renderRegionShape(region: MuscleRegion, key: string, props: RegionCommonProps) {
  if (region.shape === "path") {
    return <motion.path key={key} {...props} d={region.d} />;
  }

  if (region.shape === "ellipse") {
    return (
      <motion.ellipse
        key={key}
        {...props}
        cx={region.x + region.width / 2}
        cy={region.y + region.height / 2}
        rx={region.width / 2}
        ry={region.height / 2}
      />
    );
  }

  return (
    <motion.rect
      key={key}
      {...props}
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      rx={region.rx ?? 6}
    />
  );
}

function MuscleMapLegend({ mode }: { mode: MapMode }) {
  // Dynamic hues (volume=lime, change=cyan) are set via inline `style`,
  // not a Tailwind arbitrary-value class — a runtime-interpolated
  // `bg-[...]` class string can't be picked up by Tailwind's static
  // build-time scan, so it would silently render with no background.
  const dataHue = mode === "change" ? "190 80%" : "83 80%";

  const items: Array<{ label: string; color: string }> =
    mode === "anatomy"
      ? [{ label: "Select a muscle to explore", color: "var(--mf-glass-elevated)" }]
      : mode === "performance"
        ? [
            { label: "Improving", color: "var(--mf-glass-brand)" },
            { label: "Stable", color: "hsl(190 40% 58%)" },
            { label: "Declining", color: "var(--mf-glass-warning)" },
            { label: "Mixed / insufficient data", color: "var(--mf-glass-elevated)" },
          ]
        : [
            { label: "Lower exposure", color: `hsl(${dataHue} 72%)` },
            { label: "Moderate exposure", color: `hsl(${dataHue} 55%)` },
            { label: "Higher exposure", color: `hsl(${dataHue} 32%)` },
            { label: "No data", color: "var(--mf-glass-elevated)" },
          ];

  return (
    <div className="rounded-2xl border border-mf-glass-border p-3 text-xs text-mf-glass-text-muted">
      <p className="mb-2 font-medium text-mf-glass-text-secondary">Legend</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
