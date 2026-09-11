"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import Webcam from "react-webcam"
import toast from "react-hot-toast"
import {
  AlertTriangle,
  Bot,
  Camera,
  CameraOff,
  RotateCcw,
  ShieldCheck,
  Timer,
} from "lucide-react"

import { loadPoseDetector } from "@/lib/ai"
import { createSquatAnalyzer } from "@/lib/form-coach/squat-analyzer"
import { createPushupAnalyzer } from "@/lib/form-coach/pushup-analyzer"
import { createPlankAnalyzer } from "@/lib/form-coach/plank-analyzer"
import type {
  ExerciseId,
  FormSessionSummary,
  PlankFrameResult,
  PoseFrame,
  PushupFrameResult,
  PushupRepQuality,
  Quality,
  SquatFrameResult,
  SquatRepQuality,
} from "@/lib/form-coach/types"
import { cn } from "@/lib/utils"
import { FORM_COACH_HANDOFF_KEY } from "@/lib/form-coach/handoff"

import { PoseOverlayCanvas } from "./pose-overlay-canvas"

type CameraState = "idle" | "starting" | "loading-model" | "running" | "error"

const EXERCISES: Array<{ id: ExerciseId; label: string }> = [
  { id: "squat", label: "Squat" },
  { id: "pushup", label: "Push-up" },
  { id: "plank", label: "Plank" },
]

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function buildSessionSummaryText(summary: FormSessionSummary): string {
  const lines = [
    "FORM SESSION",
    "",
    `Exercise: ${summary.exercise === "squat" ? "Squat" : summary.exercise === "pushup" ? "Push-up" : "Plank"}`,
  ]

  if (summary.exercise === "plank") {
    lines.push(`Hold duration: ${formatDuration(summary.holdMs ?? 0)}`)
  } else {
    lines.push(`Reps analysed: ${summary.repsAnalyzed}`)

    if (summary.depthAcceptable !== null) {
      lines.push(`Depth acceptable: ${summary.depthAcceptable}/${summary.repsAnalyzed}`)
    }

    if (summary.exercise === "squat") {
      lines.push(`Torso warning: ${summary.torsoWarningReps ?? 0} reps`)
      lines.push(`Knee tracking warning: ${summary.kneeTrackingWarningReps ?? 0} reps`)
    }

    if (summary.exercise === "pushup") {
      lines.push(`Body-line warning: ${summary.bodyLineWarningReps ?? 0} reps`)
    }
  }

  lines.push(
    "",
    "This data was measured deterministically by the Form Coach camera analysis — please explain what these patterns suggest and how I could adjust my next session.",
  )

  return lines.join("\n")
}

const QUALITY_STYLES: Record<Quality, string> = {
  good: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  watch: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  poor: "border-rose-400/25 bg-rose-400/10 text-rose-300",
  unknown: "border-white/10 bg-white/5 text-zinc-500",
}

function QualityRow({ label, value }: { label: string; value: Quality | string }) {
  const isQuality = value === "good" || value === "watch" || value === "poor" || value === "unknown"
  const display = isQuality ? value.toUpperCase() : value

  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <span
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide",
          isQuality ? QUALITY_STYLES[value as Quality] : "border-white/10 bg-white/5 text-zinc-300",
        )}
      >
        {display}
      </span>
    </div>
  )
}

export function FormCoachCamera() {
  const router = useRouter()
  const webcamRef = useRef<Webcam>(null)

  const [exercise, setExercise] = useState<ExerciseId>("squat")
  const [cameraState, setCameraState] = useState<CameraState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null)
  const [videoDims, setVideoDims] = useState({ width: 1280, height: 720 })

  const [squatResult, setSquatResult] = useState<SquatFrameResult | null>(null)
  const [pushupResult, setPushupResult] = useState<PushupFrameResult | null>(null)
  const [plankResult, setPlankResult] = useState<PlankFrameResult | null>(null)

  const [sessionSummary, setSessionSummary] = useState<FormSessionSummary | null>(null)

  const squatAnalyzerRef = useRef(createSquatAnalyzer())
  const pushupAnalyzerRef = useRef(createPushupAnalyzer())
  const plankAnalyzerRef = useRef(createPlankAnalyzer())

  const completedSquatRepsRef = useRef<SquatRepQuality[]>([])
  const completedPushupRepsRef = useRef<PushupRepQuality[]>([])
  const lastRepCountRef = useRef(0)

  const runningRef = useRef(false)
  const animationFrameRef = useRef<number | null>(null)
  const modelReadyRef = useRef(false)
  const sessionStartedAtRef = useRef<number | null>(null)
  const errorShownRef = useRef(false)

  /* =======================================================
     RESET SESSION STATE (on exercise change or restart)
  ======================================================= */

  const resetSession = useCallback(() => {
    squatAnalyzerRef.current.reset()
    pushupAnalyzerRef.current.reset()
    plankAnalyzerRef.current.reset()
    completedSquatRepsRef.current = []
    completedPushupRepsRef.current = []
    lastRepCountRef.current = 0
    sessionStartedAtRef.current = null
    setSquatResult(null)
    setPushupResult(null)
    setPlankResult(null)
    setSessionSummary(null)
  }, [])

  function handleSelectExercise(next: ExerciseId) {
    if (cameraState === "running" || cameraState === "loading-model") return
    setExercise(next)
    resetSession()
  }

  /* =======================================================
     FRAME PROCESSING (one frame per call — no self recursion)
  ======================================================= */

  const processFrame = useCallback(async () => {
    if (!runningRef.current) return

    const video = webcamRef.current?.video
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    try {
      const detector = await loadPoseDetector()
      if (!runningRef.current) return

      const poses = await detector.estimatePoses(video, { flipHorizontal: false })
      if (!runningRef.current) return

      if (video.videoWidth && video.videoHeight) {
        setVideoDims({ width: video.videoWidth, height: video.videoHeight })
      }

      const pose = poses[0]

      if (!pose) {
        setPoseFrame(null)
        errorShownRef.current = false
        return
      }

      const frame: PoseFrame = {}
      for (const keypoint of pose.keypoints) {
        if (!keypoint.name) continue
        frame[keypoint.name] = { x: keypoint.x, y: keypoint.y, score: keypoint.score ?? 0 }
      }
      setPoseFrame(frame)

      if (sessionStartedAtRef.current === null) {
        sessionStartedAtRef.current = performance.now()
      }

      const timestampMs = performance.now()

      if (exercise === "squat") {
        const result = squatAnalyzerRef.current.processFrame(frame, timestampMs)
        setSquatResult(result)

        if (result.repCount > lastRepCountRef.current && result.lastCompletedRep) {
          completedSquatRepsRef.current = [
            ...completedSquatRepsRef.current,
            result.lastCompletedRep,
          ]
          lastRepCountRef.current = result.repCount
        }
      } else if (exercise === "pushup") {
        const result = pushupAnalyzerRef.current.processFrame(frame, timestampMs)
        setPushupResult(result)

        if (result.repCount > lastRepCountRef.current && result.lastCompletedRep) {
          completedPushupRepsRef.current = [
            ...completedPushupRepsRef.current,
            result.lastCompletedRep,
          ]
          lastRepCountRef.current = result.repCount
        }
      } else {
        const result = plankAnalyzerRef.current.processFrame(frame, timestampMs)
        setPlankResult(result)
      }

      errorShownRef.current = false
    } catch (error) {
      console.error("Form Coach pose detection error:", error)

      if (!errorShownRef.current) {
        errorShownRef.current = true
        toast.error("Pose analysis hit an error — form feedback paused.")
      }
    }
  }, [exercise])

  /* =======================================================
     LOOP
  ======================================================= */

  useEffect(() => {
    if (cameraState !== "running") return

    runningRef.current = true
    let cancelled = false

    async function runFrame() {
      if (cancelled || !runningRef.current) return
      await processFrame()
      if (cancelled || !runningRef.current) return
      animationFrameRef.current = window.requestAnimationFrame(() => void runFrame())
    }

    animationFrameRef.current = window.requestAnimationFrame(() => void runFrame())

    return () => {
      cancelled = true
      runningRef.current = false
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [cameraState, processFrame])

  /* =======================================================
     START / STOP
  ======================================================= */

  async function handleStart() {
    setErrorMessage(null)
    resetSession()
    setCameraState("starting")
    modelReadyRef.current = false

    loadPoseDetector()
      .then(() => {
        modelReadyRef.current = true
      })
      .catch((error: unknown) => {
        console.error("Unable to load pose model:", error)
        setErrorMessage("The AI pose model could not be loaded. Please try again.")
        setCameraState("error")
      })
  }

  function handleUserMedia() {
    setCameraState("loading-model")

    const waitForModel = () => {
      if (modelReadyRef.current) {
        setCameraState("running")
        return
      }
      window.setTimeout(waitForModel, 150)
    }

    waitForModel()
  }

  function handleUserMediaError(error: string | DOMException) {
    console.error("Camera error:", error)
    setCameraState("error")
    setErrorMessage("Camera access was denied or is unavailable.")
    toast.error("Camera access was denied or is unavailable.")
  }

  function computeSummary(): FormSessionSummary {
    const durationMs = sessionStartedAtRef.current
      ? performance.now() - sessionStartedAtRef.current
      : 0

    if (exercise === "squat") {
      const reps = completedSquatRepsRef.current
      return {
        exercise: "squat",
        repsAnalyzed: reps.length,
        durationMs,
        depthAcceptable: reps.filter((r) => r.depth === "good").length,
        torsoWarningReps: reps.filter((r) => r.torso !== "good").length,
        kneeTrackingWarningReps: reps.filter((r) => r.kneeTracking !== "good").length,
        bodyLineWarningReps: null,
        holdMs: null,
      }
    }

    if (exercise === "pushup") {
      const reps = completedPushupRepsRef.current
      return {
        exercise: "pushup",
        repsAnalyzed: reps.length,
        durationMs,
        depthAcceptable: reps.filter((r) => r.depth === "good").length,
        torsoWarningReps: null,
        kneeTrackingWarningReps: null,
        bodyLineWarningReps: reps.filter((r) => r.bodyLine !== "good").length,
        holdMs: null,
      }
    }

    return {
      exercise: "plank",
      repsAnalyzed: 0,
      durationMs,
      depthAcceptable: null,
      torsoWarningReps: null,
      kneeTrackingWarningReps: null,
      bodyLineWarningReps: null,
      holdMs: plankResult?.holdMs ?? 0,
    }
  }

  function handleEndSession() {
    runningRef.current = false
    setCameraState("idle")
    setPoseFrame(null)
    setSessionSummary(computeSummary())
  }

  function handleStartNewSession() {
    resetSession()
  }

  function handleAskDante() {
    if (!sessionSummary) return

    try {
      window.sessionStorage.setItem(
        FORM_COACH_HANDOFF_KEY,
        buildSessionSummaryText(sessionSummary),
      )
    } catch {
      // Ignore storage failures — worst case Dante just won't have the summary preloaded.
    }

    router.push("/chatbot")
  }

  useEffect(() => {
    return () => {
      runningRef.current = false
    }
  }, [])

  const isCameraMounted = cameraState === "starting" || cameraState === "loading-model" || cameraState === "running"

  return (
    <section className="space-y-6">
      {/* EXERCISE SELECTOR */}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Select exercise">
        {EXERCISES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={exercise === item.id}
            onClick={() => handleSelectExercise(item.id)}
            disabled={cameraState === "running" || cameraState === "loading-model"}
            className={cn(
              "rounded-xl border px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
              exercise === item.id
                ? "border-amber-400/40 bg-amber-400 text-black"
                : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* CAMERA */}

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
          <div className="relative aspect-video">
            {isCameraMounted ? (
              <div className="absolute inset-0 [transform:scaleX(-1)]">
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  mirrored={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                  onUserMedia={handleUserMedia}
                  onUserMediaError={handleUserMediaError}
                  className="h-full w-full object-cover"
                />

                <PoseOverlayCanvas
                  frame={poseFrame}
                  videoWidth={videoDims.width}
                  videoHeight={videoDims.height}
                  className="absolute inset-0 h-full w-full"
                />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                <Camera className="size-10 text-zinc-600" aria-hidden="true" />
                <p className="text-sm text-zinc-500">
                  Camera is off. Start a session to begin live form analysis.
                </p>
              </div>
            )}

            {/* VISIBILITY / STATUS OVERLAY */}

            {cameraState === "running" ? (
              (() => {
                const visibility =
                  exercise === "squat"
                    ? squatResult?.visibility
                    : exercise === "pushup"
                      ? pushupResult?.visibility
                      : plankResult?.visibility

                if (visibility && !visibility.ok) {
                  return (
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
                      <span className="rounded-full border border-amber-400/30 bg-black/80 px-4 py-2 text-xs font-bold text-amber-300 backdrop-blur">
                        {visibility.message}
                      </span>
                    </div>
                  )
                }

                return null
              })()
            ) : null}

            {cameraState === "loading-model" ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="text-sm font-semibold text-white">Loading AI pose model…</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* METRICS PANEL */}

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-400">
              Form Coach — Beta
            </p>
            <h2 className="mt-1 text-2xl font-black text-white">
              {EXERCISES.find((e) => e.id === exercise)?.label}
            </h2>

            {exercise !== "plank" ? (
              <p className="mt-2 text-4xl font-black text-white">
                REP{" "}
                {exercise === "squat" ? squatResult?.repCount ?? 0 : pushupResult?.repCount ?? 0}
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-3xl font-black text-white">
                <Timer className="size-6 text-amber-400" />
                {formatDuration(plankResult?.holdMs ?? 0)}
              </p>
            )}

            <div className="mt-5 space-y-2">
              {exercise === "squat" && squatResult ? (
                <>
                  <QualityRow label="Depth" value={squatResult.currentRepDepth} />
                  <QualityRow label="Torso" value={squatResult.currentRepTorso} />
                  <QualityRow label="Knee Track" value={squatResult.currentRepKneeTracking} />
                  <QualityRow label="Movement" value={squatResult.movement} />
                </>
              ) : null}

              {exercise === "pushup" && pushupResult ? (
                <>
                  <QualityRow label="Depth" value={pushupResult.currentRepDepth} />
                  <QualityRow label="Body Line" value={pushupResult.currentRepBodyLine} />
                </>
              ) : null}

              {exercise === "plank" && plankResult ? (
                <>
                  <QualityRow label="Body Line" value={plankResult.bodyLine} />
                  <QualityRow label="Stability" value={plankResult.stability} />
                </>
              ) : null}
            </div>

            {/* LIVE CUE */}

            {(() => {
              const cue =
                exercise === "squat"
                  ? squatResult?.cue
                  : exercise === "pushup"
                    ? pushupResult?.cue
                    : plankResult?.cue

              if (!cue) return null

              return (
                <div
                  className={cn(
                    "mt-5 rounded-2xl border p-4 text-sm font-semibold leading-6",
                    cue.severity === "good"
                      ? "border-emerald-400/20 bg-emerald-400/8 text-emerald-200"
                      : cue.severity === "watch"
                        ? "border-amber-400/20 bg-amber-400/8 text-amber-200"
                        : "border-white/10 bg-white/5 text-zinc-300",
                  )}
                >
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                    Live Cue
                  </p>
                  &ldquo;{cue.message}&rdquo;
                </div>
              )
            })()}
          </div>

          {/* CONTROLS */}

          <div className="space-y-3">
            {cameraState === "idle" || cameraState === "error" ? (
              <button
                type="button"
                onClick={handleStart}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3.5 text-sm font-black uppercase tracking-wide text-black transition hover:bg-amber-400"
              >
                <Camera className="size-4" />
                Start Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={handleEndSession}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-black uppercase tracking-wide text-white transition hover:bg-white/10"
              >
                <CameraOff className="size-4" />
                End Session
              </button>
            )}

            {errorMessage ? (
              <p className="flex items-start gap-2 text-xs leading-5 text-rose-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {errorMessage}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {/* SESSION SUMMARY */}

      {sessionSummary ? (
        <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.05] p-6 sm:p-8">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">
            Session Summary
          </p>
          <h3 className="mt-1 text-xl font-black text-white">
            {EXERCISES.find((e) => e.id === sessionSummary.exercise)?.label} —{" "}
            {formatDuration(sessionSummary.durationMs)}
          </h3>

          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-zinc-300">
            {buildSessionSummaryText(sessionSummary)}
          </pre>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleAskDante}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-amber-400"
            >
              <Bot className="size-4" />
              Ask Dante
            </button>

            <button
              type="button"
              onClick={handleStartNewSession}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-zinc-200 transition hover:border-white/20"
            >
              <RotateCcw className="size-4" />
              New Session
            </button>
          </div>
        </div>
      ) : null}

      {/* PRIVACY + LIMITATIONS */}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <p className="text-xs leading-5 text-zinc-500">
            Video is processed locally for form analysis and is not stored
            by default. The camera stops when you end the session or leave
            this page.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
          <p className="text-xs leading-5 text-zinc-500">
            Camera-based form feedback is an estimate and can be affected by
            camera angle, lighting, clothing, occlusion and individual
            anatomy. This is not injury prevention, medical diagnosis, or a
            professional biomechanical assessment.
          </p>
        </div>
      </div>
    </section>
  )
}
