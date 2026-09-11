"use client";

import { useState } from "react";

import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { MuscleContributionBreakdownEntry } from "@/lib/training/volume-engine";

type WhatIfResponse = {
  ok: boolean;
  current: Record<string, { totalEffectiveSets: number }>;
  simulated: Record<string, { totalEffectiveSets: number }>;
  changedMuscles: CanonicalMuscle[];
  error?: string;
};

type WhatIfPanelProps = {
  muscle: CanonicalMuscle;
  contributingExercises: MuscleContributionBreakdownEntry[];
  exerciseNames: Record<string, string>;
};

/**
 * Preview-only What-If simulator (spec §24-§26). Calls the read-only
 * /api/training-intelligence/what-if endpoint — never writes to a
 * real workout or plan. Applying a change to a real plan is
 * intentionally out of scope for this phase.
 */
export function WhatIfPanel({ muscle, contributingExercises, exerciseNames }: WhatIfPanelProps) {
  const [exerciseId, setExerciseId] = useState(contributingExercises[0]?.exerciseId ?? "");
  const [setDelta, setSetDelta] = useState(2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (contributingExercises.length === 0) {
    return null;
  }

  async function runSimulation() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/training-intelligence/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deltas: [{ exerciseId, setDelta }] }),
      });

      const data = (await response.json()) as WhatIfResponse;

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Unable to run the simulation.");
        setResult(null);
        return;
      }

      setResult(data);
    } catch {
      setError("Unable to reach the simulator right now.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
        What if I change my training?
      </h3>
      <p className="mb-3 text-xs text-zinc-500">
        Preview only — this never changes your logged workouts or plan.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={exerciseId}
          onChange={(event) => setExerciseId(event.target.value)}
          className="min-h-10 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white"
        >
          {contributingExercises.map((c) => (
            <option key={c.exerciseId} value={c.exerciseId}>
              {exerciseNames[c.exerciseId] ?? "Unknown exercise"}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease sets"
            onClick={() => setSetDelta((v) => Math.max(-10, v - 1))}
            className="h-9 w-9 rounded-lg border border-white/10 text-white hover:bg-white/10"
          >
            −
          </button>
          <span className="w-10 text-center text-sm font-semibold text-white">
            {setDelta > 0 ? `+${setDelta}` : setDelta}
          </span>
          <button
            type="button"
            aria-label="Increase sets"
            onClick={() => setSetDelta((v) => Math.min(10, v + 1))}
            className="h-9 w-9 rounded-lg border border-white/10 text-white hover:bg-white/10"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={runSimulation}
          disabled={loading}
          className="min-h-10 rounded-lg bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Simulating…" : "Simulate"}
        </button>
      </div>

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

      {result ? (
        <div className="mt-3 space-y-1.5 text-sm">
          {result.changedMuscles.length === 0 ? (
            <p className="text-zinc-500">No muscle-level change from this simulation.</p>
          ) : (
            result.changedMuscles.map((affectedMuscle) => (
              <div
                key={affectedMuscle}
                className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2"
              >
                <span className="text-zinc-300">
                  {MUSCLE_DISPLAY_NAME[affectedMuscle]}
                  {affectedMuscle === muscle ? " (this muscle)" : ""}
                </span>
                <span className="font-semibold text-white">
                  {result.current[affectedMuscle]?.totalEffectiveSets ?? 0} →{" "}
                  {result.simulated[affectedMuscle]?.totalEffectiveSets ?? 0}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
