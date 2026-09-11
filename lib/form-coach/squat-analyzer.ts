/**
 * Deterministic squat analyzer.
 *
 * Pure, local, browser-side geometry — no network calls, no LLM.
 * State machine:
 *
 *   STANDING -> DESCENDING -> BOTTOM -> ASCENDING -> STANDING (+1 rep)
 *
 * Hysteresis (angle smoothing + a minimum frame count per transition +
 * a minimum time between completed reps) exists specifically so one
 * noisy landmark frame cannot register a fake rep or a fake phase
 * change.
 */

import { angleAt, checkVisibility, getBestSide, inclinationFromVertical } from "@/lib/form-coach/geometry"
import type {
  PoseFrame,
  Quality,
  SquatFrameResult,
  SquatPhase,
  SquatRepQuality,
} from "@/lib/form-coach/types"

const STANDING_KNEE_ANGLE = 160
const BOTTOM_KNEE_ANGLE = 110
const MIN_FRAMES_PER_TRANSITION = 2
const MIN_MS_BETWEEN_REPS = 500
const SMOOTHING_WINDOW = 3

function classifyDepth(minKneeAngle: number): Quality {
  if (minKneeAngle <= 100) return "good"
  if (minKneeAngle <= 120) return "watch"
  return "poor"
}

function classifyTorso(maxInclinationDeg: number): Quality {
  if (maxInclinationDeg <= 35) return "good"
  if (maxInclinationDeg <= 50) return "watch"
  return "poor"
}

function classifyKneeTracking(maxOffsetRatio: number): Quality {
  if (maxOffsetRatio <= 0.35) return "good"
  if (maxOffsetRatio <= 0.55) return "watch"
  return "poor"
}

export function createSquatAnalyzer() {
  let phase: SquatPhase = "standing"
  let framesInState = 0
  let repCount = 0
  let lastRepCompletedAt = -Infinity
  let hasPassedBottom = false

  const kneeAngleBuffer: number[] = []

  let repMinKneeAngle = 180
  let repMaxTorso = 0
  let repMaxKneeOffset = 0
  let descentStartedAt: number | null = null
  let descentMs = 0

  let lastCompletedRep: SquatRepQuality | null = null

  function smooth(value: number): number {
    kneeAngleBuffer.push(value)
    if (kneeAngleBuffer.length > SMOOTHING_WINDOW) kneeAngleBuffer.shift()
    return kneeAngleBuffer.reduce((sum, v) => sum + v, 0) / kneeAngleBuffer.length
  }

  function reset() {
    phase = "standing"
    framesInState = 0
    repCount = 0
    lastRepCompletedAt = -Infinity
    hasPassedBottom = false
    kneeAngleBuffer.length = 0
    repMinKneeAngle = 180
    repMaxTorso = 0
    repMaxKneeOffset = 0
    descentStartedAt = null
    descentMs = 0
    lastCompletedRep = null
  }

  function processFrame(frame: PoseFrame, timestampMs: number): SquatFrameResult {
    const hip = getBestSide(frame, "hip")
    const knee = getBestSide(frame, "knee")
    const ankle = getBestSide(frame, "ankle")
    const shoulder = getBestSide(frame, "shoulder")

    const visibility = checkVisibility([hip, knee, ankle, shoulder])

    if (!visibility.ok || !hip || !knee || !ankle || !shoulder) {
      return {
        visibility,
        phase,
        repCount,
        hipAngle: null,
        kneeAngle: null,
        torsoInclinationDeg: null,
        kneeTrackingOffset: null,
        currentRepDepth: "unknown",
        currentRepTorso: "unknown",
        currentRepKneeTracking: "unknown",
        movement: "unknown",
        cue: null,
        lastCompletedRep,
      }
    }

    const rawKneeAngle = angleAt(hip, knee, ankle)
    const kneeAngle = smooth(rawKneeAngle)
    const hipAngle = angleAt(shoulder, hip, knee)
    const torsoInclinationDeg = inclinationFromVertical(hip, shoulder)

    const hipWidthReference = Math.max(1, Math.abs(shoulder.x - hip.x) * 2)
    const kneeTrackingOffset = Math.abs(knee.x - ankle.x) / hipWidthReference

    // ---- state machine (hysteresis via MIN_FRAMES_PER_TRANSITION) ----

    let nextPhase = phase
    framesInState += 1

    if (phase === "standing" && kneeAngle < STANDING_KNEE_ANGLE - 5) {
      nextPhase = "descending"
      descentStartedAt = timestampMs
      repMinKneeAngle = kneeAngle
      repMaxTorso = torsoInclinationDeg
      repMaxKneeOffset = kneeTrackingOffset
      hasPassedBottom = false
    } else if (
      phase === "descending" &&
      kneeAngle <= BOTTOM_KNEE_ANGLE &&
      framesInState >= MIN_FRAMES_PER_TRANSITION
    ) {
      nextPhase = "bottom"
      hasPassedBottom = true
    } else if (
      phase === "bottom" &&
      kneeAngle > BOTTOM_KNEE_ANGLE + 5 &&
      framesInState >= MIN_FRAMES_PER_TRANSITION
    ) {
      nextPhase = "ascending"
      descentMs = descentStartedAt !== null ? timestampMs - descentStartedAt : 0
    } else if (
      phase === "ascending" &&
      kneeAngle >= STANDING_KNEE_ANGLE &&
      framesInState >= MIN_FRAMES_PER_TRANSITION
    ) {
      nextPhase = "standing"

      if (hasPassedBottom && timestampMs - lastRepCompletedAt >= MIN_MS_BETWEEN_REPS) {
        repCount += 1
        lastRepCompletedAt = timestampMs

        lastCompletedRep = {
          repNumber: repCount,
          depth: classifyDepth(repMinKneeAngle),
          torso: classifyTorso(repMaxTorso),
          kneeTracking: classifyKneeTracking(repMaxKneeOffset),
          minKneeAngle: Math.round(repMinKneeAngle),
          descentMs,
        }
      }

      hasPassedBottom = false
    } else if (phase === "descending" && kneeAngle >= STANDING_KNEE_ANGLE) {
      // Aborted rep (stood back up without reaching bottom threshold) —
      // return to standing without counting anything.
      nextPhase = "standing"
      hasPassedBottom = false
    }

    if (nextPhase !== phase) {
      framesInState = 0
    }
    phase = nextPhase

    // Track this rep's worst values while it's in progress.
    if (phase === "descending" || phase === "bottom" || phase === "ascending") {
      repMinKneeAngle = Math.min(repMinKneeAngle, kneeAngle)
      repMaxTorso = Math.max(repMaxTorso, torsoInclinationDeg)
      repMaxKneeOffset = Math.max(repMaxKneeOffset, kneeTrackingOffset)
    }

    const currentRepDepth = classifyDepth(repMinKneeAngle)
    const currentRepTorso = classifyTorso(repMaxTorso)
    const currentRepKneeTracking = classifyKneeTracking(repMaxKneeOffset)

    const movement: SquatFrameResult["movement"] =
      phase === "ascending" || phase === "standing"
        ? descentMs > 0
          ? descentMs < 300
            ? "rushed"
            : "controlled"
          : "unknown"
        : "unknown"

    // ---- single, prioritized live cue ----

    let cue: SquatFrameResult["cue"] = null

    if (phase !== "standing") {
      if (currentRepKneeTracking === "poor" || currentRepKneeTracking === "watch") {
        cue = {
          message: "Keep your knee aligned with your foot during the descent.",
          severity: "watch",
        }
      } else if (currentRepTorso === "poor") {
        cue = { message: "Keep your chest up — you're leaning too far forward.", severity: "watch" }
      } else if (currentRepTorso === "watch") {
        cue = { message: "Try to keep your torso a little more upright.", severity: "watch" }
      } else if (phase === "bottom" && currentRepDepth === "poor") {
        cue = { message: "Try to reach a bit more depth if it's comfortable for you.", severity: "info" }
      } else if (movement === "rushed") {
        cue = { message: "Slow the descent down for more control.", severity: "watch" }
      } else {
        cue = { message: "Good control — keep going.", severity: "good" }
      }
    } else if (lastCompletedRep) {
      cue = {
        message:
          lastCompletedRep.depth === "good" &&
          lastCompletedRep.torso === "good" &&
          lastCompletedRep.kneeTracking === "good"
            ? "Solid rep."
            : "Reset, then begin your next rep.",
        severity: lastCompletedRep.depth === "poor" ? "watch" : "info",
      }
    }

    return {
      visibility,
      phase,
      repCount,
      hipAngle: Math.round(hipAngle),
      kneeAngle: Math.round(kneeAngle),
      torsoInclinationDeg: Math.round(torsoInclinationDeg),
      kneeTrackingOffset: Math.round(kneeTrackingOffset * 100) / 100,
      currentRepDepth,
      currentRepTorso,
      currentRepKneeTracking,
      movement,
      cue,
      lastCompletedRep,
    }
  }

  return { processFrame, reset }
}

export type SquatAnalyzer = ReturnType<typeof createSquatAnalyzer>
