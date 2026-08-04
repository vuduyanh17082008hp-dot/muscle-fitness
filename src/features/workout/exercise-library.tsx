"use client";

import { useMemo, useState } from "react";
import type { Exercise, MuscleGroup } from "@/features/workout/types";

const MUSCLES: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "forearms",
  "traps",
];

export function ExerciseLibrary({ exercises }: { exercises: Exercise[] }) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [selected, setSelected] = useState<Exercise | null>(null);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.equipment.includes(q) ||
        ex.primaryMuscle.includes(q);
      const matchesMuscle =
        muscle === "all" ||
        ex.primaryMuscle === muscle ||
        ex.secondaryMuscles.includes(muscle);
      return matchesQuery && matchesMuscle;
    });
  }, [exercises, query, muscle]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, muscle, equipment..."
            className="flex-1 border border-ink/15 bg-bone px-3 py-2 text-sm outline-none focus:border-lime-deep"
          />
          <select
            value={muscle}
            onChange={(e) =>
              setMuscle(e.target.value as MuscleGroup | "all")
            }
            className="border border-ink/15 bg-bone px-3 py-2 text-sm"
          >
            <option value="all">All muscles</option>
            {MUSCLES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 divide-y divide-ink/10 border border-ink/10">
          {filtered.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => setSelected(ex)}
              className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-mist ${
                selected?.id === ex.id ? "bg-mist" : "bg-bone"
              }`}
            >
              <div>
                <p className="font-medium text-ink">{ex.name}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-steel">
                  {ex.primaryMuscle}
                  {ex.secondaryMuscles.length
                    ? ` · ${ex.secondaryMuscles.join(", ")}`
                    : ""}
                </p>
              </div>
              <span className="text-xs text-steel">{ex.equipment}</span>
            </button>
          ))}
          {!filtered.length && (
            <p className="px-4 py-8 text-sm text-steel">No exercises match.</p>
          )}
        </div>
      </div>

      <aside className="border border-ink/10 bg-bone p-5">
        {selected ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-display text-2xl tracking-wide text-ink">
                {selected.name}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-lime-deep">
                {selected.difficulty} · {selected.equipment}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-steel">
                Primary / secondary
              </p>
              <p className="mt-1 text-ink">
                {selected.primaryMuscle}
                {selected.secondaryMuscles.length
                  ? ` + ${selected.secondaryMuscles.join(", ")}`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-steel">
                Instructions
              </p>
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-ink">
                {selected.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-steel">
                Technique cues
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-ink">
                {selected.techniqueCues.map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
            </div>
            {selected.contraindications.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-steel">
                  Contraindications
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-ink">
                  {selected.contraindications.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.mediaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.mediaUrl}
                alt={selected.name}
                className="mt-2 aspect-video w-full object-cover"
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-steel">
            Select an exercise to view instructions, cues, media, and
            contraindications.
          </p>
        )}
      </aside>
    </div>
  );
}
