import type { Landmark, PoseFrame, VisibilityResult } from "@/lib/form-coach/types"

export const MIN_LANDMARK_SCORE = 0.4

/** Angle (degrees, 0–180) at point B formed by rays B→A and B→C. */
export function angleAt(a: Landmark, b: Landmark, c: Landmark): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)

  let angle = Math.abs((radians * 180) / Math.PI)
  if (angle > 180) angle = 360 - angle

  return angle
}

/** Angle (degrees) of the line A→B from vertical (0 = perfectly upright). */
export function inclinationFromVertical(a: Landmark, b: Landmark): number {
  const dx = b.x - a.x
  const dy = b.y - a.y

  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI)
}

export function getPoint(frame: PoseFrame, name: string): Landmark | null {
  const point = frame[name]
  if (!point) return null
  return point
}

/**
 * Prefers whichever side (left/right) is more visible this frame, so the
 * analyzer keeps working when the camera angle only shows one side
 * clearly — real-world webcam framing rarely shows both sides equally.
 */
export function getBestSide(
  frame: PoseFrame,
  baseName: string,
): Landmark | null {
  const left = getPoint(frame, `left_${baseName}`)
  const right = getPoint(frame, `right_${baseName}`)

  if (left && right) {
    return left.score >= right.score ? left : right
  }

  return left ?? right ?? null
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    score: Math.min(a.score, b.score),
  }
}

export function checkVisibility(
  points: Array<Landmark | null>,
  minScore = MIN_LANDMARK_SCORE,
): VisibilityResult {
  if (points.some((point) => point === null)) {
    return {
      ok: false,
      message: "Move back so your full body is visible.",
    }
  }

  const worst = Math.min(...points.map((point) => point!.score))

  if (worst < minScore) {
    return {
      ok: false,
      message: "Camera angle is not suitable for this analysis.",
    }
  }

  return { ok: true, message: null }
}
