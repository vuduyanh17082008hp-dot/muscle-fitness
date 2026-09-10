/**
 * Deterministic plank analyzer — hold-based rather than rep-based.
 * Tracks body-line quality, accumulated hold time, and stability
 * (variance of hip height over a short rolling window).
 */

import { angleAt, checkVisibility, getBestSide } from "@/lib/form-coach/geometry"
import type { PlankFrameResult, PoseFrame, Quality } from "@/lib/form-coach/types"

const STABILITY_WINDOW = 15
const IN_PLANK_MAX_DEVIATION = 45

function classifyBodyLine(deviationDeg: number): Quality {
  if (deviationDeg <= 12) return "good"
  if (deviationDeg <= 25) return "watch"
  return "poor"
}

function classifyStability(varianceOfHipY: number): Quality {
  if (varianceOfHipY <= 0.0004) return "good"
  if (varianceOfHipY <= 0.0015) return "watch"
  return "poor"
}

export function createPlankAnalyzer() {
  let holdMs = 0
  let lastTimestampMs: number | null = null
  const hipYWindow: number[] = []

  function reset() {
    holdMs = 0
    lastTimestampMs = null
    hipYWindow.length = 0
  }

  function processFrame(frame: PoseFrame, timestampMs: number): PlankFrameResult {
    const shoulder = getBestSide(frame, "shoulder")
    const hip = getBestSide(frame, "hip")
    const ankle = getBestSide(frame, "ankle")

    const visibility = checkVisibility([shoulder, hip, ankle])

    if (!visibility.ok || !shoulder || !hip || !ankle) {
      lastTimestampMs = timestampMs
      return {
        visibility,
        bodyLineAngleDeg: null,
        bodyLine: "unknown",
        holdMs,
        stability: "unknown",
        cue: null,
      }
    }

    const bodyLineAngle = angleAt(shoulder, hip, ankle)
    const deviation = Math.abs(180 - bodyLineAngle)
    const bodyLine = classifyBodyLine(deviation)

    hipYWindow.push(hip.y)
    if (hipYWindow.length > STABILITY_WINDOW) hipYWindow.shift()

    const mean = hipYWindow.reduce((sum, v) => sum + v, 0) / hipYWindow.length
    const variance =
      hipYWindow.reduce((sum, v) => sum + (v - mean) ** 2, 0) / hipYWindow.length

    const stability =
      hipYWindow.length >= STABILITY_WINDOW ? classifyStability(variance) : "unknown"

    const inPlankPosition = deviation <= IN_PLANK_MAX_DEVIATION

    if (inPlankPosition && lastTimestampMs !== null) {
      holdMs += Math.max(0, timestampMs - lastTimestampMs)
    }
    lastTimestampMs = timestampMs

    let cue: PlankFrameResult["cue"] = null

    if (!inPlankPosition) {
      cue = { message: "Get into plank position — straight line from shoulders to ankles.", severity: "info" }
    } else if (bodyLine === "poor") {
      cue = {
        message: bodyLineAngle < 180 ? "Lift your hips — they're sagging." : "Lower your hips slightly.",
        severity: "watch",
      }
    } else if (bodyLine === "watch") {
      cue = { message: "Small hip adjustment — aim for a straighter line.", severity: "watch" }
    } else if (stability === "poor") {
      cue = { message: "Try to hold steadier — minimise shaking.", severity: "watch" }
    } else {
      cue = { message: "Strong, stable hold.", severity: "good" }
    }

    return {
      visibility,
      bodyLineAngleDeg: Math.round(bodyLineAngle),
      bodyLine,
      holdMs,
      stability,
      cue,
    }
  }

  return { processFrame, reset }
}

export type PlankAnalyzer = ReturnType<typeof createPlankAnalyzer>
