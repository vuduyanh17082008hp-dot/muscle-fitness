"use client";

import { useMemo, useState } from "react";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";
import { buildExerciseEmphasisMap, HIGHLIGHT_FILL, HIGHLIGHT_OPACITY } from "@/lib/training/muscle-highlight";
import {
  ANATOMY_INTERACTION,
  resolveAnatomyColor,
  type AnatomyIntensitySample,
} from "@/lib/training/anatomy-intensity";
import type { MuscleMapEntry, MuscleMapProps } from "@/components/training/muscle-map/types";
import { MuscleSearchBar } from "@/components/training/muscle-map/MuscleSearchBar";
import { MuscleDetailPanel } from "@/components/training/muscle-map/MuscleDetailPanel";
import { ExercisePicker } from "@/components/training/muscle-map/ExercisePicker";
import { ExerciseEmphasisPanel } from "@/components/training/muscle-map/ExerciseEmphasisPanel";
import { AnatomicalBodySvg } from "@/components/training/muscle-map/AnatomicalBodySvg";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";
import { cn } from "@/lib/cn";

export type MapMode = "anatomy" | "volume" | "change" | "performance" | "exercise";

const MODE_LABEL: Record<MapMode, string> = {
  anatomy: "Anatomy",
  volume: "Volume",
  change: "Change",
  performance: "Performance",
  exercise: "Exercise",
};

function performanceTone(
  trend: string,
): AnatomyIntensitySample["tone"] {
  switch (trend) {
    case "improving":
      return "positive";
    case "stable":
      return "neutral";
    case "declining":
      return "negative";
    case "mixed":
      return "mixed";
    default:
      return "inactive";
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
  const [hoveredMuscle, setHoveredMuscle] = useState<CanonicalMuscle | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseRecord | null>(null);

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

  const exerciseEmphasis = useMemo(
    () => (selectedExercise ? buildExerciseEmphasisMap(selectedExercise) : {}),
    [selectedExercise],
  );

  const selectedEntry = selectedMuscle ? byMuscle.get(selectedMuscle) ?? null : null;

  /** The figure that best shows the current selection — used only to subtly emphasize one side on wide desktop; both figures stay visible regardless (spec §10). */
  const preferredView = selectedMuscle
    ? MUSCLE_ATLAS_ENTRIES[selectedMuscle].preferredView
    : selectedExercise?.primaryMuscles[0]
      ? MUSCLE_ATLAS_ENTRIES[selectedExercise.primaryMuscles[0]].preferredView
      : null;

  function sampleFor(muscle: CanonicalMuscle): AnatomyIntensitySample | null {
    if (mode === "exercise") {
      const level = exerciseEmphasis[muscle];
      if (!level) return null;
      const intensity = level === "primary" ? 1 : level === "secondary" ? 0.55 : 0.28;
      return { intensity };
    }

    if (mode === "anatomy") return {};

    const entry = byMuscle.get(muscle);
    if (!entry) return null;

    if (mode === "volume") {
      return {
        intensity: maxVolume > 0 ? entry.analytics.currentWeek.totalEffectiveSets / maxVolume : 0,
      };
    }

    if (mode === "change") {
      if (entry.analytics.changePercent === null) return null;
      return { intensity: Math.min(1, Math.abs(entry.analytics.changePercent) / 50) };
    }

    return { tone: performanceTone(entry.recommendation.inputs.performanceTrend) };
  }

  function fillFor(muscle: CanonicalMuscle): string {
    if (mode === "exercise") {
      const level = exerciseEmphasis[muscle];
      return level ? HIGHLIGHT_FILL[level] : HIGHLIGHT_FILL.inactive;
    }

    return resolveAnatomyColor(mode, sampleFor(muscle)).fill;
  }

  /** Cinematic dim/highlight: only opacity-shifts when something is selected — never on plain hover/idle. */
  function opacityFor(muscle: CanonicalMuscle): number {
    if (mode === "exercise") {
      if (selectedMuscle && muscle === selectedMuscle) return HIGHLIGHT_OPACITY.selected;
      const level = exerciseEmphasis[muscle];
      return level ? HIGHLIGHT_OPACITY[level] : HIGHLIGHT_OPACITY.inactive;
    }

    if (!selectedMuscle) return ANATOMY_INTERACTION.idleOpacity;
    return muscle === selectedMuscle
      ? ANATOMY_INTERACTION.idleOpacity
      : ANATOMY_INTERACTION.dimmedOpacity;
  }

  function ariaLabelFor(muscle: CanonicalMuscle): string {
    const name = MUSCLE_DISPLAY_NAME[muscle];

    if (mode === "exercise") {
      if (!selectedExercise) return `${name} — select an exercise to see its training emphasis`;
      const level = exerciseEmphasis[muscle];
      return level
        ? `${name} — ${level} emphasis for ${selectedExercise.canonicalName}`
        : `${name} — not trained by ${selectedExercise.canonicalName}`;
    }

    const entry = byMuscle.get(muscle);

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

  /** Selecting via the body map itself doesn't change view — the user is already looking at the right one on mobile, and desktop shows both anyway. Explicit muscle selection always outranks Exercise Mode's visualization (spec §8), so it drops back to Anatomy so the right panel shows muscle detail immediately. */
  function handleSelectFromMap(muscle: CanonicalMuscle) {
    setSelectedMuscle(muscle);
    if (mode === "exercise") {
      setMode("anatomy");
    }
  }

  /** Selecting via search auto-switches to the muscle's preferred view (spec §9) — a deliberate one-shot action, not a persistent fight with a manual toggle. */
  function handleSelectFromSearch(muscle: CanonicalMuscle) {
    setSelectedMuscle(muscle);
    setMode("anatomy");
    setView(MUSCLE_ATLAS_ENTRIES[muscle].preferredView);
  }

  /** Picking an exercise is an explicit mode switch — clears any lingering muscle selection so the map shows one coherent state, and (mobile only) jumps to the primary muscle's preferred view. */
  function handleSelectExercise(record: ExerciseRecord) {
    setSelectedExercise(record);
    setSelectedMuscle(null);
    setMode("exercise");

    const primaryMuscle = record.primaryMuscles[0];
    if (primaryMuscle) {
      setView(MUSCLE_ATLAS_ENTRIES[primaryMuscle].preferredView);
    }
  }

  return (
    <div className="rounded-[22px] border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <MuscleSearchBar onResolve={handleSelectFromSearch} />
            <ExercisePicker selected={selectedExercise} onSelect={handleSelectExercise} />
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

          {/* Front/Back toggle — mobile/tablet only. Desktop (lg+) shows both figures simultaneously. */}
          <div className="flex gap-2 lg:hidden">
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <figure
              className={cn(
                "flex min-h-[320px] flex-col items-center justify-center gap-2 transition-opacity duration-300 sm:min-h-[380px]",
                view === "back" && "hidden lg:flex",
                preferredView === "back" && "lg:opacity-70",
              )}
            >
              <AnatomicalBodySvg
                view="front"
                fillFor={fillFor}
                opacityFor={opacityFor}
                ariaLabelFor={ariaLabelFor}
                selectedMuscle={selectedMuscle}
                hoveredMuscle={hoveredMuscle}
                onSelectMuscle={handleSelectFromMap}
                onHoverMuscle={setHoveredMuscle}
              />
              <figcaption className="text-[10px] font-bold uppercase tracking-[0.2em] text-mf-glass-text-muted">
                Front
              </figcaption>
            </figure>

            <figure
              className={cn(
                "flex min-h-[320px] flex-col items-center justify-center gap-2 transition-opacity duration-300 sm:min-h-[380px]",
                view === "front" && "hidden lg:flex",
                preferredView === "front" && "lg:opacity-70",
              )}
            >
              <AnatomicalBodySvg
                view="back"
                fillFor={fillFor}
                opacityFor={opacityFor}
                ariaLabelFor={ariaLabelFor}
                selectedMuscle={selectedMuscle}
                hoveredMuscle={hoveredMuscle}
                onSelectMuscle={handleSelectFromMap}
                onHoverMuscle={setHoveredMuscle}
              />
              <figcaption className="text-[10px] font-bold uppercase tracking-[0.2em] text-mf-glass-text-muted">
                Back
              </figcaption>
            </figure>
          </div>

          <MuscleMapLegend mode={mode} />
        </div>

        {mode === "exercise" ? (
          <ExerciseEmphasisPanel record={selectedExercise} />
        ) : (
          <MuscleDetailPanel
            muscle={selectedMuscle}
            entry={selectedEntry}
            exerciseNames={exerciseNames}
            hasAnyLoggedData={hasAnyLoggedData}
            dataWindowWeeks={dataWindow.weeksOfHistory}
            availableEquipment={availableEquipment}
            onClose={() => setSelectedMuscle(null)}
          />
        )}
      </div>
    </div>
  );
}

function MuscleMapLegend({ mode }: { mode: MapMode }) {
  // Dynamic hues (volume=lime, change=cyan) are set via inline `style`,
  // not a Tailwind arbitrary-value class — a runtime-interpolated
  // `bg-[...]` class string can't be picked up by Tailwind's static
  // build-time scan, so it would silently render with no background.
  const dataHue = mode === "change" ? "190 80%" : "83 80%";

  const heading =
    mode === "exercise" ? "Exercise Emphasis" : mode === "anatomy" ? "Legend" : "Recent Training Exposure";

  const items: Array<{ label: string; color: string; opacity?: number }> =
    mode === "exercise"
      ? [
          { label: "Primary", color: HIGHLIGHT_FILL.primary, opacity: HIGHLIGHT_OPACITY.primary },
          { label: "Secondary", color: HIGHLIGHT_FILL.secondary, opacity: HIGHLIGHT_OPACITY.secondary },
          { label: "Supporting", color: HIGHLIGHT_FILL.supporting, opacity: HIGHLIGHT_OPACITY.supporting },
          { label: "Not trained", color: HIGHLIGHT_FILL.inactive },
        ]
      : mode === "anatomy"
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
      <p className="mb-2 font-medium text-mf-glass-text-secondary">{heading}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color, opacity: item.opacity ?? 1 }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
