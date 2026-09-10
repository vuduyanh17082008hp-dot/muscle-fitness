"use client"

import { useEffect, useRef } from "react"

import type { PoseFrame } from "@/lib/form-coach/types"

const SKELETON_EDGES: Array<[string, string]> = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
]

const MIN_DRAW_SCORE = 0.35

type PoseOverlayCanvasProps = {
  frame: PoseFrame | null
  videoWidth: number
  videoHeight: number
  className?: string
}

export function PoseOverlayCanvas({
  frame,
  videoWidth,
  videoHeight,
  className,
}: PoseOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !videoWidth || !videoHeight) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { clientWidth, clientHeight } = canvas
    if (canvas.width !== clientWidth) canvas.width = clientWidth
    if (canvas.height !== clientHeight) canvas.height = clientHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!frame) return

    const scaleX = canvas.width / videoWidth
    const scaleY = canvas.height / videoHeight

    ctx.lineWidth = 3
    ctx.strokeStyle = "rgba(251,191,36,0.85)"

    for (const [fromName, toName] of SKELETON_EDGES) {
      const from = frame[fromName]
      const to = frame[toName]

      if (!from || !to || from.score < MIN_DRAW_SCORE || to.score < MIN_DRAW_SCORE) {
        continue
      }

      ctx.beginPath()
      ctx.moveTo(from.x * scaleX, from.y * scaleY)
      ctx.lineTo(to.x * scaleX, to.y * scaleY)
      ctx.stroke()
    }

    for (const point of Object.values(frame)) {
      if (!point || point.score < MIN_DRAW_SCORE) continue

      ctx.beginPath()
      ctx.arc(point.x * scaleX, point.y * scaleY, 5, 0, Math.PI * 2)
      ctx.fillStyle =
        point.score > 0.65 ? "rgba(251,191,36,1)" : "rgba(251,191,36,0.5)"
      ctx.fill()
    }
  }, [frame, videoWidth, videoHeight])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
    />
  )
}
