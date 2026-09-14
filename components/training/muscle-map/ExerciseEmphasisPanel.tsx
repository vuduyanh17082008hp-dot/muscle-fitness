"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Search } from "lucide-react";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { buildExerciseEmphasisMap } from "@/lib/training/muscle-highlight";
import type { ExerciseRecord } from "@/lib/workouts/providers/types";

// Lazy, same treatment as MuscleDetailPanel's Ask Dante tab — only
// loaded once a client actually asks Dante about an exercise.
const DanteChat = dynamic(() => import("@/components/dante-chat"), { ssr: false });

export type ExerciseEmphasisPanelProps = {
  record: ExerciseRecord | null;
};

/**
 * Exercise Mode's right-column detail panel — deliberately a SEPARATE
 * component from MuscleDetailPanel rather than a third branch bolted
 * onto it, because the two must never be visually confused (spec:
 * "Exercise Emphasis" vs "Recent Training Exposure" are different
 * claims about different data). Every muscle list here comes straight
 * from the exercise's own canonical primaryMuscles/secondaryMuscles/
 * stabilizers — never invented.
 */
export function ExerciseEmphasisPanel({ record }: ExerciseEmphasisPanelProps) {
  const [showDante, setShowDante] = useState(false);

  if (!record) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6 text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-mf-glass-text">Select an Exercise</p>
        <p className="max-w-xs text-sm text-mf-glass-text-muted">
          See exactly which muscles a movement trains, and how strongly, before you add it to a session.
        </p>
      </div>
    );
  }

  const emphasis = buildExerciseEmphasisMap(record);
  const primary = record.primaryMuscles;
  const secondary = record.secondaryMuscles.filter((muscle) => emphasis[muscle] === "secondary");
  const supporting = record.stabilizers.filter((muscle) => emphasis[muscle] === "supporting");

  if (showDante) {
    return (
      <div className="flex h-full min-h-[420px] flex-col gap-4 rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold uppercase tracking-wide text-mf-glass-text">{record.canonicalName}</h2>
          <button
            type="button"
            onClick={() => setShowDante(false)}
            className="text-xs font-semibold text-mf-glass-text-muted transition hover:text-mf-glass-text"
          >
            Back
          </button>
        </div>
        <div className="min-h-[380px] flex-1">
          <DanteChat
            compact
            heroSubtitle={`Ask about ${record.canonicalName}…`}
            contextPayload={{
              selectedExercise: record.canonicalName,
              primaryMuscles: primary,
              secondaryMuscles: secondary,
              supportingMuscles: supporting,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-5 rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mf-glass-analytics">
          Expected Training Emphasis
        </p>
        <h2 className="mt-1 text-lg font-bold uppercase tracking-wide text-mf-glass-text">{record.canonicalName}</h2>
        <p className="mt-1 text-xs text-mf-glass-text-muted">
          {record.equipment.join(", ")} · {record.movementPattern}
        </p>
      </div>

      <div className="space-y-3">
        <EmphasisRow label="Primary" tone="primary" muscles={primary} />
        {secondary.length > 0 ? <EmphasisRow label="Secondary" tone="secondary" muscles={secondary} /> : null}
        {supporting.length > 0 ? <EmphasisRow label="Supporting" tone="supporting" muscles={supporting} /> : null}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          href={`/dashboard/workouts/library?muscle=${primary[0] ?? ""}`}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-mf-glass-border text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary transition hover:border-mf-glass-brand-border hover:text-mf-glass-brand"
        >
          <Search className="size-3.5" aria-hidden="true" />
          View Technique
        </Link>

        <button
          type="button"
          onClick={() => setShowDante(true)}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-mf-glass-dante/15 text-xs font-bold uppercase tracking-[0.08em] text-violet-200 transition hover:bg-mf-glass-dante/25"
        >
          Ask Dante About This
        </button>
      </div>
    </div>
  );
}

const TONE_CLASS: Record<"primary" | "secondary" | "supporting", string> = {
  primary: "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand",
  secondary: "border-mf-glass-border bg-white/5 text-mf-glass-text-secondary",
  supporting: "border-mf-glass-border bg-white/[0.02] text-mf-glass-text-muted",
};

function EmphasisRow({
  label,
  tone,
  muscles,
}: {
  label: string;
  tone: "primary" | "secondary" | "supporting";
  muscles: CanonicalMuscle[];
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-mf-glass-text-muted">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {muscles.map((muscle) => (
          <span
            key={muscle}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASS[tone]}`}
          >
            {MUSCLE_DISPLAY_NAME[muscle]}
          </span>
        ))}
      </div>
    </div>
  );
}
