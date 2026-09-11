/**
 * Deterministic push-up analyzer. Same hysteresis approach as the
 * squat analyzer — see lib/form-coach/squat-analyzer.ts for the
 * rationale.
 *
 *   UP -> DESCENDING -> DOWN -> ASCENDING -> UP (+1 rep)
 */

import { angleAt, checkVisibility, getBestSide } from "@/lib/form-coach/geometry"
import type {
  PoseFrame,
  PushupFrameResult,
  PushupPhase,
  PushupRepQuality,
  Quality,
} from "@/lib/form-coach/types"

const UP_ELBOW_ANGLE = 155
const DOWN_ELBOW_ANGLE = 95
const MIN_FRAMES_PER_TRANSITION = 2
const MIN_MS_BETWEEN_REPS = 500
const SMOOTHING_WINDOW = 3

function classifyDepth(minElbowAngle: number): Quality {
  if (minElbowAngle <= 95) return "good"
  if (minElbowAngle <= 115) return "watch"
  return "poor"
}

function classifyBodyLine(maxDeviationDeg: number): Quality {
  if (maxDeviationDeg <= 15) return "good"
  if (maxDeviationDeg <= 30) return "watch"
  return "poor"
}

export function createPushupAnalyzer() {
  let phase: PushupPhase = "up"
  let framesInState = 0
  let repCount = 0
  let lastRepCompletedAt = -Infinity
  let hasPassedDown = false

  const elbowAngleBuffer: number[] = []

  let repMinElbowAngle = 180
  let repMaxBodyLineDeviation = 0
  let lastCompletedRep: PushupRepQuality | null = null

  function smooth(value: number): number {
    elbowAngleBuffer.push(value)
    if (elbowAngleBuffer.length > SMOOTHING_WINDOW) elbowAngleBuffer.shift()
    return elbowAngleBuffer.reduce((sum, v) => sum + v, 0) / elbowAngleBuffer.length
  }

  function reset() {
    phase = "up"
    framesInState = 0
    repCount = 0
    lastRepCompletedAt = -Infinity
    hasPassedDown = false
    elbowAngleBuffer.length = 0
    repMinElbowAngle = 180
    repMaxBodyLineDeviation = 0
    lastCompletedRep = null
  }

  function processFrame(frame: PoseFrame, timestampMs: number): PushupFrameResult {
    const shoulder = getBestSide(frame, "shoulder")
    const elbow = getBestSide(frame, "elbow")
    const wrist = getBestSide(frame, "wrist")
    const hip = getBestSide(frame, "hip")
    const ankle = getBestSide(frame, "ankle")

    const visibility = checkVisibility([shoulder, elbow, wrist, hip, ankle])

    if (!visibility.ok || !shoulder || !elbow || !wrist || !hip || !ankle) {
      return {
        visibility,
        phase,
        repCount,
        elbowAngle: null,
        bodyLineAngleDeg: null,
        currentRepDepth: "unknown",
        currentRepBodyLine: "unknown",
        cue: null,
        lastCompletedRep,
      }
    }

    const rawElbowAngle = angleAt(shoulder, elbow, wrist)
    const elbowAngle = smooth(rawElbowAngle)
    const bodyLineAngle = angleAt(shoulder, hip, ankle)
    const bodyLineDeviation = Math.abs(180 - bodyLineAngle)

    let nextPhase = phase
    framesInState += 1

    if (phase === "up" && elbowAngle < UP_ELBOW_ANGLE - 5) {
      nextPhase = "descending"
      repMinElbowAngle = elbowAngle
      repMaxBodyLineDeviation = bodyLineDeviation
      hasPassedDown = false
    } else if (
      phase === "descending" &&
      elbowAngle <= DOWN_ELBOW_ANGLE &&
      framesInState >= MIN_FRAMES_PER_TRANSITION
    ) {
      nextPhase = "down"
      hasPassedDown = true
    } else if (
      phase === "down" &&
      elbowAngle > DOWN_ELBOW_ANGLE + 5 &&
      framesInState >= MIN_FRAMES_PER_TRANSITION
    ) {
      nextPhase = "ascending"
    } else if (
      phase === "ascending" &&
      elbowAngle >= UP_ELBOW_ANGLE &&
      framesInState >= MIN_FRAMES_PER_TRANSITION
    ) {
      nextPhase = "up"

      if (hasPassedDown && timestampMs - lastRepCompletedAt >= MIN_MS_BETWEEN_REPS) {
        repCount += 1
        lastRepCompletedAt = timestampMs

        lastCompletedRep = {
          repNumber: repCount,
          depth: classifyDepth(repMinElbowAngle),
          bodyLine: classifyBodyLine(repMaxBodyLineDeviation),
          minElbowAngle: Math.round(repMinElbowAngle),
        }
      }

      hasPassedDown = false
    } else if (phase === "descending" && elbowAngle >= UP_ELBOW_ANGLE) {
      nextPhase = "up"
      hasPassedDown = false
    }

    if (nextPhase !== phase) framesInState = 0
    phase = nextPhase

    if (phase === "descending" || phase === "down" || phase === "ascending") {
      repMinElbowAngle = Math.min(repMinElbowAngle, elbowAngle)
      repMaxBodyLineDeviation = Math.max(repMaxBodyLineDeviation, bodyLineDeviation)
    }

    const currentRepDepth = classifyDepth(repMinElbowAngle)
    const currentRepBodyLine = classifyBodyLine(repMaxBodyLineDeviation)

    let cue: PushupFrameResult["cue"] = null

    if (phase !== "up") {
      if (currentRepBodyLine === "poor" || currentRepBodyLine === "watch") {
        cue = {
          message:
            bodyLineAngle < 180
              ? "Brace your core — your hips are sagging."
              : "Lower your hips slightly to keep a straight line.",
          severity: "watch",
        }
      } else if (phase === "down" && currentRepDepth === "poor") {
        cue = { message: "Lower a little further if you can control it.", severity: "info" }
      } else {
        cue = { message: "Good line — keep going.", severity: "good" }
      }
    } else if (lastCompletedRep) {
      cue = {
        message:
          lastCompletedRep.bodyLine === "good" && lastCompletedRep.depth === "good"
            ? "Solid rep."
            : "Reset your plank position before the next rep.",
        severity: lastCompletedRep.bodyLine === "poor" ? "watch" : "info",
      }
    }

    return {
      visibility,
      phase,
      repCount,
      elbowAngle: Math.round(elbowAngle),
      bodyLineAngleDeg: Math.round(bodyLineAngle),
      currentRepDepth,
      currentRepBodyLine,
      cue,
      lastCompletedRep,
    }
  }

  return { processFrame, reset }
}

export type PushupAnalyzer = ReturnType<typeof createPushupAnalyzer>
