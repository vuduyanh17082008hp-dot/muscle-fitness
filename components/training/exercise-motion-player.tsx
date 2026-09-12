"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Gauge } from "lucide-react";
import { useReducedMotion } from "framer-motion";

import { BONES, JOINT_IDS, type ExerciseMotionData, type Pose } from "@/lib/exercise-motion/types";
import { cn } from "@/lib/cn";

/**
 * ONE reusable player for every exercise's technique animation — a
 * procedural SVG joint-vector renderer, not a video/GIF. It ping-pongs
 * forward then backward through `data.phases` so a 2-phase dataset
 * (start/end) reads as a continuous repetition, interpolating
 * linearly between whichever two phases the current time sits
 * between.
 */

type ExerciseMotionPlayerProps = {
  data: ExerciseMotionData;
  className?: string;
};

const PHASE_DURATION_MS = 1100;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const result = {} as Pose;
  for (const joint of JOINT_IDS) {
    result[joint] = {
      x: lerp(a[joint].x, b[joint].x, t),
      y: lerp(a[joint].y, b[joint].y, t),
    };
  }
  return result;
}

/** Builds the ping-pong sequence of phase indices, e.g. [0,1,2] -> [0,1,2,1]. */
function buildLoopSequence(phaseCount: number): number[] {
  if (phaseCount <= 1) return [0];
  const forward = Array.from({ length: phaseCount }, (_, i) => i);
  const backward = forward.slice(1, -1).reverse();
  return [...forward, ...backward];
}

export function ExerciseMotionPlayer({ data, className }: ExerciseMotionPlayerProps) {
  const reduceMotion = useReducedMotion();
  const sequence = useMemo(() => buildLoopSequence(data.phases.length), [data.phases.length]);

  const [playing, setPlaying] = useState(!reduceMotion);
  const [slow, setSlow] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }

    const duration = PHASE_DURATION_MS * (slow ? 2.2 : 1);

    function tick(ts: number) {
      if (lastTsRef.current === null) {
        lastTsRef.current = ts;
      }
      const delta = ts - lastTsRef.current;
      lastTsRef.current = ts;

      setProgress((prev) => {
        let next = prev + delta / duration;
        if (next >= 1) {
          next = 0;
          setStep((s) => (s + 1) % sequence.length);
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, slow, sequence.length]);

  const fromPhase = data.phases[sequence[step]];
  const toPhase = data.phases[sequence[(step + 1) % sequence.length]];
  const pose = useMemo(
    () => lerpPose(fromPhase.pose, toPhase.pose, progress),
    [fromPhase, toPhase, progress],
  );

  function handleReplay() {
    setStep(0);
    setProgress(0);
    setPlaying(!reduceMotion);
  }

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-black/30 p-4", className)}>
      <svg
        viewBox={data.viewBox ?? "0 0 120 160"}
        role="img"
        aria-label={`${data.name} technique animation`}
        className="mx-auto h-56 w-full max-w-[220px]"
      >
        {BONES.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={pose[a].x}
            y1={pose[a].y}
            x2={pose[b].x}
            y2={pose[b].y}
            stroke="var(--color-domain-training)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}

        {JOINT_IDS.filter((j) => j !== "head").map((joint) => (
          <circle key={joint} cx={pose[joint].x} cy={pose[joint].y} r={2.6} fill="#fff" />
        ))}

        <circle cx={pose.head.x} cy={pose.head.y} r={7} fill="#fff" />
      </svg>

      <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
        {fromPhase.label}
        {progress > 0.5 ? ` → ${toPhase.label}` : ""}
      </p>

      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause animation" : "Play animation"}
          className="grid size-11 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-200 transition-colors duration-200 hover:bg-white/[0.08]"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>

        <button
          type="button"
          onClick={handleReplay}
          aria-label="Replay animation"
          className="grid size-11 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-200 transition-colors duration-200 hover:bg-white/[0.08]"
        >
          <RotateCcw className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setSlow((s) => !s)}
          aria-pressed={slow}
          aria-label="Toggle slow motion"
          className={cn(
            "flex h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors duration-200",
            slow
              ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
              : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]",
          )}
        >
          <Gauge className="size-3.5" />
          Slow
        </button>
      </div>
    </div>
  );
}
