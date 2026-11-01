"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { analyzeWorkoutVideo, classifyExercise } from "@/lib/setvision";
import { optionForEngine, selectionFromOption, type SelectedExercise } from "@/lib/setvision/exercise-selection";
import type { PoseFrame, SetVisionAnalysis, SetVisionExerciseId, TimedPoseFrame } from "@/lib/setvision/types";
import { CANONICAL_MUSCLES, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { AutoregulationDecision, TraceableDecision } from "@/lib/dante-core/types";
import { collectPoseFrames } from "@/components/setvision/collect-pose-frames";
import { ExercisePicker, SelectedCard, type PickerMode } from "@/components/setvision/exercise-picker";
import { PoseOverlayCanvas } from "@/components/form-coach/pose-overlay-canvas";
import { SetVisionResultsPanel } from "@/components/setvision/results-panel";
import { SavedAnalyses } from "@/components/setvision/saved-analyses";
import { DecisionCard } from "@/components/dante/decision-card";
import { ErrorState } from "@/components/dashboard/error-state";

const RELEVANT_MUSCLES: Record<SetVisionExerciseId, CanonicalMuscle[]> = {
  bench_press: ["chest", "triceps", "anterior_deltoid"],
  squat: ["quadriceps", "glutes"],
  deadlift: ["hamstrings", "glutes", "lower_back"],
};

type VideoState = { url: string; file: File; durationMs: number | null; width: number; height: number; invalid: string | null };

/** Result of an action, remembered together with the analysis it was for — a different analysis never inherits it. */
type For<T> = { analysis: SetVisionAnalysis; value: T };

export function VideoAnalyzer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [mode, setMode] = useState<PickerMode>("choose");
  const [chosen, setChosen] = useState<SelectedExercise | null>(null);
  const [custom, setCustom] = useState<SelectedExercise | null>(null);
  const [customDraft, setCustomDraft] = useState("");
  const [autoConfirmed, setAutoConfirmed] = useState<SelectedExercise | null>(null);

  const [video, setVideo] = useState<VideoState | null>(null);
  /** Pose frames of the CURRENT video — exercise-agnostic, so a new exercise choice re-derives the analysis instead of reusing one. */
  const [frames, setFrames] = useState<TimedPoseFrame[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ processedMs: number; totalMs: number } | null>(null);
  const [liveFrame, setLiveFrame] = useState<PoseFrame | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [save, setSave] = useState<For<"saving" | "saved" | "error"> | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const [plannedLoadKg, setPlannedLoadKg] = useState(60);
  const [plannedSets, setPlannedSets] = useState(4);
  const [dante, setDante] = useState<For<{ status: "loading" | "error" | "done"; decision?: TraceableDecision<AutoregulationDecision>; explanation?: string | null }> | null>(null);

  const active = mode === "choose" ? chosen : mode === "custom" ? custom : autoConfirmed;
  const suggestion = useMemo(() => (mode === "auto" && frames ? classifyExercise(frames.map((f) => f.frame)) : null), [mode, frames]);

  const analysis = useMemo(
    () =>
      frames && active?.engine
        ? analyzeWorkoutVideo(frames, {
            exercise: active.engine,
            confirmedSuggestion: active.source === "auto_suggestion" ? suggestion : null,
          })
        : null,
    [frames, active, suggestion],
  );

  const saveStatus = save && save.analysis === analysis ? save.value : "idle";
  const danteState = dante && dante.analysis === analysis ? dante.value : null;

  const changeMode = useCallback((next: PickerMode) => {
    setMode(next);
    if (next !== "auto") setAutoConfirmed(null);
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setFrames(null);
    setAutoConfirmed(null);
    setErrorMessage(null);
    setVideo((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return {
        url: URL.createObjectURL(file),
        file,
        durationMs: null,
        width: 0,
        height: 0,
        invalid: file.type && !file.type.startsWith("video/") ? "This file is not a video. Choose an MP4, MOV or WebM clip." : null,
      };
    });
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    const durationMs = Number.isFinite(element.duration) && element.duration > 0 ? element.duration * 1000 : null;
    setVideo((v) =>
      v && {
        ...v,
        durationMs,
        width: element.videoWidth,
        height: element.videoHeight,
        invalid: durationMs === null || element.videoWidth === 0 ? "This video has no readable length or picture, so it can't be analysed." : v.invalid,
      },
    );
  }, []);

  const handleVideoError = useCallback(() => {
    setVideo((v) => v && { ...v, invalid: "This video could not be decoded by your browser. Try an MP4 (H.264) clip." });
  }, []);

  const handleAnalyze = useCallback(async () => {
    const element = videoRef.current;
    if (!element || !video?.durationMs) return;

    setProcessing(true);
    setErrorMessage(null);
    setFrames(null);
    setProgress({ processedMs: 0, totalMs: video.durationMs });

    try {
      setFrames(await collectPoseFrames(element, { onProgress: setProgress, onFrame: setLiveFrame }));
    } catch (error) {
      // Log the real cause, never surface a raw pose-detection/library error string.
      console.error("[SETVISION] analysis failed", error);
      setErrorMessage("We couldn't analyze this video. Try a clearer, well-lit clip with the full lift visible in frame.");
    } finally {
      setProcessing(false);
    }
  }, [video]);

  const handleSeek = useCallback((ms: number) => {
    const element = videoRef.current;
    if (!element) return;
    element.currentTime = ms / 1000;
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const handleSave = useCallback(async () => {
    if (!analysis || !video?.durationMs || !active?.key || active.source === "custom") return;
    const target = analysis;
    setSave({ analysis: target, value: "saving" });

    try {
      const extension = video.file.name.split(".").pop() ?? "mp4";
      const uploadUrlResponse = await fetch("/api/setvision/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileExtension: extension }),
      });
      const uploadUrlData = await uploadUrlResponse.json();
      if (!uploadUrlResponse.ok || !uploadUrlData.ok) throw new Error(uploadUrlData.error ?? "Could not get an upload URL.");

      const { error: uploadError } = await createClient()
        .storage.from("setvision-videos")
        .uploadToSignedUrl(uploadUrlData.path, uploadUrlData.token, video.file);
      if (uploadError) throw new Error(uploadError.message);

      const resultsResponse = await fetch("/api/setvision/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: target,
          videoDurationMs: video.durationMs,
          exerciseKey: active.key,
          exerciseSource: active.source,
          videoStoragePath: uploadUrlData.path,
        }),
      });
      const resultsData = await resultsResponse.json();
      if (!resultsResponse.ok || !resultsData.ok) throw new Error(resultsData.error ?? "Could not save the analysis.");

      setSave({ analysis: target, value: "saved" });
      setSavedCount((n) => n + 1);
    } catch (error) {
      console.error("[SETVISION] save failed", error);
      setSave({ analysis: target, value: "error" });
    }
  }, [analysis, video, active]);

  const handleAskDante = useCallback(async () => {
    if (!analysis || !active) return;
    const target = analysis;
    setDante({ analysis: target, value: { status: "loading" } });

    try {
      const response = await fetch("/api/dante/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseName: active.label,
          relevantMuscles: RELEVANT_MUSCLES[target.exercise].filter((m) => (CANONICAL_MUSCLES as string[]).includes(m)),
          planned: { targetSets: plannedSets, targetRepMin: 5, targetRepMax: 8, targetLoadKg: plannedLoadKg, targetRir: 2 },
          setVision: {
            velocityLoss: target.velocity.velocityLoss,
            velocityCalibrated: target.velocity.calibrated,
            romConsistency: target.technique.romConsistency,
            confidence: target.confidence,
          },
          explain: true,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not get a recommendation.");
      setDante({ analysis: target, value: { status: "done", decision: data.decision, explanation: data.explanation ?? null } });
    } catch (error) {
      console.error("[SETVISION -> DANTE] failed", error);
      setDante({ analysis: target, value: { status: "error" } });
    }
  }, [analysis, active, plannedLoadKg, plannedSets]);

  const labelOnly = active !== null && active.engine === null;
  const canAnalyze = Boolean(video && !video.invalid && video.durationMs && (mode === "auto" || active?.engine));
  const measured = analysis && analysis.reps > 0;

  return (
    <div className="space-y-6">
      <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8">
        <ExercisePicker
          mode={mode}
          onModeChange={changeMode}
          chosen={chosen}
          onChoose={setChosen}
          custom={custom}
          onCustom={setCustom}
          customDraft={customDraft}
          onCustomDraftChange={setCustomDraft}
        />

        {mode !== "auto" && !active ? (
          <p className="mt-3 text-sm text-zinc-500" data-testid="sv-no-exercise">
            Choose or enter the exercise first — SetVision measures only the movement you tell it.
          </p>
        ) : null}

        <div className="mt-7 border-t border-white/[0.06] pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">2. Video of one set</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition focus-within:ring-2 focus-within:ring-amber-300 hover:bg-amber-400">
              <Upload className="size-4" aria-hidden="true" />
              {video ? "Choose another video" : "Choose video"}
              <input type="file" accept="video/*" className="sr-only" onChange={handleFileChange} data-testid="sv-file" />
            </label>

            {video && !labelOnly ? (
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze || processing}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
                data-testid="sv-analyze"
              >
                {processing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {processing ? "Analyzing…" : frames ? "Analyze again" : "Analyze"}
              </button>
            ) : null}
          </div>

          {video?.invalid ? (
            <p className="mt-3 text-sm text-rose-400" role="alert" data-testid="sv-invalid-video">
              {video.invalid}
            </p>
          ) : null}

          {video ? (
            <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black">
              <video
                ref={videoRef}
                src={video.url}
                onLoadedMetadata={handleLoadedMetadata}
                onError={handleVideoError}
                controls
                className="max-h-[420px] w-full"
                playsInline
                muted
              />
              {processing ? (
                <PoseOverlayCanvas
                  frame={liveFrame}
                  videoWidth={video.width}
                  videoHeight={video.height}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              ) : null}
            </div>
          ) : null}

          {processing && progress ? (
            <div className="mt-4" data-testid="sv-processing">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                role="progressbar"
                aria-label="Analysis progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.totalMs > 0 ? Math.round(Math.min(100, (progress.processedMs / progress.totalMs) * 100)) : 0}
              >
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${progress.totalMs > 0 ? Math.min(100, (progress.processedMs / progress.totalMs) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Processing frames locally in your browser — nothing is uploaded until you choose to save.
              </p>
            </div>
          ) : null}

          {errorMessage ? (
            <ErrorState className="mt-4" title="Analysis failed" description={errorMessage} onRetry={handleAnalyze} />
          ) : null}
        </div>
      </article>

      {labelOnly && active ? (
        <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-label-only">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">No automated analysis</p>
          <div className="mt-3">
            <SelectedCard selection={active} />
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {video
              ? "Your video stays on this page for review — play and scrub it above. No reps, tempo, range or technique are reported, and nothing is saved."
              : "Add a video above to review it here. No reps, tempo, range or technique are reported, and nothing is saved."}
          </p>
        </article>
      ) : null}

      {mode === "auto" && frames && !autoConfirmed && suggestion ? (
        <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-auto-result">
          {suggestion.exercise === null ? (
            <>
              <p className="text-lg font-black text-white" data-testid="sv-auto-title">
                Exercise not identified
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{suggestion.signals[0]}</p>
              <p className="mt-2 text-sm text-zinc-400">Choose or enter the exercise — your video and its pose data are kept.</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-300">Unverified suggestion</p>
              <p className="mt-1 text-lg font-black text-white" data-testid="sv-auto-title">
                Looks like: {optionForEngine(suggestion.exercise).label}
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {suggestion.signals[0]} This is a heuristic guess, not a probability — confirm it or pick the right exercise.
              </p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestion.exercise !== null ? (
              <button
                type="button"
                onClick={() => setAutoConfirmed(selectionFromOption(optionForEngine(suggestion.exercise!), "auto_suggestion"))}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400"
              >
                Yes, it&apos;s {optionForEngine(suggestion.exercise).label}
              </button>
            ) : null}
            <button type="button" onClick={() => changeMode("choose")} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/[0.06]">
              Choose exercise
            </button>
            <button type="button" onClick={() => changeMode("custom")} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/[0.06]">
              Enter a custom name
            </button>
          </div>
        </article>
      ) : null}

      {mode === "auto" && autoConfirmed ? (
        <div className="flex flex-wrap items-center gap-3">
          <SelectedCard selection={autoConfirmed} onChange={() => setAutoConfirmed(null)} />
        </div>
      ) : null}

      {analysis && active ? (
        <SetVisionResultsPanel analysis={analysis} onSeek={handleSeek} identity={{ label: active.label, source: active.source }} />
      ) : null}

      {/* Save only a measured analysis of an exercise SetVision analyses; label-only and custom picks have nothing to save. */}
      {measured && active?.key ? (
        <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-save">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">3. Save this analysis (optional)</p>
          <p className="mt-2 text-sm text-zinc-500">
            Uploads the video to your private storage and saves the metrics and rep timeline above.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving" || saveStatus === "saved"}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
          >
            {saveStatus === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Try saving again" : "Save analysis"}
          </button>
          <p className="mt-2 text-sm" aria-live="polite">
            {saveStatus === "error" ? (
              <span className="text-rose-400" data-testid="sv-save-error">Could not save this analysis — nothing was stored. Check your connection and try again.</span>
            ) : saveStatus === "saved" ? (
              <span className="text-zinc-400" data-testid="sv-save-ok">Saved. Open it under “Saved analyses” below to see it reloaded from your account.</span>
            ) : null}
          </p>
        </article>
      ) : null}

      {measured && active?.capability === "SUPPORTED_ANALYSIS" ? (
        <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-dante">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">4. Ask Dante what this means for your next set</p>

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
              disabled={danteState?.status === "loading"}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
            >
              {danteState?.status === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Ask Dante
            </button>
          </div>

          {danteState?.status === "error" ? <p className="mt-3 text-sm text-rose-400">Could not get a recommendation right now.</p> : null}
        </article>
      ) : measured && active?.capability === "LIMITED_EXPERIMENTAL_ANALYSIS" ? (
        <p className="text-xs leading-5 text-zinc-500" data-testid="sv-dante-withheld">
          Dante recommendations use supported analyses only — this experimental {active.label.toLowerCase()} analysis is not sent to Dante.
        </p>
      ) : null}

      {danteState?.status === "done" && danteState.decision ? (
        <DecisionCard decision={danteState.decision} explanation={danteState.explanation ?? null} />
      ) : null}

      <SavedAnalyses refreshKey={savedCount} />
    </div>
  );
}
