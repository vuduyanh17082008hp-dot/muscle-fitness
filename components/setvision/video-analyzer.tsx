"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { analyzeWorkoutVideo } from "@/lib/setvision";
import type { PoseFrame, SetVisionAnalysis, SetVisionExerciseId } from "@/lib/setvision/types";
import { CANONICAL_MUSCLES, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { AutoregulationDecision, TraceableDecision } from "@/lib/dante-core/types";
import { collectPoseFrames } from "@/components/setvision/collect-pose-frames";
import { PoseOverlayCanvas } from "@/components/form-coach/pose-overlay-canvas";
import { SetVisionResultsPanel } from "@/components/setvision/results-panel";
import { DecisionCard } from "@/components/dante/decision-card";

type Status = "idle" | "ready" | "processing" | "done" | "error";

const EXERCISE_OPTIONS: Array<{ value: SetVisionExerciseId | "auto"; label: string }> = [
  { value: "auto", label: "Auto-detect" },
  { value: "bench_press", label: "Bench Press" },
  { value: "squat", label: "Squat" },
  { value: "deadlift", label: "Deadlift" },
];

const RELEVANT_MUSCLES: Record<SetVisionExerciseId, CanonicalMuscle[]> = {
  bench_press: ["chest", "triceps", "anterior_deltoid"],
  squat: ["quadriceps", "glutes"],
  deadlift: ["hamstrings", "glutes", "lower_back"],
};

export function VideoAnalyzer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDims, setVideoDims] = useState({ width: 0, height: 0 });
  const [exerciseOverride, setExerciseOverride] = useState<SetVisionExerciseId | "auto">("auto");
  const [progress, setProgress] = useState<{ processedMs: number; totalMs: number } | null>(null);
  const [liveFrame, setLiveFrame] = useState<PoseFrame | null>(null);
  const [analysis, setAnalysis] = useState<SetVisionAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [plannedLoadKg, setPlannedLoadKg] = useState(60);
  const [plannedSets, setPlannedSets] = useState(4);
  const [danteDecision, setDanteDecision] =
    useState<TraceableDecision<AutoregulationDecision> | null>(null);
  const [danteExplanation, setDanteExplanation] = useState<string | null>(null);
  const [danteStatus, setDanteStatus] = useState<"idle" | "loading" | "error">("idle");

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setVideoFile(file);
    setAnalysis(null);
    setDanteDecision(null);
    setDanteExplanation(null);
    setSaveStatus("idle");
    setErrorMessage(null);

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setStatus("ready");
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoDims({ width: video.videoWidth, height: video.videoHeight });
  }, []);

  const handleAnalyze = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    setStatus("processing");
    setErrorMessage(null);
    setProgress({ processedMs: 0, totalMs: video.duration * 1000 });

    try {
      const frames = await collectPoseFrames(video, {
        onProgress: setProgress,
        onFrame: setLiveFrame,
      });

      const result = analyzeWorkoutVideo(frames, {
        exercise: exerciseOverride === "auto" ? undefined : exerciseOverride,
      });

      setAnalysis(result);
      setStatus("done");
    } catch (error) {
      console.error("[SETVISION] analysis failed", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not analyze this video.",
      );
      setStatus("error");
    }
  }, [exerciseOverride]);

  const handleSave = useCallback(async () => {
    if (!analysis || !videoFile) return;

    setSaveStatus("saving");

    try {
      const extension = videoFile.name.split(".").pop() ?? "mp4";

      const uploadUrlResponse = await fetch("/api/setvision/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileExtension: extension }),
      });

      const uploadUrlData = await uploadUrlResponse.json();

      if (!uploadUrlResponse.ok || !uploadUrlData.ok) {
        throw new Error(uploadUrlData.error ?? "Could not get an upload URL.");
      }

      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("setvision-videos")
        .uploadToSignedUrl(uploadUrlData.path, uploadUrlData.token, videoFile);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const resultsResponse = await fetch("/api/setvision/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis,
          videoStoragePath: uploadUrlData.path,
        }),
      });

      const resultsData = await resultsResponse.json();

      if (!resultsResponse.ok || !resultsData.ok) {
        throw new Error(resultsData.error ?? "Could not save the analysis.");
      }

      setSaveStatus("saved");
    } catch (error) {
      console.error("[SETVISION] save failed", error);
      setSaveStatus("error");
    }
  }, [analysis, videoFile]);

  const handleAskDante = useCallback(async () => {
    if (!analysis) return;

    setDanteStatus("loading");
    setDanteDecision(null);
    setDanteExplanation(null);

    try {
      const response = await fetch("/api/dante/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseName: analysis.exercise.replace("_", " "),
          relevantMuscles: RELEVANT_MUSCLES[analysis.exercise].filter((m) =>
            (CANONICAL_MUSCLES as string[]).includes(m),
          ),
          planned: {
            targetSets: plannedSets,
            targetRepMin: 5,
            targetRepMax: 8,
            targetLoadKg: plannedLoadKg,
            targetRir: 2,
          },
          setVision: {
            velocityLoss: analysis.velocity.velocityLoss,
            velocityCalibrated: analysis.velocity.calibrated,
            romConsistency: analysis.technique.romConsistency,
            confidence: analysis.confidence,
          },
          explain: true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not get a recommendation.");
      }

      setDanteDecision(data.decision);
      setDanteExplanation(data.explanation ?? null);
      setDanteStatus("idle");
    } catch (error) {
      console.error("[SETVISION -> DANTE] failed", error);
      setDanteStatus("error");
    }
  }, [analysis, plannedLoadKg, plannedSets]);

  return (
    <div className="space-y-6">
      <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          1. Upload a set
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400">
            <Upload className="size-4" aria-hidden="true" />
            Choose video
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          <select
            value={exerciseOverride}
            onChange={(e) => setExerciseOverride(e.target.value as SetVisionExerciseId | "auto")}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white"
          >
            {EXERCISE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {videoUrl ? (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={status === "processing"}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
            >
              {status === "processing" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {status === "processing" ? "Analyzing…" : "Analyze"}
            </button>
          ) : null}
        </div>

        {videoUrl ? (
          <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              onLoadedMetadata={handleLoadedMetadata}
              controls
              className="max-h-[420px] w-full"
              playsInline
              muted
            />
            {status === "processing" ? (
              <PoseOverlayCanvas
                frame={liveFrame}
                videoWidth={videoDims.width}
                videoHeight={videoDims.height}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            ) : null}
          </div>
        ) : null}

        {status === "processing" && progress ? (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-amber-400 transition-all"
                style={{
                  width: `${progress.totalMs > 0 ? Math.min(100, (progress.processedMs / progress.totalMs) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Processing frames locally in your browser — nothing is uploaded until you choose
              to save.
            </p>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-4 text-sm text-rose-400">{errorMessage}</p>
        ) : null}
      </article>

      {analysis ? (
        <>
          <SetVisionResultsPanel analysis={analysis} />

          <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              2. Save this analysis (optional)
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Uploads the video to your private storage and saves the structured metrics above.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving" || saveStatus === "saved"}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
            >
              {saveStatus === "saving" ? <Loader2 className="size-4 animate-spin" /> : null}
              {saveStatus === "saved"
                ? "Saved"
                : saveStatus === "saving"
                  ? "Saving…"
                  : "Save analysis"}
            </button>
            {saveStatus === "error" ? (
              <p className="mt-2 text-sm text-rose-400">Could not save this analysis.</p>
            ) : null}
          </article>

          <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
              3. Ask Dante what this means for your next set
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-xs text-zinc-500">
                Planned load (kg)
                <input
                  type="number"
                  value={plannedLoadKg}
                  onChange={(e) => setPlannedLoadKg(Number(e.target.value))}
                  className="mt-1 block w-28 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm font-bold text-white"
                />
              </label>
              <label className="text-xs text-zinc-500">
                Planned sets
                <input
                  type="number"
                  value={plannedSets}
                  onChange={(e) => setPlannedSets(Number(e.target.value))}
                  className="mt-1 block w-20 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm font-bold text-white"
                />
              </label>

              <button
                type="button"
                onClick={handleAskDante}
                disabled={danteStatus === "loading"}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
              >
                {danteStatus === "loading" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Ask Dante
              </button>
            </div>

            {danteStatus === "error" ? (
              <p className="mt-3 text-sm text-rose-400">
                Could not get a recommendation right now.
              </p>
            ) : null}
          </article>

          {danteDecision ? (
            <DecisionCard decision={danteDecision} explanation={danteExplanation} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
