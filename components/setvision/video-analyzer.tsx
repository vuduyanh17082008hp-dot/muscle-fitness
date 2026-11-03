"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { analyzeWorkoutVideo } from "@/lib/setvision";
import { aiReviewScope, suggestExercise } from "@/lib/setvision/analyze";
import { optionForEngine, selectionFromOption, type SelectedExercise } from "@/lib/setvision/exercise-selection";
import { EMPTY_REVIEW, type SetReview } from "@/lib/setvision/saved-analysis";
import type { PoseFrame, SetVisionAnalysis, SetVisionExerciseId, TimedPoseFrame } from "@/lib/setvision/types";
import { CANONICAL_MUSCLES, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { AutoregulationDecision, TraceableDecision } from "@/lib/dante-core/types";
import { collectPoseFrames, sampleStills, scanSubject } from "@/components/setvision/collect-pose-frames";
import { ReviewSummary } from "@/components/setvision/review-summary";
import { trackedFormObservations } from "@/lib/setvision/form-observations";
import type { ReviewScope, VisualReview } from "@/lib/setvision/visual-review";
import { phaseTimes } from "@/lib/setvision/phase-frames";

/** A Not-assessable result decided on-device, before any frame leaves the browser. */
const localRefusal = (reason: string): VisualReview => ({
  status: "NOT_ASSESSABLE",
  seenMovement: "",
  exerciseCheck: "AMBIGUOUS",
  needsConfirmation: false,
  scope: "full",
  limitation: reason,
  filmingTip: "Film one continuous take with only you in view, whole body in frame, steady camera.",
  observations: [],
  frameCount: 0,
});
import { ExercisePicker } from "@/components/setvision/exercise-picker";
import { PoseOverlayCanvas } from "@/components/form-coach/pose-overlay-canvas";
import { SetVisionResultsPanel } from "@/components/setvision/results-panel";
import { SetReviewPanel } from "@/components/setvision/set-review";
import { SavedAnalyses } from "@/components/setvision/saved-analyses";
import { DecisionCard } from "@/components/dante/decision-card";
import { ErrorState } from "@/components/dashboard/error-state";

/** Dante only gets VERIFIED analyses, so only those engines need muscles. */
const RELEVANT_MUSCLES: Partial<Record<SetVisionExerciseId, CanonicalMuscle[]>> = {
  squat: ["quadriceps", "glutes"],
};

type VideoState = { url: string; file: File; durationMs: number | null; width: number; height: number; invalid: string | null };

/** Result of an action, remembered together with the inputs it was for — different inputs never inherit it. */
type For<K, T> = { key: K; value: T };

export function VideoAnalyzer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [selection, setSelection] = useState<SelectedExercise | null>(null);
  const [autoDetect, setAutoDetect] = useState(false);

  const [video, setVideo] = useState<VideoState | null>(null);
  /** Pose frames of the CURRENT video — exercise-agnostic, so a new exercise choice re-derives the analysis instead of reusing one. */
  const [frames, setFrames] = useState<TimedPoseFrame[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ processedMs: number; totalMs: number } | null>(null);
  const [liveFrame, setLiveFrame] = useState<PoseFrame | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** The user's marked reps, notes and "unsure" flag belong to the video; rejected automated reps belong to one analysis. */
  const [review, setReview] = useState<Omit<SetReview, "rejectedReps">>(EMPTY_REVIEW);
  const [rejected, setRejected] = useState<For<SetVisionAnalysis | null, number[]> | null>(null);

  const [save, setSave] = useState<For<object, "saving" | "saved" | "error"> | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const [plannedLoadKg, setPlannedLoadKg] = useState(60);
  const [plannedSets, setPlannedSets] = useState(4);
  const [dante, setDante] = useState<For<SetVisionAnalysis, { status: "loading" | "error" | "done"; decision?: TraceableDecision<AutoregulationDecision>; explanation?: string | null }> | null>(null);

  /** AI visual review of the current video, for the exercise it was requested for. */
  const [visual, setVisual] = useState<For<string, { status: "loading" | "error" | "done"; phase?: string; review?: VisualReview; checks?: string[]; error?: string }> | null>(null);

  const suggestion = useMemo(() => (autoDetect && frames ? suggestExercise(frames) : null), [autoDetect, frames]);

  const analysis = useMemo(
    () =>
      frames && selection?.engine
        ? analyzeWorkoutVideo(frames, {
            exercise: selection.engine,
            confirmedSuggestion: selection.source === "auto_suggestion" ? suggestion : null,
          })
        : null,
    [frames, selection, suggestion],
  );

  const fullReview: SetReview = useMemo(
    () => ({ ...review, rejectedReps: rejected && rejected.key === analysis ? rejected.value : [] }),
    [review, rejected, analysis],
  );
  const saveKey = useMemo(() => ({ selection, analysis, fullReview }), [selection, analysis, fullReview]);
  const saveStatus = save && save.key === saveKey ? save.value : "idle";
  const danteState = dante && dante.key === analysis ? dante.value : null;

  const chooseExercise = useCallback((next: SelectedExercise) => {
    setSelection(next);
    setAutoDetect(false);
  }, []);

  const chooseAutoDetect = useCallback(() => {
    setSelection(null);
    setAutoDetect(true);
  }, []);

  const confirmSuggestion = useCallback((engine: SetVisionExerciseId) => {
    setSelection(selectionFromOption(optionForEngine(engine), "auto_suggestion"));
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setFrames(null);
    setErrorMessage(null);
    setReview(EMPTY_REVIEW);
    // A confirmed suggestion was about the previous video.
    setSelection((current) => (current?.source === "auto_suggestion" ? null : current));
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

  const visualKey = video && selection ? `${video.url}|${selection.key ?? selection.label}` : null;
  const visualState = visual && visual.key === visualKey ? visual.value : null;

  /** Stills + scope of the last review of this video/exercise, so "Yes, it's X" doesn't rescan the clip. */
  const preparedRef = useRef<{ key: string; stills: Array<{ tMs: number; image: string }>; scope: ReviewScope; checks: string[] } | null>(null);

  const handleVisualReview = useCallback(async (userConfirmedExercise = false) => {
    const element = videoRef.current;
    if (!element || !selection || !visualKey) return;
    const key = visualKey;
    setVisual({ key, value: { status: "loading", phase: userConfirmedExercise ? "Reviewing with the exercise you confirmed…" : "Checking that only you are in the video…" } });
    try {
      let prepared = preparedRef.current?.key === key ? preparedRef.current : null;
      if (!prepared) {
        // Same subject gate as the tracked path, on-device, BEFORE anything is sent to OpenAI.
        // Reuses this video's tracked frames when they exist; otherwise a 5 Hz MultiPose + scene-change scan.
        const subject = frames ?? (await scanSubject(element));
        const decision = aiReviewScope(subject);
        if ("refuse" in decision) {
          setVisual({ key, value: { status: "done", review: localRefusal(decision.refuse) } });
          return;
        }
        setVisual({ key, value: { status: "loading", phase: "AI is reviewing stills from your video…" } });
        // Stills at the movement's turning points (start/end of each rep), topped up evenly — same 6–12 budget.
        const { times } = phaseTimes(subject, element.duration * 1000);
        prepared = { key, stills: await sampleStills(element, times), scope: decision.scope, checks: decision.limitations };
        preparedRef.current = prepared;
      }
      const response = await fetch("/api/setvision/visual-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseKey: selection.key,
          exerciseLabel: selection.label,
          frames: prepared.stills,
          scope: prepared.scope,
          userConfirmedExercise,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        // The server's messages are written for users; anything else stays in the console.
        setVisual({ key, value: { status: "error", error: typeof data.error === "string" ? data.error : "AI visual review failed. Try again in a moment." } });
        return;
      }
      setVisual({ key, value: { status: "done", review: data.review, checks: prepared.checks } });
    } catch (error) {
      console.error("[SETVISION] visual review failed", error);
      setVisual({ key, value: { status: "error", error: "We couldn't review this video. Try a clearer clip with your whole body in view, or try again." } });
    }
  }, [selection, visualKey, frames]);

  const formSummary = useMemo(() => (analysis ? trackedFormObservations(analysis) : null), [analysis]);

  const handleSeek = useCallback((ms: number) => {
    const element = videoRef.current;
    if (!element) return;
    element.currentTime = ms / 1000;
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const currentTimeMs = useCallback(() => (videoRef.current ? Math.round(videoRef.current.currentTime * 1000) : null), []);

  const handleReviewChange = useCallback(
    (next: SetReview) => {
      const { rejectedReps, ...rest } = next;
      setReview(rest);
      setRejected({ key: analysis, value: rejectedReps });
    },
    [analysis],
  );

  const handleSave = useCallback(async () => {
    if (!selection || !video?.durationMs) return;
    const key = saveKey;
    setSave({ key, value: "saving" });
    const supabase = createClient();
    let uploadedPath: string | null = null;

    try {
      const extension = video.file.name.split(".").pop() ?? "mp4";
      const uploadUrlResponse = await fetch("/api/setvision/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileExtension: extension }),
      });
      const uploadUrlData = await uploadUrlResponse.json();
      if (!uploadUrlResponse.ok || !uploadUrlData.ok) throw new Error(uploadUrlData.error ?? "Could not get an upload URL.");

      const { error: uploadError } = await supabase.storage
        .from("setvision-videos")
        .uploadToSignedUrl(uploadUrlData.path, uploadUrlData.token, video.file);
      if (uploadError) throw new Error(uploadError.message);
      uploadedPath = uploadUrlData.path;

      const resultsResponse = await fetch("/api/setvision/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: key.analysis,
          videoDurationMs: video.durationMs,
          exerciseKey: selection.key,
          exerciseSource: selection.source,
          ...(selection.source === "custom" ? { customLabel: selection.label } : {}),
          review: key.fullReview,
          videoStoragePath: uploadUrlData.path,
        }),
      });
      const resultsData = await resultsResponse.json();
      if (!resultsResponse.ok || !resultsData.ok) throw new Error(resultsData.error ?? "Could not save the analysis.");

      setSave({ key, value: "saved" });
      setSavedCount((n) => n + 1);
    } catch (error) {
      console.error("[SETVISION] save failed", error);
      // Nothing was saved, so don't leave the video behind in storage (best effort).
      if (uploadedPath) await supabase.storage.from("setvision-videos").remove([uploadedPath]).catch(() => {});
      setSave({ key, value: "error" });
    }
  }, [saveKey, selection, video]);

  const handleAskDante = useCallback(async () => {
    if (!analysis || !selection) return;
    const target = analysis;
    setDante({ key: target, value: { status: "loading" } });

    try {
      const response = await fetch("/api/dante/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseName: selection.label,
          relevantMuscles: (RELEVANT_MUSCLES[target.exercise] ?? []).filter((m) => (CANONICAL_MUSCLES as string[]).includes(m)),
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
      setDante({ key: target, value: { status: "done", decision: data.decision, explanation: data.explanation ?? null } });
    } catch (error) {
      console.error("[SETVISION -> DANTE] failed", error);
      setDante({ key: target, value: { status: "error" } });
    }
  }, [analysis, selection, plannedLoadKg, plannedSets]);

  const manualOnly = selection !== null && selection.engine === null;
  const canAnalyze = Boolean(video && !video.invalid && video.durationMs && (autoDetect || selection));
  const measured = analysis !== null && analysis.reps > 0;
  // Review once there is something to review: an exercise without an engine, or an engine result (counted or not).
  const reviewable = Boolean(selection && video && !video.invalid && video.durationMs && (manualOnly || analysis));
  const candidates = suggestion?.candidates ?? [];

  return (
    <div className="space-y-6">
      <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8">
        <ExercisePicker selection={selection} autoDetect={autoDetect} onSelect={chooseExercise} onAutoDetect={chooseAutoDetect} />

        {!autoDetect && !selection ? (
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

            {video && (autoDetect || selection) ? (
              <button
                type="button"
                onClick={manualOnly ? () => handleVisualReview() : handleAnalyze}
                disabled={!canAnalyze || processing || visualState?.status === "loading"}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
                data-testid="sv-analyze"
              >
                {processing || (manualOnly && visualState?.status === "loading") ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {manualOnly
                  ? visualState?.status === "loading"
                    ? "Reviewing…"
                    : visualState?.status === "done"
                      ? "Review again"
                      : "Analyze with AI visual review"
                  : processing
                    ? "Analyzing…"
                    : frames
                      ? "Analyze again"
                      : "Analyze"}
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

          {manualOnly && video ? (
            <p className="mt-4 text-sm leading-6 text-zinc-400" data-testid="sv-label-only">
              {selection.label} has no rep tracker, so AI reviews 6–12 stills from your video for visible form — no reps,
              angles or speed. The stills are sent to OpenAI for this review only and aren&apos;t stored. Best results: only
              you in view, whole body visible, steady camera.
            </p>
          ) : null}

          {visualState?.status === "error" ? (
            <ErrorState className="mt-4" title="AI visual review failed" description={visualState.error ?? "Try again in a moment."} onRetry={() => handleVisualReview()} />
          ) : null}
        </div>
      </article>

      {autoDetect && frames && !selection && suggestion ? (
        <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-auto-result">
          {suggestion.exercise !== null ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-300">Unverified suggestion</p>
              <p className="mt-1 text-lg font-black text-white" data-testid="sv-auto-title">
                Looks like: {optionForEngine(suggestion.exercise).label}
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                {suggestion.signals[0]} This is a heuristic guess, not a probability — confirm it or pick the right exercise.
              </p>
            </>
          ) : candidates.length > 1 ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-300">Several exercises fit</p>
              <p className="mt-1 text-lg font-black text-white" data-testid="sv-auto-title">
                Could be: {candidates.map((c) => optionForEngine(c).label).join(", ")}
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{suggestion.signals[0]}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-black text-white" data-testid="sv-auto-title">
                Exercise not identified
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{suggestion.signals[0]}</p>
              <p className="mt-2 text-sm text-zinc-400">Choose or enter the exercise — your video and its pose data are kept.</p>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {(suggestion.exercise !== null ? [suggestion.exercise] : candidates.length > 1 ? candidates : []).map((engine) => (
              <button
                key={engine}
                type="button"
                onClick={() => confirmSuggestion(engine)}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400"
              >
                {suggestion.exercise !== null ? "Yes, it's" : "It's"} {optionForEngine(engine).label}
              </button>
            ))}
            <button type="button" onClick={() => setAutoDetect(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/[0.06]">
              Choose another exercise
            </button>
          </div>
        </article>
      ) : null}

      {analysis && selection && formSummary ? (
        <ReviewSummary
          title="3. Your result"
          label={selection.label}
          capability={selection.capability}
          reps={analysis.reps > 0 && !analysis.abstainReason ? { count: analysis.reps, verified: selection.capability === "ANALYSIS_VERIFIED" } : null}
          status={formSummary.status}
          observations={formSummary.observations}
          note={formSummary.note}
          exerciseKey={selection.key}
          onSeek={handleSeek}
          testId="sv-summary"
        />
      ) : null}

      {analysis && selection && !visualState ? (
        <button
          type="button"
          onClick={() => handleVisualReview()}
          disabled={processing}
          className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
          data-testid="sv-visual-also"
        >
          Also get an AI visual review
        </button>
      ) : null}

      {visualState?.status === "loading" ? (
        <p className="text-sm text-zinc-400" role="status" data-testid="sv-visual-loading">
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
          {visualState.phase}
        </p>
      ) : null}

      {visualState?.status === "done" && visualState.review && selection ? (
        <ReviewSummary
          title={manualOnly ? "3. Your result" : "AI visual review"}
          label={selection.label}
          capability="MANUAL_REVIEW_SUPPORTED"
          reps={null}
          status={visualState.review.status}
          observations={visualState.review.observations}
          note={[
            visualState.review.limitation?.replace(/([^.!?])$/, "$1."),
            visualState.review.frameCount === 0
              ? "Checked on your device — nothing was sent to the AI."
              : `AI looked at ${visualState.review.frameCount} stills (camera view not verified) — qualitative only, no reps or measurements.`,
            ...(visualState.checks ?? []),
          ]
            .filter(Boolean)
            .join(" ")}
          filmingTip={visualState.review.filmingTip}
          exerciseKey={selection.key}
          onSeek={handleSeek}
          confirmExercise={visualState.review.needsConfirmation ? () => handleVisualReview(true) : undefined}
          testId="sv-visual"
        />
      ) : null}

      {analysis && selection ? (
        <SetVisionResultsPanel analysis={analysis} onSeek={handleSeek} identity={{ label: selection.label, source: selection.source }} />
      ) : null}

      {reviewable && video ? (
        <SetReviewPanel key={video.url} analysis={analysis} review={fullReview} onChange={handleReviewChange} currentTimeMs={currentTimeMs} onSeek={handleSeek} />
      ) : null}

      {reviewable ? (
        <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-save">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">5. Save (optional)</p>
          <p className="mt-2 text-sm text-zinc-500">
            Uploads the video to your private storage and saves {analysis ? "what SetVision measured, plus " : ""}your review.
            Nothing is added to your workout log.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving" || saveStatus === "saved"}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.1] disabled:opacity-50"
            data-testid="sv-save-button"
          >
            {saveStatus === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Try saving again" : analysis ? "Save analysis and review" : "Save review"}
          </button>
          <p className="mt-2 text-sm" aria-live="polite">
            {saveStatus === "error" ? (
              <span className="text-rose-400" data-testid="sv-save-error">Could not save — nothing was stored. Check your connection and try again.</span>
            ) : saveStatus === "saved" ? (
              <span className="text-zinc-400" data-testid="sv-save-ok">Saved. Open it under “Saved analyses” below to see it reloaded from your account.</span>
            ) : null}
          </p>
        </article>
      ) : null}

      {measured && selection?.capability === "ANALYSIS_VERIFIED" ? (
        <article className="rounded-3xl border border-white/10 bg-mf-surface p-6 sm:p-8" data-testid="sv-dante">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">6. Ask Dante what this means for your next set</p>

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
      ) : measured && selection ? (
        <p className="text-xs leading-5 text-zinc-500" data-testid="sv-dante-withheld">
          Dante recommendations use verified analyses only — this experimental {selection.label.toLowerCase()} analysis is not sent to Dante.
        </p>
      ) : null}

      {danteState?.status === "done" && danteState.decision ? (
        <DecisionCard decision={danteState.decision} explanation={danteState.explanation ?? null} />
      ) : null}

      <SavedAnalyses refreshKey={savedCount} />
    </div>
  );
}
