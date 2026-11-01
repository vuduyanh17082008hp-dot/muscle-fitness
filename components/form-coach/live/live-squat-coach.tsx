"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Download, Pause, Play, Plus, RotateCcw, Square, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { ExercisePicker } from "@/components/setvision/exercise-picker";
import { createPoseLandmarker, toObservationParts } from "@/components/setvision/squat-p0/browser-media";
import {
  EventRow,
  ISSUE_TEXT,
  OUTCOME_LABEL,
  RESULT_TONE,
  STATUS_LABEL,
  card,
  eyebrow,
  fmt,
} from "@/components/setvision/squat-p0/squat-p0-analyzer";
import {
  CAMERA_FAILURE_TEXT,
  cameraConstraints,
  checkCameraSupport,
  classifyCameraError,
  stopStream,
  type CameraChoice,
  type CameraFailure,
} from "@/lib/form-coach/live-camera";
import { findExerciseOption, selectionFromOption, type SelectedExercise } from "@/lib/setvision/exercise-selection";
import {
  LIVE_P1A,
  SQUAT_P0,
  applyCorrections,
  assessReadiness,
  createFrameScheduler,
  createLiveSquatSession,
  type LiveInterruption,
  type LiveSetResult,
  type LiveSnapshot,
  type LiveSquatSession,
  type PoseObservation,
  type Readiness,
  type ReadinessIssue,
  type RepCorrection,
  type RepOutcome,
} from "@/lib/setvision/squat-p0";
import { cn } from "@/lib/utils";

/**
 * Form Coach P1A — live camera rep counting for the bodyweight squat.
 *
 * Camera (getUserMedia, explicit Start) → requestVideoFrameCallback → frame
 * scheduler (10 Hz, never queued) → MediaPipe detectForVideo (synchronous, so
 * one inference at a time) → PoseObservation → setup readiness, then the live
 * squat session (lib/setvision/squat-p0/live.ts). Nothing is recorded,
 * uploaded or saved; tracks stop at End Set, on leaving the page and on unmount.
 */

type Landmarker = Awaited<ReturnType<typeof createPoseLandmarker>>;

type Stage =
  | { kind: "off" }
  | { kind: "unavailable"; failure: CameraFailure }
  | { kind: "starting" }
  | { kind: "loading_model" }
  | { kind: "setup" }
  | { kind: "live" }
  | { kind: "review"; result: LiveSetResult; diagnostics: Diagnostics; cameraStopped: boolean };

type Diagnostics = {
  delegate: string;
  timestampBasis: string;
  modelLoadMs: number | null;
  firstInferenceMs: number | null;
  setMs: number;
  analysedFrames: number;
  effectiveFps: number;
  inferenceMs: { mean: number; p95: number; max: number };
  frameToResultMs: { mean: number; p95: number; max: number };
  repDisplayMs: { mean: number; max: number; n: number };
  skippedByInterval: number;
  skippedBusy: number;
  framesNotSeen: number;
  heapMb: number | null;
  video: string;
};

type Metrics = {
  infer: number[];
  latency: number[];
  repDisplay: number[];
  framesNotSeen: number;
  lastPresented: number | null;
  basis: Set<string>;
};

const LIVE_ENGINE = "squat";

const READINESS_TEXT: Record<ReadinessIssue, string> = {
  waiting_for_frames: "Checking the camera picture…",
  no_person: "No person detected. Step into view, about 2–3 m from the camera.",
  multiple_people: "More than one person is in view. Live counting needs only you in the picture.",
  low_visibility: "Hips, knees and ankles aren't clearly visible. Step back so your whole body is in frame, and add light if it's dim.",
  out_of_frame: "Part of your body is outside the picture. Step back or lower the camera so head to feet are in frame.",
  not_side_on: "Turn side-on to the camera — the counter measures your knee angle from the side.",
  not_standing: "Stand tall to begin. Counting starts from a standing position.",
  unsteady: "Hold still for a moment, standing tall.",
};

const PHASE_TEXT: Record<LiveSnapshot["phase"], string> = {
  unknown: "Waiting for you to stand tall",
  standing: "Standing",
  descending: "Going down",
  ascending: "Coming up",
};

const INTERRUPTION_TEXT: Record<LiveInterruption["reason"], string> = {
  paused: "you paused the set",
  hidden: "the page was hidden",
  camera: "the camera stopped",
  frame_size: "the camera picture changed size (rotation)",
};

function stats(values: number[]) {
  if (values.length === 0) return { mean: 0, p95: 0, max: 0 };
  const s = [...values].sort((a, b) => a - b);
  return {
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
    max: s[s.length - 1],
  };
}

function liveCapability(selection: SelectedExercise | null): "pilot" | "none" {
  return selection?.engine === LIVE_ENGINE ? "pilot" : "none";
}

const defaultSelection = () => {
  const option = findExerciseOption("setvision:squat");
  return option ? selectionFromOption(option) : null;
};

export function LiveSquatCoach() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<Landmarker | null>(null);
  const genRef = useRef(0);
  const frameHandleRef = useRef<number | null>(null);
  const schedulerRef = useRef(createFrameScheduler());
  const sessionRef = useRef<LiveSquatSession | null>(null);
  const setupObsRef = useRef<PoseObservation[]>([]);
  const setStartRef = useRef(0);
  const pendingRepRef = useRef<number | null>(null);
  const metricsRef = useRef<Metrics>({ infer: [], latency: [], repDisplay: [], framesNotSeen: 0, lastPresented: null, basis: new Set() });
  const modelTimesRef = useRef<{ loadMs: number | null; firstInferMs: number | null }>({ loadMs: null, firstInferMs: null });
  const stageRef = useRef<Stage["kind"]>("off");

  const [selection, setSelection] = useState<SelectedExercise | null>(defaultSelection);
  const [stage, setStageState] = useState<Stage>({ kind: "off" });
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [mirrored, setMirrored] = useState(true);
  const [corrections, setCorrections] = useState<RepCorrection[]>([]);

  const setStage = useCallback((next: Stage) => {
    stageRef.current = next.kind;
    setStageState(next);
  }, []);

  /* ---------------- teardown ---------------- */

  const stopFrames = useCallback(() => {
    const video = videoRef.current;
    if (frameHandleRef.current !== null) {
      if (video && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(frameHandleRef.current);
      else cancelAnimationFrame(frameHandleRef.current);
      frameHandleRef.current = null;
    }
  }, []);

  /** Stops every track this page opened. Bumping the generation makes any in-flight callback a no-op. */
  const stopCamera = useCallback(() => {
    genRef.current += 1;
    stopFrames();
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    schedulerRef.current.done();
  }, [stopFrames]);

  useEffect(
    () => () => {
      stopCamera();
      landmarkerRef.current?.landmarker.close();
      landmarkerRef.current = null;
    },
    [stopCamera],
  );

  /* ---------------- set lifecycle ---------------- */

  const collectDiagnostics = useCallback((setMs: number): Diagnostics => {
    const m = metricsRef.current;
    const sch = schedulerRef.current.stats();
    const video = videoRef.current;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const rep = m.repDisplay;
    return {
      delegate: landmarkerRef.current?.delegate ?? "—",
      timestampBasis: [...m.basis].join(", ") || "—",
      modelLoadMs: modelTimesRef.current.loadMs,
      firstInferenceMs: modelTimesRef.current.firstInferMs,
      setMs,
      analysedFrames: sessionRef.current?.observationCount() ?? 0,
      effectiveFps: setMs > 0 ? ((sessionRef.current?.observationCount() ?? 0) * 1000) / setMs : 0,
      inferenceMs: stats(m.infer),
      frameToResultMs: stats(m.latency),
      repDisplayMs: { mean: rep.length ? rep.reduce((a, b) => a + b, 0) / rep.length : 0, max: rep.length ? Math.max(...rep) : 0, n: rep.length },
      skippedByInterval: sch.skippedInterval,
      skippedBusy: sch.skippedBusy,
      framesNotSeen: m.framesNotSeen,
      heapMb: mem ? mem.usedJSHeapSize / 1048576 : null,
      video: video ? `${video.videoWidth}×${video.videoHeight}` : "—",
    };
  }, []);

  const endSet = useCallback(
    (cameraStopped = false) => {
      const session = sessionRef.current;
      if (!session) return;
      const t = performance.now() - setStartRef.current;
      const result = session.finish(t);
      const diagnostics = collectDiagnostics(t);
      stopCamera();
      setCorrections([]);
      setStage({ kind: "review", result, diagnostics, cameraStopped });
    },
    [collectDiagnostics, setStage, stopCamera],
  );

  const endSetRef = useRef(endSet);
  useEffect(() => {
    endSetRef.current = endSet;
  }, [endSet]);

  /* ---------------- frame loop ---------------- */

  const startFrameLoop = useCallback(() => {
    const video = videoRef.current;
    const lm = landmarkerRef.current;
    if (!video || !lm) return;
    const gen = genRef.current;
    const hasRvfc = "requestVideoFrameCallback" in video;

    const onFrame = (now: number, meta?: VideoFrameCallbackMetadata) => {
      if (gen !== genRef.current) return; // torn down: suppress late frames
      frameHandleRef.current = null;
      const m = metricsRef.current;
      // Monotonic performance-clock time of this frame: capture time when the browser reports it, else presentation.
      const frameTs = meta?.captureTime ?? meta?.presentationTime ?? now;
      m.basis.add(meta?.captureTime !== undefined ? "captureTime" : meta ? "presentationTime" : "rAF clock");
      if (meta) {
        if (m.lastPresented !== null && meta.presentedFrames > m.lastPresented + 1) m.framesNotSeen += meta.presentedFrames - m.lastPresented - 1;
        m.lastPresented = meta.presentedFrames;
      }

      const kind = stageRef.current;
      const paused = kind === "live" && sessionRef.current?.isPaused();
      if ((kind === "setup" || (kind === "live" && !paused)) && video.videoWidth > 0 && schedulerRef.current.tryBegin(frameTs)) {
        try {
          const t0 = performance.now();
          const result = lm.landmarker.detectForVideo(video, Math.round(frameTs));
          const t1 = performance.now();
          if (gen !== genRef.current) return;
          if (modelTimesRef.current.firstInferMs === null) modelTimesRef.current.firstInferMs = t1 - t0;
          else if (kind === "live") {
            m.infer.push(t1 - t0);
            m.latency.push(t1 - frameTs);
          }
          const parts = toObservationParts(result, video.videoWidth, video.videoHeight);

          if (kind === "setup") {
            const o: PoseObservation = { ...parts, timestampMs: Math.round(frameTs), timestampSource: "clock", frameStatus: "decoded" };
            const buf = setupObsRef.current;
            buf.push(o);
            while (buf.length > 30) buf.shift();
            setReadiness(assessReadiness(buf, o.timestampMs));
          } else if (sessionRef.current) {
            const t = Math.round(frameTs - setStartRef.current);
            if (t >= 0) {
              const snap = sessionRef.current.push({ ...parts, timestampMs: t, timestampSource: "clock", frameStatus: "decoded" });
              if (snap.confirmedAtMs !== null) pendingRepRef.current = setStartRef.current + snap.confirmedAtMs;
              setSnapshot(snap);
              if (t >= LIVE_P1A.maxSetMs) endSetRef.current();
            }
          }
        } catch (error) {
          console.error("[FORM COACH P1A] pose inference failed", error);
        } finally {
          schedulerRef.current.done();
        }
      }
      if (gen !== genRef.current) return;
      frameHandleRef.current = hasRvfc ? video.requestVideoFrameCallback(onFrame) : requestAnimationFrame((t) => onFrame(t));
    };

    frameHandleRef.current = hasRvfc ? video.requestVideoFrameCallback(onFrame) : requestAnimationFrame((t) => onFrame(t));
  }, []);

  // Rep display latency: confirming frame's capture/presentation → first paint after the new event is in the DOM.
  useEffect(() => {
    const confirmedAt = pendingRepRef.current;
    if (confirmedAt === null) return;
    pendingRepRef.current = null;
    requestAnimationFrame(() => metricsRef.current.repDisplay.push(performance.now() - confirmedAt));
  }, [snapshot?.events.length]);

  /* ---------------- camera ---------------- */

  const listCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch {
      setCameras([]);
    }
  }, []);

  const openCamera = useCallback(
    async (choice: CameraChoice) => {
      const unsupported = checkCameraSupport({ isSecureContext: window.isSecureContext, mediaDevices: navigator.mediaDevices });
      if (unsupported) {
        setStage({ kind: "unavailable", failure: unsupported });
        return;
      }
      stopCamera();
      const gen = genRef.current;
      setReadiness(null);
      setupObsRef.current = [];
      setStage({ kind: "starting" });

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(choice));
      } catch (error) {
        if (gen === genRef.current) setStage({ kind: "unavailable", failure: classifyCameraError(error) });
        return;
      }
      if (gen !== genRef.current) {
        stopStream(stream); // superseded (unmounted, restarted) while the prompt was open
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings();
      setCameraId(settings?.deviceId ?? "");
      setMirrored(settings?.facingMode !== "environment");
      track?.addEventListener("ended", () => {
        if (gen !== genRef.current) return;
        if (stageRef.current === "live") {
          sessionRef.current?.pause(performance.now() - setStartRef.current, "camera");
          endSetRef.current(true);
        } else {
          stopCamera();
          setStage({ kind: "unavailable", failure: "interrupted" });
        }
      });

      const video = videoRef.current;
      if (!video) {
        stopCamera();
        setStage({ kind: "unavailable", failure: "unknown" });
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay of a muted inline stream is allowed after a click; if it still fails the frame loop simply waits.
      }
      void listCameras();

      if (!landmarkerRef.current) {
        setStage({ kind: "loading_model" });
        const t0 = performance.now();
        try {
          const created = await createPoseLandmarker();
          if (gen !== genRef.current) {
            // Torn down while loading: keep the model for the next start (cheap) unless the page is gone.
            landmarkerRef.current = created;
            return;
          }
          landmarkerRef.current = created;
          modelTimesRef.current.loadMs = performance.now() - t0;
        } catch (error) {
          console.error("[FORM COACH P1A] pose model failed to load", error);
          if (gen === genRef.current) {
            stopCamera();
            setStage({ kind: "unavailable", failure: "unknown" });
          }
          return;
        }
      }
      if (gen !== genRef.current) return;
      setStage({ kind: "setup" });
      startFrameLoop();
    },
    [listCameras, setStage, startFrameLoop, stopCamera],
  );

  // Page hidden mid-set: pause (the user resumes). Frames stop arriving anyway; this makes it explicit.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && stageRef.current === "live") {
        const s = sessionRef.current;
        if (s && !s.isPaused()) {
          s.pause(performance.now() - setStartRef.current, "hidden");
          setSnapshot(s.snapshot(performance.now() - setStartRef.current));
        }
      }
    };
    // Leaving (or bfcache): end a running set so its result is kept, otherwise just release the camera.
    const onPageHide = () => {
      if (stageRef.current === "live") endSetRef.current();
      else if (stageRef.current !== "review") {
        stopCamera();
        setStage({ kind: "off" });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [setStage, stopCamera]);

  // Timer: a stalled camera (no frames at all) still pauses counting and closes the open cycle.
  useEffect(() => {
    if (stage.kind !== "live") return;
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      if (!s) return;
      const snap = s.tick(performance.now() - setStartRef.current);
      setSnapshot((prev) => (prev && prev.tracking === snap.tracking && prev.events.length === snap.events.length && prev.userPaused === snap.userPaused ? prev : snap));
    }, 250);
    return () => window.clearInterval(id);
  }, [stage.kind]);

  /* ---------------- actions ---------------- */

  const startSet = () => {
    if (readiness?.state !== "ready") return;
    sessionRef.current = createLiveSquatSession(readiness.side);
    schedulerRef.current = createFrameScheduler();
    metricsRef.current = { infer: [], latency: [], repDisplay: [], framesNotSeen: 0, lastPresented: null, basis: new Set() };
    setStartRef.current = performance.now();
    setSnapshot(sessionRef.current.snapshot(0));
    setStage({ kind: "live" });
  };

  const togglePause = () => {
    const s = sessionRef.current;
    if (!s) return;
    const t = performance.now() - setStartRef.current;
    if (s.isPaused()) s.resume(t);
    else s.pause(t);
    setSnapshot(s.snapshot(t));
  };

  const turnOff = () => {
    stopCamera();
    setReadiness(null);
    setStage({ kind: "off" });
  };

  const discard = () => {
    sessionRef.current = null;
    setCorrections([]);
    setSnapshot(null);
    setStage({ kind: "off" });
  };

  const live = liveCapability(selection);
  const cameraOn = stage.kind === "starting" || stage.kind === "loading_model" || stage.kind === "setup" || stage.kind === "live";

  return (
    <div className="space-y-6" data-testid="fc-live">
      <section className={card} aria-label="Exercise">
        <div>
          {cameraOn ? (
            <p className={eyebrow}>1. Exercise · {selection?.label}</p>
          ) : (
            <ExercisePicker
              selection={selection}
              autoDetect={false}
              onSelect={(s) => {
                setSelection(s);
                setStage({ kind: "off" });
              }}
              selectedDetail={(s) => <LiveCapabilityDetail selection={s} />}
            />
          )}
        </div>
      </section>

      {live === "none" ? (
        <section className={card} data-testid="fc-unsupported">
          <p className={eyebrow}>Live counting not available</p>
          <p className="mt-2 text-sm text-mf-glass-text-secondary">
            {selection ? `${selection.label} has no live counter.` : "Choose an exercise."} The P1A live pilot counts only the
            bodyweight squat. Record your set and review it in SetVision instead — that is an upload, not live analysis.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard/workouts/setvision" data-testid="fc-setvision-link">
                <Upload className="size-4" aria-hidden="true" /> Review a recording in SetVision
              </Link>
            </Button>
          </div>
        </section>
      ) : stage.kind === "review" ? (
        <Review
          stage={stage}
          corrections={corrections}
          setCorrections={setCorrections}
          onDiscard={discard}
          onAgain={() => {
            discard();
            void openCamera(cameraId ? { deviceId: cameraId } : { facingMode: "user" });
          }}
        />
      ) : (
        <section className={card} aria-labelledby="fc-camera">
          <p id="fc-camera" className={eyebrow}>2. Set up the camera</p>
          <ul className="mt-3 grid gap-1 text-sm text-mf-glass-text-secondary sm:grid-cols-2">
            <li>Camera side-on to you, at about hip height</li>
            <li>Phone or laptop fixed in place — not hand-held</li>
            <li>Whole body in frame, head to feet, 2–3 m away</li>
            <li>Only you in the picture, in decent light</li>
          </ul>

          <div className={cn("relative mt-5 overflow-hidden rounded-2xl border border-mf-glass-border bg-black", cameraOn ? "block" : "hidden")}>
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className={cn("mx-auto max-h-[50vh] w-full object-contain", mirrored && "-scale-x-100")}
              aria-label="Live camera preview (not recorded)"
              data-testid="fc-preview"
            />
            {stage.kind === "starting" || stage.kind === "loading_model" ? (
              <p className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center text-sm font-semibold text-white" aria-live="polite">
                {stage.kind === "starting" ? "Waiting for camera permission…" : "Loading the pose model (first time ~9 MB)…"}
              </p>
            ) : null}
            {stage.kind === "live" && snapshot ? <LiveOverlay snapshot={snapshot} /> : null}
          </div>

          {stage.kind === "unavailable" ? (
            <div role="alert" className="mt-5 rounded-xl border border-mf-danger/30 bg-mf-danger/5 p-4" data-testid="fc-camera-error" data-failure={stage.failure}>
              <p className="text-sm font-semibold text-mf-glass-text">{CAMERA_FAILURE_TEXT[stage.failure].title}</p>
              <p className="mt-1 text-sm text-mf-glass-text-secondary">{CAMERA_FAILURE_TEXT[stage.failure].detail}</p>
              <p className="mt-2 text-sm text-mf-glass-text-secondary">
                No camera? Record the set on any device and{" "}
                <Link href="/dashboard/workouts/setvision/squat" className="font-semibold text-mf-glass-text underline underline-offset-4" data-testid="fc-upload-fallback">
                  review the clip in SetVision
                </Link>{" "}
                — an upload you check afterwards, not live counting.
              </p>
            </div>
          ) : null}

          {stage.kind === "setup" ? <SetupStatus readiness={readiness} /> : null}
          {stage.kind === "live" && snapshot ? <LiveStatus snapshot={snapshot} /> : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {stage.kind === "off" || stage.kind === "unavailable" ? (
              <Button onClick={() => void openCamera({ facingMode: "user" })} data-testid="fc-start-camera">
                <Camera className="size-4" aria-hidden="true" /> {stage.kind === "unavailable" ? "Try the camera again" : "Start camera"}
              </Button>
            ) : null}
            {stage.kind === "setup" ? (
              <>
                <Button onClick={startSet} disabled={readiness?.state !== "ready"} data-testid="fc-start-set">
                  <Play className="size-4" aria-hidden="true" /> Start set
                </Button>
                <Button variant="secondary" onClick={turnOff} data-testid="fc-stop-camera">
                  <CameraOff className="size-4" aria-hidden="true" /> Turn camera off
                </Button>
                {cameras.length > 1 ? (
                  <label className="flex items-center gap-2 text-xs text-mf-glass-text-muted">
                    Camera
                    <select
                      className="h-11 max-w-[14rem] rounded-lg border border-mf-glass-border-strong bg-mf-glass-surface px-2 text-sm text-mf-glass-text"
                      value={cameraId}
                      onChange={(e) => void openCamera({ deviceId: e.target.value })}
                      data-testid="fc-camera-select"
                    >
                      {cameras.map((c, i) => (
                        <option key={c.deviceId || i} value={c.deviceId}>
                          {c.label || `Camera ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            {stage.kind === "live" ? (
              <>
                <Button variant="secondary" onClick={togglePause} data-testid="fc-pause">
                  {snapshot?.userPaused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
                  {snapshot?.userPaused ? "Resume" : "Pause"}
                </Button>
                <Button onClick={() => endSet()} data-testid="fc-end-set">
                  <Square className="size-4" aria-hidden="true" /> End set
                </Button>
              </>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-mf-glass-text-muted">
            The camera starts only when you press Start camera and stops when you end the set or leave this page. Video is analysed on
            this device and never recorded or uploaded; only the pose model downloads.
          </p>
        </section>
      )}
    </div>
  );
}

function LiveCapabilityDetail({ selection }: { selection: SelectedExercise }) {
  const pilot = liveCapability(selection) === "pilot";
  return (
    <div className="mt-2 space-y-1" data-testid="fc-live-capability" data-live={pilot ? "pilot" : "none"}>
      <StatusBadge label={pilot ? "Live pilot · Experimental" : "No live counting"} tone={pilot ? "warning" : "neutral"} />
      <p className="text-xs leading-5 text-zinc-400">
        {pilot
          ? "Counts bodyweight-squat movement cycles from a side-on camera, live. Tested only on simulated camera input — counts are unvalidated and say nothing about depth, form or safety. Loaded squats were not tested."
          : "Live counting is available only for the bodyweight squat. Use SetVision to review a recording of this exercise."}
      </p>
    </div>
  );
}

const READY_TONE: Record<Readiness["state"], StatusTone> = { ready: "good", adjust: "warning", cannot_verify: "neutral" };
const READY_LABEL: Record<Readiness["state"], string> = { ready: "Ready", adjust: "Adjust camera", cannot_verify: "Cannot verify" };

function SetupStatus({ readiness }: { readiness: Readiness | null }) {
  const state = readiness?.state ?? "cannot_verify";
  return (
    <div className="mt-4 flex flex-wrap items-start gap-3" aria-live="polite" data-testid="fc-readiness" data-state={state}>
      <StatusBadge label={READY_LABEL[state]} tone={READY_TONE[state]} />
      <p className="min-w-0 flex-1 text-sm text-mf-glass-text-secondary">
        {readiness?.state === "ready"
          ? "One person, side-on, standing, joints visible. Press Start set, then squat."
          : READINESS_TEXT[readiness ? readiness.issue : "waiting_for_frames"]}
        <span className="mt-1 block text-xs text-mf-glass-text-muted">
          Framing checks only (heuristic, not a measured camera-quality score) — not a judgement of your technique.
        </span>
      </p>
    </div>
  );
}

function trackingView(s: LiveSnapshot): { label: string; tone: StatusTone; text: string } {
  if (s.userPaused) return { label: "Paused", tone: "neutral", text: "Counting is paused. A rep that was in progress is marked uncertain." };
  if (s.tracking === "tracking") return { label: "Counting", tone: "good", text: PHASE_TEXT[s.phase] };
  const why = s.issue ? ISSUE_TEXT[s.issue] : "no usable frames";
  if (s.tracking === "lost") {
    return { label: "Tracking lost", tone: "critical", text: `Counting paused: ${why}. Any rep in progress is marked uncertain; stand tall in view to resume.` };
  }
  return { label: "Counting paused", tone: "warning", text: `Counting paused: ${why}.` };
}

function LiveOverlay({ snapshot }: { snapshot: LiveSnapshot }) {
  const v = trackingView(snapshot);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
      <span className="rounded-full bg-black/75 px-3 py-1 text-xs font-bold text-white" data-testid="fc-overlay-state">
        {v.label}
      </span>
      <span className="rounded-2xl bg-black/75 px-3 py-1 text-right text-white">
        <span className="block text-3xl font-black tabular-nums leading-none" data-testid="fc-overlay-count">
          {snapshot.counts.completed}
        </span>
        <span className="text-[11px] font-semibold">completed</span>
      </span>
    </div>
  );
}

function LiveStatus({ snapshot }: { snapshot: LiveSnapshot }) {
  const v = trackingView(snapshot);
  return (
    <div className="mt-4 space-y-3" data-testid="fc-live-status" data-tracking={snapshot.userPaused ? "user_paused" : snapshot.tracking} data-phase={snapshot.phase}>
      <div className="flex flex-wrap items-start gap-3" aria-live="polite">
        <StatusBadge label={v.label} tone={v.tone} />
        <p className="min-w-0 flex-1 text-sm text-mf-glass-text-secondary" data-testid="fc-phase">
          {v.text}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2" data-testid="fc-live-counts">
        {(["completed", "partial", "uncertain"] as const).map((k) => (
          <div key={k} className="rounded-2xl border border-mf-glass-border bg-mf-glass-bg p-2 text-center">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-mf-glass-text-muted">{k}</dt>
            <dd className="text-2xl font-black tabular-nums text-mf-glass-text" data-testid={`fc-count-${k}`}>
              {snapshot.counts[k]}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-mf-glass-text-muted">
        Completed = a fully observed squat-shaped movement cycle (knee angle below {SQUAT_P0.cycleFlexionMaxDeg}° in 2D and back up). It does
        not certify depth, form or safety.
      </p>
    </div>
  );
}

function Review({
  stage,
  corrections,
  setCorrections,
  onDiscard,
  onAgain,
}: {
  stage: Extract<Stage, { kind: "review" }>;
  corrections: RepCorrection[];
  setCorrections: React.Dispatch<React.SetStateAction<RepCorrection[]>>;
  onDiscard: () => void;
  onAgain: () => void;
}) {
  const { result, diagnostics: d, cameraStopped } = stage;
  const a = result.analysis;
  const abstained = a.status === "INSUFFICIENT_EVIDENCE";
  const events = result.liveEvents;
  const corrected = useMemo(() => applyCorrections(events, corrections), [events, corrections]);
  const liveCounts = useMemo(() => applyCorrections(events, []).counts, [events]);
  const loss = a.trackingLoss.filter((l) => l.severity !== "bridged");

  const relabel = (eventId: string, value: string) =>
    setCorrections((prev) => {
      const rest = prev.filter((c) => !(c.kind === "relabel" && c.eventId === eventId));
      if (value === "detected") return rest;
      return [...rest, { kind: "relabel", eventId, outcome: value as RepOutcome | "NOT_A_REP", by: "user", atIso: new Date().toISOString() }];
    });
  const addMissed = () =>
    setCorrections((prev) => [
      ...prev,
      { kind: "added", id: `user-${prev.length + 1}-${Date.now()}`, atMs: Math.round(a.durationMs), outcome: "COMPLETED", by: "user", atIso: new Date().toISOString() },
    ]);

  const download = () => {
    const payload = {
      kind: "form-coach-p1a-live-squat-set",
      generatedAt: new Date().toISOString(),
      adapterVersion: result.adapterVersion,
      diagnostics: d,
      interruptions: result.interruptions,
      liveEvents: result.liveEvents,
      analysis: a,
      userCorrections: corrections,
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `form-coach-live-squat-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <>
      <section className={card} aria-labelledby="fc-review" data-testid="fc-review" data-status={a.status}>
        <p id="fc-review" className={eyebrow}>3. Review the set · camera off</p>
        <h2 className="mt-1 text-xl font-black text-mf-glass-text">
          {abstained ? "Not enough evidence to confirm a count" : `Movement cycles · ${fmt(a.durationMs)}`}
        </h2>
        {cameraStopped ? (
          <p className="mt-2 text-sm text-mf-warning" data-testid="fc-review-camera-stopped">
            The camera stopped during the set, so it ended there.
          </p>
        ) : null}
        {abstained ? (
          <div className="mt-4 rounded-xl border border-mf-warning/30 bg-mf-warning/5 p-4" data-testid="fc-insufficient">
            <p className="text-sm font-semibold text-mf-glass-text">The end-of-set checks did not confirm the live count because:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mf-glass-text-secondary">
              {a.insufficientReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-mf-glass-text-secondary">The live counter&apos;s cycles are listed below, unconfirmed.</p>
          </div>
        ) : null}
        <dl className="mt-4 grid grid-cols-3 gap-2" data-testid="fc-review-counts">
          {(["completed", "partial", "uncertain"] as const).map((k) => (
            <div key={k} className="rounded-2xl border border-mf-glass-border bg-mf-glass-bg p-2 text-center">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-mf-glass-text-muted">{k}</dt>
              <dd className="text-2xl font-black tabular-nums text-mf-glass-text" data-testid={`fc-review-${k}`}>
                {liveCounts[k]}
              </dd>
            </div>
          ))}
        </dl>
        {corrected.corrected ? (
          <p className="mt-3 text-sm text-mf-glass-text-secondary" data-testid="fc-corrected-counts">
            With your corrections: {corrected.counts.completed} completed · {corrected.counts.partial} partial · {corrected.counts.uncertain}{" "}
            uncertain. Corrections are your own call and are kept apart from what the camera detected.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-mf-glass-text-muted">
          Nothing was saved to your workouts, sets or records. Times are from the start of the set.
        </p>

        {loss.length || result.interruptions.length ? (
          <ul className="mt-4 space-y-1 text-sm text-mf-glass-text-secondary" data-testid="fc-tracking-loss">
            {loss.map((l, i) => (
              <li key={`l${i}`}>
                {fmt(l.startMs)} – {fmt(l.endMs)} tracking {l.severity === "lost" ? "lost" : "interrupted"}: {ISSUE_TEXT[l.issue]}
                {l.severity === "lost" ? " — reps in this span cannot be counted." : "."}
              </li>
            ))}
            {result.interruptions.map((x, i) => (
              <li key={`i${i}`}>
                {fmt(x.startMs)} – {fmt(x.endMs)} not counted: {INTERRUPTION_TEXT[x.reason]}.
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={card} aria-labelledby="fc-events">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="fc-events" className={eyebrow}>4. Check each cycle</p>
          <Button variant="secondary" size="sm" onClick={addMissed} data-testid="fc-add-rep">
            <Plus className="size-4" aria-hidden="true" /> Add a rep the camera missed
          </Button>
        </div>
        {corrected.items.length === 0 ? <p className="mt-3 text-sm text-mf-glass-text-secondary">No movement cycles were detected.</p> : null}
        <ol className="mt-4 space-y-3" data-testid="fc-event-list">
          {corrected.items.map((item) => {
            const ev = events.find((e) => e.id === item.id);
            return ev ? (
              <EventRow key={item.id} ev={ev} outcome={item.outcome} corrected={item.correctedByUser} onRelabel={relabel} />
            ) : (
              <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-mf-glass-border-strong p-3" data-testid="fc-added-rep">
                <StatusBadge label={`Added by you · ${OUTCOME_LABEL[item.outcome]}`} tone="neutral" />
                <button
                  type="button"
                  className="ml-auto min-h-11 rounded-lg px-3 text-xs text-mf-glass-text-muted hover:bg-mf-glass-hover"
                  onClick={() => setCorrections((prev) => prev.filter((c) => !(c.kind === "added" && c.id === item.id)))}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={onAgain} data-testid="fc-again">
            <RotateCcw className="size-4" aria-hidden="true" /> Start another set
          </Button>
          <Button variant="secondary" onClick={download} data-testid="fc-download">
            <Download className="size-4" aria-hidden="true" /> Download set (JSON)
          </Button>
          <Button variant="secondary" onClick={onDiscard} data-testid="fc-discard">
            <Trash2 className="size-4" aria-hidden="true" /> Discard set
          </Button>
        </div>
      </section>

      <section className={card} aria-labelledby="fc-evidence">
        <p id="fc-evidence" className={eyebrow}>Evidence quality and limits</p>
        <ul className="mt-3 divide-y divide-mf-glass-border" data-testid="fc-quality-list">
          {a.quality.checks.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 py-2 lg:flex-row lg:items-start lg:gap-4">
              <span className="text-sm font-semibold text-mf-glass-text lg:w-56">{c.label}</span>
              <span className="flex shrink-0 flex-wrap gap-2 lg:w-64">
                <StatusBadge label={c.result.replace("_", " ")} tone={RESULT_TONE[c.result]} className="whitespace-nowrap" />
                <StatusBadge label={STATUS_LABEL[c.status]} tone="neutral" className="whitespace-nowrap" />
              </span>
              <span className="min-w-0 break-words text-sm text-mf-glass-text-secondary">{c.detail}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-mf-glass-text-secondary">
          {a.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <details className="mt-4 text-xs text-mf-glass-text-muted" data-testid="fc-diagnostics">
          <summary className="cursor-pointer py-2 font-semibold text-mf-glass-text">This device&apos;s performance during the set</summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2" data-testid="fc-diagnostics-list">
            <Diag k="Pose model" v={`${d.delegate}${d.modelLoadMs !== null ? `, loaded in ${(d.modelLoadMs / 1000).toFixed(1)} s` : ""}${d.firstInferenceMs !== null ? `, first inference ${d.firstInferenceMs.toFixed(0)} ms` : ""}`} />
            <Diag k="Camera picture" v={d.video} />
            <Diag k="Analysed frames" v={`${d.analysedFrames} in ${(d.setMs / 1000).toFixed(1)} s (${d.effectiveFps.toFixed(1)} per s; target ${1000 / LIVE_P1A.analysisIntervalMs})`} />
            <Diag k="Inference" v={`mean ${d.inferenceMs.mean.toFixed(0)} ms · p95 ${d.inferenceMs.p95.toFixed(0)} · max ${d.inferenceMs.max.toFixed(0)}`} />
            <Diag k="Frame → result" v={`mean ${d.frameToResultMs.mean.toFixed(0)} ms · p95 ${d.frameToResultMs.p95.toFixed(0)} · max ${d.frameToResultMs.max.toFixed(0)}`} />
            <Diag k="Rep → on screen" v={d.repDisplayMs.n ? `mean ${d.repDisplayMs.mean.toFixed(0)} ms · max ${d.repDisplayMs.max.toFixed(0)} (${d.repDisplayMs.n} reps)` : "no reps"} />
            <Diag k="Frames skipped" v={`${d.skippedByInterval} by the 10 Hz limit · ${d.skippedBusy} while busy · ${d.framesNotSeen} not delivered`} />
            <Diag k="Timestamps" v={`${d.timestampBasis} (monotonic clock)`} />
            <Diag k="JS heap" v={d.heapMb !== null ? `${d.heapMb.toFixed(0)} MB` : "not reported by this browser"} />
            <Diag k="Engine" v={`${a.engineVersion} · ${result.adapterVersion} · side ${a.quality.lockedSide}`} />
          </dl>
        </details>
      </section>
    </>
  );
}

function Diag({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}
