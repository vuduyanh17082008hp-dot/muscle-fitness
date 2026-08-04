"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Exercise,
  NextSessionRecommendation,
  WorkoutSession,
} from "@/features/workout/types";
import { RestTimer } from "./rest-timer";

export function WorkoutPlayer({
  initialSession,
  exercises,
  initialRecommendation = null,
}: {
  initialSession: WorkoutSession;
  exercises: Exercise[];
  initialRecommendation?: NextSessionRecommendation | null;
}) {
  const router = useRouter();
  const [session, setSession] = useState(initialSession);
  const [recommendation, setRecommendation] =
    useState<NextSessionRecommendation | null>(initialRecommendation);
  const [activeExerciseId, setActiveExerciseId] = useState(
    initialSession.exercises.find((e) => !e.skipped)?.id ??
      initialSession.exercises[0]?.id,
  );
  const [restFor, setRestFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { weightKg: string; reps: string; rir: string }>
  >({});

  const exerciseMap = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  const active = session.exercises.find((e) => e.id === activeExerciseId);

  function draftFor(setId: string, fallback?: { weightKg: number; reps: number; rir?: number }) {
    return (
      drafts[setId] ?? {
        weightKg: fallback?.weightKg ? String(fallback.weightKg) : "",
        reps: fallback?.reps ? String(fallback.reps) : "",
        rir:
          typeof fallback?.rir === "number" ? String(fallback.rir) : "",
      }
    );
  }

  async function postAction(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setSession(data.session);
      if (data.recommendation) setRecommendation(data.recommendation);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function completeSet(setId: string) {
    if (!active) return;
    const draft = draftFor(setId);
    const weightKg = Number(draft.weightKg);
    const reps = Number(draft.reps);
    const rir = draft.rir === "" ? undefined : Number(draft.rir);
    if (Number.isNaN(weightKg) || Number.isNaN(reps)) {
      setError("Enter valid weight and reps.");
      return;
    }
    const data = await postAction({
      action: "log_set",
      sessionExerciseId: active.id,
      setId,
      weightKg,
      reps,
      rir,
    });
    if (data) setRestFor(active.restSeconds);
  }

  async function finishWorkout() {
    const data = await postAction({ action: "complete" });
    if (data) router.refresh();
  }

  if (session.status === "completed") {
    return (
      <div className="space-y-6">
        <div className="border border-lime bg-ink p-6 text-bone">
          <p className="text-xs uppercase tracking-[0.16em] text-lime">
            Workout saved
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-wide">
            {session.name}
          </h1>
          <p className="mt-2 text-sm text-bone/70">
            Completed {session.completedAt
              ? new Date(session.completedAt).toLocaleString()
              : ""}
          </p>
        </div>

        {recommendation && (
          <div className="border border-ink/10 bg-bone p-5">
            <h2 className="font-display text-2xl tracking-wide text-ink">
              Next-session recommendation
            </h2>
            <p className="mt-2 text-sm text-steel">{recommendation.summary}</p>
            {recommendation.deloadSuggested && (
              <p className="mt-3 inline-block bg-lime px-2 py-1 text-xs font-semibold uppercase tracking-wider text-ink">
                Deload suggested
              </p>
            )}
            <ul className="mt-4 space-y-3">
              {recommendation.adjustments.map((adj) => (
                <li key={adj.exerciseId} className="border-t border-ink/10 pt-3">
                  <p className="font-medium text-ink">{adj.exerciseName}</p>
                  <p className="text-xs uppercase tracking-wider text-lime-deep">
                    {adj.action.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-sm text-steel">{adj.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/history"
            className="bg-ink px-4 py-2 text-sm font-semibold text-lime"
          >
            View history
          </Link>
          <Link
            href="/dashboard/progress"
            className="border border-ink/20 px-4 py-2 text-sm text-ink hover:bg-mist"
          >
            Progression
          </Link>
          <Link
            href="/dashboard/workouts"
            className="border border-ink/20 px-4 py-2 text-sm text-ink hover:bg-mist"
          >
            Open next workout
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-steel">
          Exercise list
        </p>
        {session.exercises.map((se) => {
          const name = exerciseMap.get(se.exerciseId)?.name ?? se.exerciseId;
          const done =
            se.skipped ||
            se.sets.every((s) => s.completed || s.skipped);
          return (
            <button
              key={se.id}
              type="button"
              onClick={() => setActiveExerciseId(se.id)}
              className={`block w-full px-3 py-2 text-left text-sm ${
                se.id === active?.id
                  ? "bg-ink text-lime"
                  : done
                    ? "bg-mist text-steel"
                    : "border border-ink/10 text-ink hover:bg-mist"
              }`}
            >
              {se.skipped ? `(skipped) ${name}` : name}
            </button>
          );
        })}
        <button
          type="button"
          disabled={busy}
          onClick={finishWorkout}
          className="mt-4 w-full bg-lime px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
        >
          Finish workout
        </button>
      </aside>

      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-steel">
            {session.name}
          </p>
          <h1 className="font-display text-3xl tracking-wide text-ink">
            {active
              ? exerciseMap.get(active.exerciseId)?.name
              : "Select exercise"}
          </h1>
          {active && (
            <p className="mt-1 text-sm text-steel">
              Target {active.repMin}–{active.repMax} reps
              {typeof active.targetRir === "number"
                ? ` @ RIR ${active.targetRir}`
                : typeof active.targetRpe === "number"
                  ? ` @ RPE ${active.targetRpe}`
                  : ""}
              {active.tempo ? ` · tempo ${active.tempo}` : ""} · rest{" "}
              {active.restSeconds}s
            </p>
          )}
          {active?.previousBest && (
            <p className="mt-2 text-sm text-ink">
              Previous best: {active.previousBest.weightKg} kg ×{" "}
              {active.previousBest.reps} (e1RM{" "}
              {active.previousBest.estimated1Rm} kg)
            </p>
          )}
          {active?.coachNotes && (
            <p className="mt-2 border-l-2 border-lime pl-3 text-sm text-steel">
              {active.coachNotes}
            </p>
          )}
        </div>

        {restFor !== null && (
          <RestTimer
            seconds={restFor}
            active
            onDone={() => setRestFor(null)}
          />
        )}
        {restFor !== null && (
          <button
            type="button"
            onClick={() => setRestFor(null)}
            className="text-xs text-steel underline"
          >
            Skip rest
          </button>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        {active && !active.skipped && (
          <div className="space-y-3">
            {active.sets.map((set) => {
              const draft = draftFor(set.id, set);
              return (
                <div
                  key={set.id}
                  className={`grid grid-cols-2 gap-2 border p-3 md:grid-cols-5 ${
                    set.completed
                      ? "border-lime-deep/40 bg-mist"
                      : "border-ink/10 bg-bone"
                  }`}
                >
                  <p className="col-span-2 text-sm font-medium text-ink md:col-span-1">
                    Set {set.setNumber}
                    {set.completed ? " ✓" : ""}
                  </p>
                  <label className="text-xs text-steel">
                    Weight (kg)
                    <input
                      disabled={set.completed || busy}
                      value={draft.weightKg}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [set.id]: { ...draft, weightKg: e.target.value },
                        }))
                      }
                      className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink disabled:opacity-60"
                    />
                  </label>
                  <label className="text-xs text-steel">
                    Reps
                    <input
                      disabled={set.completed || busy}
                      value={draft.reps}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [set.id]: { ...draft, reps: e.target.value },
                        }))
                      }
                      className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink disabled:opacity-60"
                    />
                  </label>
                  <label className="text-xs text-steel">
                    RIR
                    <input
                      disabled={set.completed || busy}
                      value={draft.rir}
                      onChange={(e) =>
                        setDrafts((d) => ({
                          ...d,
                          [set.id]: { ...draft, rir: e.target.value },
                        }))
                      }
                      className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink disabled:opacity-60"
                    />
                  </label>
                  {!set.completed && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => completeSet(set.id)}
                      className="col-span-2 bg-ink px-3 py-2 text-sm font-semibold text-lime md:col-span-5"
                    >
                      Complete set
                    </button>
                  )}
                </div>
              );
            })}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  postAction({
                    action: "skip_exercise",
                    sessionExerciseId: active.id,
                  })
                }
                className="border border-ink/20 px-3 py-2 text-sm text-ink hover:bg-mist"
              >
                Skip exercise
              </button>
              <select
                disabled={busy}
                className="border border-ink/20 bg-bone px-3 py-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const newExerciseId = e.target.value;
                  if (!newExerciseId) return;
                  postAction({
                    action: "replace_exercise",
                    sessionExerciseId: active.id,
                    newExerciseId,
                  });
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Replace exercise...
                </option>
                {exercises
                  .filter((ex) => ex.id !== active.exerciseId)
                  .map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {active?.skipped && (
          <p className="text-sm text-steel">This exercise was skipped.</p>
        )}
      </div>
    </div>
  );
}
