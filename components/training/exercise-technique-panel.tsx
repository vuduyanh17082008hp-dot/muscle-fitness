"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Eye, Sparkles } from "lucide-react";

import type { ExerciseLibraryItem } from "@/lib/workouts/exercise-library";
import { getExerciseMotion } from "@/lib/exercise-motion/data";
import { resolveCanonicalMuscles } from "@/lib/training/muscle-taxonomy";
import type { MuscleMapHighlights } from "@/components/training/muscle-map";

/**
 * VIEW TECHNIQUE trigger for an exercise card. Lazy-loads the
 * animation player and muscle map only once expanded — they pull in
 * SVG interpolation/animation logic that most visitors browsing the
 * library will never open, so it shouldn't ship in the initial
 * bundle for all 24 cards on the page (Part G: performance).
 */

const ExerciseMotionPlayer = dynamic(
  () => import("@/components/training/exercise-motion-player").then((m) => m.ExerciseMotionPlayer),
  { ssr: false },
);

const MuscleMap = dynamic(
  () => import("@/components/training/muscle-map").then((m) => m.MuscleMap),
  { ssr: false },
);

export function ExerciseTechniquePanel({ exercise }: { exercise: ExerciseLibraryItem }) {
  const [open, setOpen] = useState(false);
  const motion = getExerciseMotion(exercise.animationId);

  const highlights: MuscleMapHighlights = {};
  for (const muscle of resolveCanonicalMuscles([exercise.primaryMuscle])) {
    highlights[muscle] = "primary";
  }
  for (const muscle of resolveCanonicalMuscles(exercise.secondaryMuscles)) {
    if (!highlights[muscle]) highlights[muscle] = "secondary";
  }
  for (const muscle of resolveCanonicalMuscles(exercise.stabilizers ?? [])) {
    if (!highlights[muscle]) highlights[muscle] = "stabilizer";
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-orange-500/25 bg-orange-500/10 text-xs font-black uppercase tracking-[0.1em] text-orange-300 transition hover:bg-orange-500/20"
      >
        <Eye className="h-3.5 w-3.5" />
        View technique
      </button>

      {open ? (
        <div className="mt-4 space-y-4">
          {motion ? (
            <ExerciseMotionPlayer data={motion} />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center">
              <Sparkles className="size-5 text-zinc-600" />
              <p className="text-xs font-semibold text-zinc-400">
                Technique animation coming soon
              </p>
              <p className="text-[11px] leading-5 text-zinc-600">
                We only publish an animation once its motion data has been verified.
              </p>
            </div>
          )}

          {Object.keys(highlights).length > 0 ? (
            <MuscleMap highlights={highlights} />
          ) : null}

          {exercise.commonMistakes && exercise.commonMistakes.length > 0 ? (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                Common mistakes
              </p>
              <ul className="mt-2 space-y-1.5">
                {exercise.commonMistakes.map((mistake) => (
                  <li key={mistake} className="text-xs leading-6 text-zinc-500">
                    • {mistake}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
