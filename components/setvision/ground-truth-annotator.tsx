"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Flag, Square, Upload } from "lucide-react";

import type { SetVisionExerciseId } from "@/lib/setvision/types";
import type { GroundTruthAnnotation } from "@/lib/setvision/benchmark/types";

/**
 * Manual ground-truth annotation tool (spec Part B §24).
 *
 * Internal/dev tool, not part of the end-user product surface. Its
 * only purpose is to start building a real labeled video dataset —
 * exercise label, rep boundaries, and (optionally) a human-judged ROM
 * per rep — so the benchmarking framework in lib/setvision/benchmark/
 * has something real to run against. See docs/setvision.md: no
 * accuracy claim anywhere is valid until that dataset exists.
 */

const EXERCISES: SetVisionExerciseId[] = ["bench_press", "squat", "deadlift"];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2);
  return `${m}:${s.padStart(5, "0")}`;
}

export function GroundTruthAnnotator() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoId, setVideoId] = useState("");
  const [exercise, setExercise] = useState<SetVisionExerciseId>("squat");
  const [currentTime, setCurrentTime] = useState(0);
  const [pendingStartMs, setPendingStartMs] = useState<number | null>(null);
  const [reps, setReps] = useState<Array<{ startMs: number; endMs: number }>>([]);
  const [annotatorName, setAnnotatorName] = useState("");

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setVideoUrl(URL.createObjectURL(file));
    setVideoId(file.name);
    setReps([]);
    setPendingStartMs(null);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleMarkStart = useCallback(() => {
    if (!videoRef.current) return;
    setPendingStartMs(Math.round(videoRef.current.currentTime * 1000));
  }, []);

  const handleMarkEnd = useCallback(() => {
    if (!videoRef.current || pendingStartMs === null) return;

    const endMs = Math.round(videoRef.current.currentTime * 1000);

    if (endMs <= pendingStartMs) {
      return;
    }

    setReps((prev) => [...prev, { startMs: pendingStartMs, endMs }]);
    setPendingStartMs(null);
  }, [pendingStartMs]);

  const handleRemoveRep = useCallback((index: number) => {
    setReps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleExport = useCallback(() => {
    const annotation: GroundTruthAnnotation = {
      videoId: videoId || "unnamed-video",
      exercise,
      repBoundariesMs: reps,
      annotatedBy: annotatorName || "unknown",
      annotatedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(annotation, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${annotation.videoId.replace(/\.[^.]+$/, "")}.groundtruth.json`;
    link.click();

    URL.revokeObjectURL(url);
  }, [videoId, exercise, reps, annotatorName]);

  return (
    <div className="space-y-6">
      <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          Ground-truth annotation (internal tool)
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Label a video&apos;s exercise and rep boundaries by scrubbing to each
          transition and marking it. Export the result as JSON to build a real
          benchmark dataset — see docs/setvision.md.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400">
            <Upload className="size-4" aria-hidden="true" />
            Choose video
            <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
          </label>

          <select
            value={exercise}
            onChange={(e) => setExercise(e.target.value as SetVisionExerciseId)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white"
          >
            {EXERCISES.map((id) => (
              <option key={id} value={id}>
                {id.replace("_", " ")}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Your name"
            value={annotatorName}
            onChange={(e) => setAnnotatorName(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600"
          />
        </div>

        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              onTimeUpdate={handleTimeUpdate}
              controls
              className="mt-5 max-h-[420px] w-full rounded-2xl border border-white/10 bg-black"
              playsInline
              muted
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold text-white">
                {formatTime(currentTime)}
              </span>

              <button
                type="button"
                onClick={handleMarkStart}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1]"
              >
                <Flag className="size-4" aria-hidden="true" />
                Mark rep start
              </button>

              <button
                type="button"
                onClick={handleMarkEnd}
                disabled={pendingStartMs === null}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-40"
              >
                <Square className="size-4" aria-hidden="true" />
                Mark rep end
              </button>

              {pendingStartMs !== null ? (
                <span className="text-xs text-amber-400">
                  Rep start marked at {formatTime(pendingStartMs / 1000)} — scrub to the rep&apos;s
                  end and click &quot;Mark rep end&quot;.
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </article>

      {reps.length > 0 ? (
        <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            Recorded reps ({reps.length})
          </p>

          <ul className="mt-3 space-y-2">
            {reps.map((rep, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-sm"
              >
                <span className="font-bold text-white">Rep {i + 1}</span>
                <span className="text-zinc-400">
                  {formatTime(rep.startMs / 1000)} → {formatTime(rep.endMs / 1000)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveRep(i)}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleExport}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400"
          >
            <Download className="size-4" aria-hidden="true" />
            Export ground truth JSON
          </button>
        </article>
      ) : null}
    </div>
  );
}
