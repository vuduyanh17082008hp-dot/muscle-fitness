"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Dumbbell, SearchIcon } from "lucide-react";

import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { LOCAL_EXERCISE_LIBRARY, type ExerciseDifficulty } from "@/lib/workouts/exercise-library";
import { filterExercisesForMuscle } from "@/lib/workouts/filter-exercises-for-muscle";

const DIFFICULTIES: ExerciseDifficulty[] = ["beginner", "intermediate", "advanced"];

export function ExercisesTab({
  muscle,
  availableEquipment,
}: {
  muscle: CanonicalMuscle;
  availableEquipment: string[];
}) {
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty | null>(null);
  const [showAll, setShowAll] = useState(availableEquipment.length === 0);

  const matches = useMemo(
    () =>
      filterExercisesForMuscle(LOCAL_EXERCISE_LIBRARY, muscle, {
        availableEquipment: showAll ? "all" : availableEquipment,
        difficulty: difficulty ?? undefined,
      }),
    [muscle, availableEquipment, showAll, difficulty],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {DIFFICULTIES.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setDifficulty((current) => (current === level ? null : level))}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              difficulty === level
                ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand"
                : "border-mf-glass-border text-mf-glass-text-muted hover:text-mf-glass-text-secondary"
            }`}
          >
            {level}
          </button>
        ))}

        {availableEquipment.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className={`ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              showAll
                ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand"
                : "border-mf-glass-border text-mf-glass-text-muted hover:text-mf-glass-text-secondary"
            }`}
          >
            {showAll ? "Showing All Equipment" : "Show All"}
          </button>
        ) : null}
      </div>

      {matches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-mf-glass-border bg-white/[0.015] px-4 py-6 text-center text-sm text-mf-glass-text-muted">
          No matching exercises for these filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map(({ exercise, involvement }) => (
            <li
              key={exercise.id ?? exercise.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-mf-glass-border bg-white/[0.015] px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-mf-glass-border bg-white/[0.02] text-mf-glass-text-muted">
                  <Dumbbell className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-mf-glass-text">{exercise.name}</p>
                  <p className="truncate text-xs text-mf-glass-text-muted">
                    {exercise.equipment} · {exercise.movementPattern}
                  </p>
                </div>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                  involvement === "primary"
                    ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand"
                    : "border-mf-glass-border bg-white/5 text-mf-glass-text-muted"
                }`}
              >
                {involvement}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/dashboard/workouts/library?muscle=${muscle}`}
        className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-mf-glass-border text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary transition hover:border-mf-glass-brand-border hover:text-mf-glass-brand"
      >
        <SearchIcon className="size-3.5" aria-hidden="true" />
        Find Exercises
      </Link>
    </div>
  );
}
