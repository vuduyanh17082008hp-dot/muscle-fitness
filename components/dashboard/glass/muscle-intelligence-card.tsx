"use client";

import { useState } from "react";
import Link from "next/link";

import { MuscleMap, type MuscleMapHighlights } from "@/components/training/muscle-map";
import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import {
  RECOMMENDATION_LABEL,
  RECOMMENDATION_TONE,
  type MuscleIntelligenceEntry,
} from "@/lib/dashboard/muscle-intelligence";
import { StatusBadge } from "@/components/ui/status-badge";
import { GlassCard, GlassCardHeader } from "@/components/dashboard/glass/glass-card";

export type MuscleIntelligenceCardProps = {
  entries: MuscleIntelligenceEntry[];
  error?: boolean;
};

const LEGEND: Array<{ label: string; opacity: number }> = [
  { label: "High Focus", opacity: 0.85 },
  { label: "Moderate", opacity: 0.4 },
  { label: "Low", opacity: 0.3 },
];

export function MuscleIntelligenceCard({ entries, error = false }: MuscleIntelligenceCardProps) {
  const [selectedMuscle, setSelectedMuscle] = useState<CanonicalMuscle | null>(
    entries[0]?.muscle ?? null,
  );

  if (error) {
    return (
      <GlassCard data-testid="muscle-intelligence-card">
        <GlassCardHeader title="Muscle Intelligence" />
        <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-mf-glass-text-muted">Muscle Intelligence data couldn&apos;t be loaded.</p>
        </div>
      </GlassCard>
    );
  }

  if (entries.length === 0) {
    // Preview highlights — illustrative only, not fabricated analytics.
    // Shows what the map will look like once logged sets exist.
    const previewHighlights: MuscleMapHighlights = {
      chest: "primary",
      quadriceps: "secondary",
      latissimus_dorsi: "secondary",
      anterior_deltoid: "stabilizer",
    };

    return (
      <GlassCard data-testid="muscle-intelligence-card">
        <GlassCardHeader title="Muscle Intelligence" />

        <div className="mt-4 grid flex-1 gap-5 md:grid-cols-[minmax(0,200px)_1fr]">
          <div className="relative">
            <MuscleMap
              highlights={previewHighlights}
              legend={false}
              selectedMuscle="chest"
              accentColor="var(--mf-glass-brand)"
              className="border-mf-glass-border bg-black/10 opacity-90"
            />
            <p className="mt-2 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-mf-glass-text-muted">
              Preview
            </p>
          </div>

          <div className="flex flex-col justify-center gap-3">
            <div>
              <p className="text-sm font-semibold text-mf-glass-text">
                See which muscles your training actually hits
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-mf-glass-text-muted">
                Complete logged workouts and this map fills with real exposure —
                not guesses.
              </p>
            </div>

            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-medium uppercase tracking-[0.06em] text-mf-glass-text-secondary">
              {[
                "Complete workout",
                "Logged sets",
                "Muscle exposure",
                "Volume / frequency",
                "Dante recommendation",
              ].map((step, index) => (
                <li key={step} className="flex items-center gap-1.5">
                  {index > 0 ? (
                    <span className="text-mf-glass-text-muted" aria-hidden="true">
                      →
                    </span>
                  ) : null}
                  <span className="rounded-md border border-mf-glass-border bg-white/[0.03] px-1.5 py-0.5">
                    {step}
                  </span>
                </li>
              ))}
            </ol>

            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-mf-glass-text-muted">
              <li>Trained muscle exposure</li>
              <li>Effective sets</li>
              <li>Session frequency</li>
              <li>Training emphasis</li>
            </ul>

            <Link
              href="/dashboard/workouts"
              className="mt-0.5 inline-flex h-9 w-fit items-center justify-center rounded-xl bg-mf-glass-brand px-4 text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
            >
              Log a Workout
            </Link>
          </div>
        </div>
      </GlassCard>
    );
  }

  const highlights: MuscleMapHighlights = Object.fromEntries(
    entries.map((entry) => [entry.muscle, entry.exposureTier]),
  );

  const selected = entries.find((entry) => entry.muscle === selectedMuscle) ?? entries[0];

  return (
    <GlassCard data-testid="muscle-intelligence-card">
      <GlassCardHeader title="Muscle Intelligence" />

      <div className="mt-4 grid flex-1 gap-6 md:grid-cols-[minmax(0,220px)_1fr]">
        <div>
          <MuscleMap
            highlights={highlights}
            legend={false}
            selectedMuscle={selected?.muscle ?? null}
            onSelectMuscle={setSelectedMuscle}
            accentColor="var(--mf-glass-brand)"
            className="border-mf-glass-border bg-black/10"
          />

          <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {LEGEND.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5 text-[10px] font-semibold text-mf-glass-text-muted">
                <span
                  className="size-2 rounded-full bg-mf-glass-brand"
                  style={{ opacity: item.opacity }}
                  aria-hidden="true"
                />
                {item.label}
              </span>
            ))}
          </div>

          {/* Accessible text alternative to the interactive body map. */}
          <ul className="sr-only">
            {entries.map((entry) => (
              <li key={entry.muscle}>
                {MUSCLE_DISPLAY_NAME[entry.muscle]}: {entry.totalEffectiveSets} weekly effective sets
              </li>
            ))}
          </ul>
        </div>

        {selected ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
              {MUSCLE_DISPLAY_NAME[selected.muscle]}
            </p>

            <div className="mt-1 flex items-end gap-2">
              <span className="text-3xl font-bold tabular-nums text-mf-glass-text">
                {selected.totalEffectiveSets}
              </span>
              <span className="pb-1 text-xs font-semibold text-mf-glass-text-muted">weekly effective sets</span>
            </div>

            <p className="mt-0.5 text-xs text-mf-glass-text-muted">
              {selected.directSets} direct sets · trained {selected.frequency} session
              {selected.frequency === 1 ? "" : "s"} this week
            </p>

            <div className="mt-3">
              <StatusBadge label={RECOMMENDATION_LABEL[selected.status]} tone={RECOMMENDATION_TONE[selected.status]} />
            </div>

            {selected.topExercises.length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
                  Top Exercises
                </p>
                <ol className="mt-2 space-y-1.5">
                  {selected.topExercises.map((exercise, index) => (
                    <li key={exercise.exerciseId} className="flex items-center justify-between text-sm">
                      <span className="text-mf-glass-text-secondary">
                        {index + 1}. {exercise.name}
                      </span>
                      <span className="text-xs font-semibold text-mf-glass-text-muted">
                        {exercise.effectiveSets} sets
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {/* Muscle group buttons — a keyboard/mobile-friendly alternative to clicking the body map directly. */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {entries.map((entry) => (
                <button
                  key={entry.muscle}
                  type="button"
                  onClick={() => setSelectedMuscle(entry.muscle)}
                  aria-pressed={entry.muscle === selected.muscle}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    entry.muscle === selected.muscle
                      ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand"
                      : "border-mf-glass-border text-mf-glass-text-muted hover:text-mf-glass-text-secondary"
                  }`}
                >
                  {MUSCLE_DISPLAY_NAME[entry.muscle]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Link
                href="/dashboard/training-intelligence"
                className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-mf-glass-border bg-white/[0.02] px-4 text-xs font-bold uppercase tracking-[0.06em] text-mf-glass-text-secondary transition hover:border-mf-glass-brand-border hover:text-mf-glass-text"
              >
                Open Muscle Intelligence
              </Link>

              <Link
                href="/dashboard/ai-coach"
                className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-mf-glass-dante/30 bg-mf-glass-dante/10 px-4 text-xs font-bold uppercase tracking-[0.06em] text-violet-200 transition hover:bg-mf-glass-dante/20"
              >
                Ask Dante
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
