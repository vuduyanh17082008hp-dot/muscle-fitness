"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_REGIONS } from "@/lib/training/muscle-regions";
import type { RecommendationCategory } from "@/lib/training/recommendations";
import type { MuscleMapEntry, MuscleMapProps } from "@/components/training/muscle-map/types";
import { WhatIfPanel } from "@/components/training/muscle-map/WhatIfPanel";

type MapMode = "volume" | "change" | "performance";

const MODE_LABEL: Record<MapMode, string> = {
  volume: "Volume",
  change: "Change",
  performance: "Performance",
};

const RECOMMENDATION_LABEL: Record<RecommendationCategory, string> = {
  MAINTAIN: "Maintain",
  INCREASE_GRADUALLY: "Increase gradually",
  REDUCE_SLIGHTLY: "Reduce slightly",
  REDISTRIBUTE: "Redistribute",
  MONITOR: "Monitor",
  INSUFFICIENT_DATA: "Insufficient data",
};

function volumeFill(value: number, max: number): string {
  if (max <= 0) return "var(--muscle-map-empty, #2a2a2a)";
  const ratio = Math.min(1, value / max);
  // Neutral blue intensity scale — never red/green "injury vs optimal" semantics.
  const lightness = 78 - ratio * 46;
  return `hsl(210 70% ${lightness}%)`;
}

function changeFill(changePercent: number | null): string {
  if (changePercent === null) return "var(--muscle-map-empty, #2a2a2a)";
  const magnitude = Math.min(1, Math.abs(changePercent) / 50);
  const lightness = 78 - magnitude * 46;
  return `hsl(210 70% ${lightness}%)`;
}

function performanceFill(trend: string): string {
  switch (trend) {
    case "improving":
      return "hsl(210 70% 38%)";
    case "stable":
      return "hsl(210 30% 58%)";
    case "declining":
      return "hsl(210 20% 72%)";
    case "mixed":
      return "hsl(35 60% 60%)";
    default:
      return "var(--muscle-map-empty, #2a2a2a)";
  }
}

export function MuscleMapClient({
  muscles,
  exerciseNames,
  hasAnyLoggedData,
  dataWindow,
}: MuscleMapProps) {
  const [view, setView] = useState<"front" | "back">("front");
  const [mode, setMode] = useState<MapMode>("volume");
  const [selectedMuscle, setSelectedMuscle] = useState<CanonicalMuscle | null>(null);

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
    const entry = byMuscle.get(muscle);
    if (!entry) return "var(--muscle-map-empty, #2a2a2a)";

    if (mode === "volume") return volumeFill(entry.analytics.currentWeek.totalEffectiveSets, maxVolume);
    if (mode === "change") return changeFill(entry.analytics.changePercent);
    return performanceFill(entry.recommendation.inputs.performanceTrend);
  }

  function ariaLabelFor(muscle: CanonicalMuscle): string {
    const entry = byMuscle.get(muscle);
    const name = MUSCLE_DISPLAY_NAME[muscle];

    if (!entry) return `${name} — no logged training data`;

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

  if (!hasAnyLoggedData) {
    return (
      <div className="rounded-3xl border border-white/10 bg-zinc-900/60 p-8 text-center">
        <p className="text-sm text-zinc-400">
          No logged workout sets were found in the last {dataWindow.weeksOfHistory} week(s). Log a
          few workouts to unlock muscle-level Training Intelligence.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {(["front", "back"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`min-h-11 flex-1 rounded-xl border text-sm font-medium capitalize transition-colors ${
                view === v
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:text-white"
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
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:text-white"
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
          <rect x="70" y="20" width="60" height="60" rx="28" fill="#1c1c1c" />
          <rect x="72" y="76" width="56" height="130" rx="18" fill="#1c1c1c" />

          {regions.map((region, index) => {
            const fill = fillFor(region.muscle);
            const label = ariaLabelFor(region.muscle);
            const regionKey = `${region.muscle}-${index}`;
            const commonProps = {
              tabIndex: 0,
              role: "button" as const,
              "aria-label": label,
              onClick: () => setSelectedMuscle(region.muscle),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  setSelectedMuscle(region.muscle);
                }
              },
              className: "cursor-pointer stroke-white/10 transition-opacity hover:opacity-80 focus:outline-none focus-visible:stroke-white",
              style: { strokeWidth: 1.5 },
              fill,
            };

            if (region.shape === "ellipse") {
              return (
                <ellipse
                  key={regionKey}
                  {...commonProps}
                  cx={region.x + region.width / 2}
                  cy={region.y + region.height / 2}
                  rx={region.width / 2}
                  ry={region.height / 2}
                />
              );
            }

            return (
              <rect
                key={regionKey}
                {...commonProps}
                x={region.x}
                y={region.y}
                width={region.width}
                height={region.height}
                rx={region.rx ?? 6}
              />
            );
          })}
        </svg>

        <MuscleMapLegend mode={mode} />
      </div>

      <MuscleDetailPanel
        entry={selectedEntry}
        exerciseNames={exerciseNames}
        onClose={() => setSelectedMuscle(null)}
      />
    </div>
  );
}

function MuscleMapLegend({ mode }: { mode: MapMode }) {
  const items: Array<{ label: string; className: string }> =
    mode === "performance"
      ? [
          { label: "Improving", className: "bg-[hsl(210,70%,38%)]" },
          { label: "Stable", className: "bg-[hsl(210,30%,58%)]" },
          { label: "Declining", className: "bg-[hsl(210,20%,72%)]" },
          { label: "Mixed / insufficient data", className: "bg-zinc-700" },
        ]
      : [
          { label: "Lower exposure", className: "bg-[hsl(210,70%,72%)]" },
          { label: "Moderate exposure", className: "bg-[hsl(210,70%,55%)]" },
          { label: "Higher exposure", className: "bg-[hsl(210,70%,32%)]" },
          { label: "No data", className: "bg-zinc-700" },
        ];

  return (
    <div className="rounded-2xl border border-white/10 p-3 text-xs text-zinc-400">
      <p className="mb-2 font-medium text-zinc-300">Legend</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${item.className}`} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MuscleDetailPanel({
  entry,
  exerciseNames,
  onClose,
}: {
  entry: MuscleMapEntry | null;
  exerciseNames: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          className={[
            "fixed z-50 flex flex-col gap-4 overflow-y-auto bg-zinc-950 p-6",
            "inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t border-white/10",
            "sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-l sm:border-t-0",
          ].join(" ")}
        >
          {entry ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <Dialog.Title className="text-lg font-bold text-white">
                    {MUSCLE_DISPLAY_NAME[entry.muscle]}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-zinc-500">
                    Modeled effective weekly volume
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Close" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Effective volume" value={entry.analytics.currentWeek.totalEffectiveSets} />
                <Stat label="Direct" value={entry.analytics.currentWeek.directSets} />
                <Stat label="Indirect (effective)" value={entry.analytics.currentWeek.indirectEffectiveSets} />
                <Stat label="Frequency" value={`${entry.analytics.frequency} session(s)`} />
                <Stat
                  label="Previous week"
                  value={entry.analytics.previousWeek?.totalEffectiveSets ?? "—"}
                />
                <Stat
                  label="Change"
                  value={entry.analytics.changePercent !== null ? `${entry.analytics.changePercent > 0 ? "+" : ""}${entry.analytics.changePercent}%` : "—"}
                />
                <Stat
                  label="Personal range"
                  value={
                    entry.baseline.recentRange
                      ? `${entry.baseline.recentRange.min}–${entry.baseline.recentRange.max}`
                      : "Insufficient data"
                  }
                />
                <Stat
                  label="Performance"
                  value={entry.recommendation.inputs.performanceTrend.replace("_", " ")}
                />
              </div>

              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Where did this volume come from?
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {entry.analytics.currentWeek.contributingExercises.map((c, index) => (
                    <li
                      key={`${c.exerciseId}-${index}`}
                      className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
                    >
                      <span className="text-zinc-300">
                        {exerciseNames[c.exerciseId] ?? "Unknown exercise"}
                        <span className="ml-2 text-xs text-zinc-500">
                          {c.role} · {c.eligibleSets} × {c.contribution}
                        </span>
                      </span>
                      <span className="font-semibold text-white">{c.effectiveSets}</span>
                    </li>
                  ))}
                  {entry.analytics.currentWeek.contributingExercises.length === 0 ? (
                    <li className="text-zinc-500">No contributing exercises logged this week.</li>
                  ) : null}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-zinc-500">
                  <span>Recommendation</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] normal-case text-zinc-300">
                    Confidence: {entry.recommendation.confidence}
                  </span>
                </h3>
                <p className="mb-2 text-sm font-semibold text-white">
                  {RECOMMENDATION_LABEL[entry.recommendation.recommendation]}
                </p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {entry.recommendation.signals.map((signal, index) => (
                    <li key={index}>• {signal}</li>
                  ))}
                </ul>
                {entry.recommendation.limitations.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                    {entry.recommendation.limitations.map((limitation, index) => (
                      <li key={index}>△ {limitation}</li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <WhatIfPanel
                muscle={entry.muscle}
                contributingExercises={entry.analytics.currentWeek.contributingExercises}
                exerciseNames={exerciseNames}
              />
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-base font-semibold text-white">{value}</p>
    </div>
  );
}
