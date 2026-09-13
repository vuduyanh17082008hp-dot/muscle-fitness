"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import type { DanteMemory, CoachingPreference } from "@/lib/dante-core/memory";
import { CANONICAL_MUSCLES, MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { cn } from "@/lib/cn";

/**
 * Dante Memory editor — the "visible, editable, deletable" UI the
 * spec requires. Every field here is something the USER wrote/chose;
 * there is no hidden Dante-authored memory to display, because none
 * exists (see lib/dante-core/memory.ts).
 */

const COACHING_OPTIONS: Array<{ value: CoachingPreference; label: string }> = [
  { value: "direct", label: "Direct" },
  { value: "encouraging", label: "Encouraging" },
  { value: "detailed", label: "Detailed" },
  { value: "concise", label: "Concise" },
];

function TagList({
  label,
  values,
  onRemove,
  onAdd,
  placeholder,
}: {
  label: string;
  values: string[];
  onRemove: (value: string) => void;
  onAdd: (value: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">{label}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200"
          >
            {value}
            <button
              type="button"
              onClick={() => onRemove(value)}
              aria-label={`Remove ${value}`}
              className="text-amber-300/70 hover:text-amber-100"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = draft.trim();
          if (trimmed && !values.includes(trimmed)) {
            onAdd(trimmed);
          }
          setDraft("");
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          className="h-9 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-300 transition-colors duration-200 hover:bg-white/[0.08]"
        >
          Add
        </button>
      </form>
    </div>
  );
}

export function DanteMemoryEditor({ initialMemory }: { initialMemory: DanteMemory }) {
  const [memory, setMemory] = useState(initialMemory);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(patch: Partial<DanteMemory>) {
    const next = { ...memory, ...patch };
    setMemory(next);
    setStatus("saving");

    try {
      const response = await fetch("/api/dante/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredExercises: next.preferredExercises,
          dislikedExercises: next.dislikedExercises,
          weakPointPriorities: next.weakPointPriorities,
          coachingPreference: next.coachingPreference,
        }),
      });

      if (!response.ok) throw new Error("Save failed");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  async function clearAll() {
    setStatus("saving");
    try {
      const response = await fetch("/api/dante/memory", { method: "DELETE" });
      if (!response.ok) throw new Error("Clear failed");
      setMemory({
        preferredExercises: [],
        dislikedExercises: [],
        weakPointPriorities: [],
        coachingPreference: null,
        updatedAt: null,
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  function toggleWeakPoint(muscle: CanonicalMuscle) {
    const has = memory.weakPointPriorities.includes(muscle);
    void save({
      weakPointPriorities: has
        ? memory.weakPointPriorities.filter((m) => m !== muscle)
        : [...memory.weakPointPriorities, muscle],
    });
  }

  return (
    <div className="space-y-5">
      <TagList
        label="Preferred exercises"
        values={memory.preferredExercises}
        placeholder="e.g. Romanian Deadlift"
        onAdd={(value) => void save({ preferredExercises: [...memory.preferredExercises, value] })}
        onRemove={(value) =>
          void save({ preferredExercises: memory.preferredExercises.filter((v) => v !== value) })
        }
      />

      <TagList
        label="Disliked exercises"
        values={memory.dislikedExercises}
        placeholder="e.g. Burpees"
        onAdd={(value) => void save({ dislikedExercises: [...memory.dislikedExercises, value] })}
        onRemove={(value) =>
          void save({ dislikedExercises: memory.dislikedExercises.filter((v) => v !== value) })
        }
      />

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">Weak-point priorities</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CANONICAL_MUSCLES.map((muscle) => {
            const active = memory.weakPointPriorities.includes(muscle);
            return (
              <button
                key={muscle}
                type="button"
                onClick={() => toggleWeakPoint(muscle)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
                  active
                    ? "border-amber-400/30 bg-amber-400/15 text-amber-200"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]",
                )}
              >
                {MUSCLE_DISPLAY_NAME[muscle]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-500">Coaching preference</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {COACHING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => void save({ coachingPreference: option.value })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200",
                memory.coachingPreference === option.value
                  ? "border-amber-400/30 bg-amber-400/15 text-amber-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={clearAll}
          className="text-xs font-bold text-zinc-500 transition-colors duration-200 hover:text-rose-400"
        >
          Clear all
        </button>

        {status === "saving" ? (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Loader2 className="size-3 animate-spin" /> Saving…
          </span>
        ) : status === "saved" ? (
          <span className="text-xs text-emerald-400">Saved</span>
        ) : status === "error" ? (
          <span className="text-xs text-rose-400">Couldn&apos;t save — try again</span>
        ) : null}
      </div>
    </div>
  );
}
