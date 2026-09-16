"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { RecommendationCategory } from "@/lib/training/recommendations";
import { MUSCLE_ATLAS_ENTRIES } from "@/lib/training/muscle-ontology";
import { getSubRegionsFor } from "@/lib/training/muscle-subregions";
import type { MuscleMapEntry } from "@/components/training/muscle-map/types";
import { ExercisesTab } from "@/components/training/muscle-map/ExercisesTab";
import { WhatIfPanel } from "@/components/training/muscle-map/WhatIfPanel";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { cn } from "@/lib/cn";

// Lazy: DanteChat is a large streaming chat surface, only needed once
// a user opens the Atlas AND explicitly picks the Ask Dante tab —
// mirrors the same lazy-load treatment Floating Dante already uses.
const DanteChat = dynamic(() => import("@/components/dante-chat"), { ssr: false });

const RECOMMENDATION_LABEL: Record<RecommendationCategory, string> = {
  MAINTAIN: "Maintain",
  INCREASE_GRADUALLY: "Increase gradually",
  REDUCE_SLIGHTLY: "Reduce slightly",
  REDISTRIBUTE: "Redistribute",
  MONITOR: "Monitor",
  INSUFFICIENT_DATA: "Insufficient data",
};

type Tab = "anatomy" | "training" | "exercises" | "dante";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "anatomy", label: "Anatomy" },
  { id: "training", label: "Your Training" },
  { id: "exercises", label: "Exercises" },
  { id: "dante", label: "Ask Dante" },
];

export type MuscleDetailPanelProps = {
  muscle: CanonicalMuscle | null;
  entry: MuscleMapEntry | null;
  exerciseNames: Record<string, string>;
  hasAnyLoggedData: boolean;
  dataWindowWeeks: number;
  availableEquipment: string[];
  onClose: () => void;
};

export function MuscleDetailPanel(props: MuscleDetailPanelProps) {
  const { muscle, onClose } = props;
  const isDesktop = useIsDesktop();
  const [tab, setTab] = useState<Tab>("anatomy");

  const open = muscle !== null;

  function handleOpenChange(next: boolean) {
    if (!next) {
      onClose();
      setTab("anatomy");
    }
  }

  const content = muscle ? <PanelContent {...props} muscle={muscle} tab={tab} onTabChange={setTab} /> : null;

  // Desktop: an always-mounted inline panel beside the body map (spec:
  // "Panel content changes when selectedMuscle changes" — a persistent
  // 40%-width column, not a modal covering the map). Mobile keeps the
  // transient BottomSheet, since there's no spare vertical real estate
  // for a permanently-visible panel there.
  if (isDesktop) {
    return (
      <div className="flex h-full min-h-[420px] flex-col gap-4 overflow-y-auto rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
        {content ?? <IdlePanel />}
      </div>
    );
  }

  return (
    <BottomSheet open={open} onOpenChange={handleOpenChange} title={muscle ? MUSCLE_DISPLAY_NAME[muscle] : undefined}>
      {content}
    </BottomSheet>
  );
}

function IdlePanel() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-mf-glass-text">Select a Muscle</p>
      <p className="max-w-xs text-sm text-mf-glass-text-muted">
        Explore anatomy, exercises and training emphasis.
      </p>
    </div>
  );
}

function PanelContent({
  muscle,
  entry,
  exerciseNames,
  hasAnyLoggedData,
  dataWindowWeeks,
  availableEquipment,
  onClose,
  tab,
  onTabChange,
}: MuscleDetailPanelProps & { muscle: CanonicalMuscle; tab: Tab; onTabChange: (tab: Tab) => void }) {
  const atlasEntry = MUSCLE_ATLAS_ENTRIES[muscle];
  const subRegions = getSubRegionsFor(muscle);

  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wide text-mf-glass-text">
            {MUSCLE_DISPLAY_NAME[muscle]}
          </h2>
          <p className="text-xs text-mf-glass-text-muted">{atlasEntry.scientificName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-mf-glass-text-muted hover:bg-white/10 hover:text-mf-glass-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 rounded-xl border border-mf-glass-border bg-white/[0.02] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
              tab === t.id
                ? "bg-mf-glass-brand-soft text-mf-glass-brand"
                : "text-mf-glass-text-muted hover:text-mf-glass-text-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "anatomy" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-6 text-mf-glass-text-secondary">{atlasEntry.shortDescription}</p>

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
              Basic actions
            </h3>
            <ul className="space-y-1 text-sm text-mf-glass-text-secondary">
              {atlasEntry.basicActions.map((action) => (
                <li key={action}>• {action}</li>
              ))}
            </ul>
          </div>

          {subRegions.length > 0 ? (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
                Anatomical regions
              </h3>
              <ul className="space-y-2">
                {subRegions.map((region) => (
                  <li key={region.id} className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-sm font-semibold text-mf-glass-text">{region.displayName}</p>
                    <p className="text-xs text-mf-glass-text-muted">{region.shortDescription}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-mf-glass-text-muted">
                Region-specific exposure: not yet modeled — training analytics below are whole-muscle only.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "training" ? (
        <YourTrainingTab
          entry={entry}
          exerciseNames={exerciseNames}
          hasAnyLoggedData={hasAnyLoggedData}
          dataWindowWeeks={dataWindowWeeks}
          muscle={muscle}
        />
      ) : null}

      {tab === "exercises" ? <ExercisesTab muscle={muscle} availableEquipment={availableEquipment} /> : null}

      {tab === "dante" ? (
        <div className="min-h-0">
          <DanteChat
            compact
            heroSubtitle={`Ask about your ${MUSCLE_DISPLAY_NAME[muscle]}…`}
            contextPayload={{
              selectedMuscle: muscle,
              weeklyEffectiveSets: entry?.analytics.currentWeek.totalEffectiveSets ?? null,
              changePercent: entry?.analytics.changePercent ?? null,
              recentRange: entry?.baseline.recentRange ?? null,
              recommendation: entry?.recommendation.recommendation ?? null,
              recentExercises: entry
                ? entry.analytics.currentWeek.contributingExercises
                    .slice(0, 3)
                    .map((c) => exerciseNames[c.exerciseId] ?? "Unknown exercise")
                : [],
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function YourTrainingTab({
  entry,
  exerciseNames,
  hasAnyLoggedData,
  dataWindowWeeks,
  muscle,
}: {
  entry: MuscleMapEntry | null;
  exerciseNames: Record<string, string>;
  hasAnyLoggedData: boolean;
  dataWindowWeeks: number;
  muscle: CanonicalMuscle;
}) {
  if (!hasAnyLoggedData || !entry) {
    return (
      <div className="rounded-2xl border border-dashed border-mf-glass-border bg-white/[0.015] px-4 py-8 text-center">
        <p className="text-sm text-mf-glass-text-muted">
          Not enough logged training yet to show real analytics for this muscle.
        </p>
        <p className="mt-1 text-xs text-mf-glass-text-muted">
          Log a few workouts (no data in the last {dataWindowWeeks} week{dataWindowWeeks === 1 ? "" : "s"}) to unlock
          modeled volume, change and a recommendation here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Effective volume" value={entry.analytics.currentWeek.totalEffectiveSets} />
        <Stat label="Direct" value={entry.analytics.currentWeek.directSets} />
        <Stat label="Indirect (effective)" value={entry.analytics.currentWeek.indirectEffectiveSets} />
        <Stat label="Frequency" value={`${entry.analytics.frequency} session(s)`} />
        <Stat label="Previous week" value={entry.analytics.previousWeek?.totalEffectiveSets ?? "—"} />
        <Stat
          label="Change"
          value={
            entry.analytics.changePercent !== null
              ? `${entry.analytics.changePercent > 0 ? "+" : ""}${entry.analytics.changePercent}%`
              : "—"
          }
        />
        <Stat
          label="Personal range"
          value={entry.baseline.recentRange ? `${entry.baseline.recentRange.min}–${entry.baseline.recentRange.max}` : "Insufficient data"}
        />
        <Stat label="Performance" value={entry.recommendation.inputs.performanceTrend.replace("_", " ")} />
      </div>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
          Where did this volume come from?
        </h3>
        <ul className="space-y-1.5 text-sm">
          {entry.analytics.currentWeek.contributingExercises.map((c, index) => (
            <li
              key={`${c.exerciseId}-${index}`}
              className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
            >
              <span className="text-mf-glass-text-secondary">
                {exerciseNames[c.exerciseId] ?? "Unknown exercise"}
                <span className="ml-2 text-xs text-mf-glass-text-muted">
                  {c.role} · {c.eligibleSets} × {c.contribution}
                </span>
              </span>
              <span className="font-semibold text-mf-glass-text">{c.effectiveSets}</span>
            </li>
          ))}
          {entry.analytics.currentWeek.contributingExercises.length === 0 ? (
            <li className="text-mf-glass-text-muted">No contributing exercises logged this week.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-mf-glass-text-muted">
          <span>Recommendation</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] normal-case text-mf-glass-text-secondary">
            Confidence: {entry.recommendation.confidence}
          </span>
        </h3>
        <p className="mb-2 text-sm font-semibold text-mf-glass-text">
          {RECOMMENDATION_LABEL[entry.recommendation.recommendation]}
        </p>
        <ul className="space-y-1 text-xs text-mf-glass-text-muted">
          {entry.recommendation.signals.map((signal, index) => (
            <li key={index}>• {signal}</li>
          ))}
        </ul>
        {entry.recommendation.limitations.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-mf-glass-text-muted">
            {entry.recommendation.limitations.map((limitation, index) => (
              <li key={index}>△ {limitation}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <WhatIfPanel
        muscle={muscle}
        contributingExercises={entry.analytics.currentWeek.contributingExercises}
        exerciseNames={exerciseNames}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-mf-glass-text-muted">{label}</p>
      <p className="text-base font-semibold text-mf-glass-text">{value}</p>
    </div>
  );
}
