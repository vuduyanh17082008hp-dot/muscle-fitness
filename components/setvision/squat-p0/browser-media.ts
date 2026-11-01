import type { PoseLandmarker, PoseLandmarkerResult } from "@mediapipe/tasks-vision";

import { SQUAT_P0 } from "@/lib/setvision/squat-p0";
import type { JointName, PoseObservation, Side } from "@/lib/setvision/squat-p0";

/**
 * Browser-only glue for SetVision P0: decoding probe, seeking, and the
 * MediaPipe Pose Landmarker. Nothing here interprets movement.
 *
 * @mediapipe/tasks-vision is resolved from node_modules at 0.10.17 (pinned
 * transitively by @react-three/drei; not yet a direct dependency — see
 * docs/setvision.md P0). The WASM runtime must match the JS bundle version
 * exactly, so the CDN path is pinned to the same version. Only the runtime
 * and model are downloaded; no video frame or landmark leaves the device.
 */
const TASKS_VISION_VERSION = "0.10.17";
export const MEDIAPIPE_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
export const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

/** BlazePose 33-landmark indices (person's own left/right). */
const INDEX: Record<Side, Record<JointName, number>> = {
  left: { shoulder: 11, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, hip: 24, knee: 26, ankle: 28 },
};

export async function createPoseLandmarker(): Promise<{ landmarker: PoseLandmarker; delegate: "GPU" | "CPU" }> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_BASE);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: "VIDEO" as const,
    // 2, not 1: a second detected person must be visible to the quality gate, never silently dropped.
    numPoses: 2,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
  try {
    return { landmarker: await PoseLandmarker.createFromOptions(fileset, options("GPU")), delegate: "GPU" };
  } catch {
    return { landmarker: await PoseLandmarker.createFromOptions(fileset, options("CPU")), delegate: "CPU" };
  }
}

export function toObservationParts(
  result: PoseLandmarkerResult,
  frameWidth: number,
  frameHeight: number,
): Omit<PoseObservation, "timestampMs" | "timestampSource"> {
  const poseCount = result.landmarks.length;
  if (poseCount !== 1) return { frameWidth, frameHeight, poseCount, landmarks: null };
  const pose = result.landmarks[0];
  const pick = (side: Side) =>
    Object.fromEntries(
      (Object.keys(INDEX[side]) as JointName[]).map((j) => {
        const p = pose[INDEX[side][j]];
        return [j, { x: p.x, y: p.y, visibility: p.visibility ?? 0 }];
      }),
    ) as Record<JointName, { x: number; y: number; visibility: number }>;
  return { frameWidth, frameHeight, poseCount, landmarks: { left: pick("left"), right: pick("right") } };
}

function once(el: HTMLMediaElement, events: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      events.forEach((e) => el.removeEventListener(e, handler));
      el.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const handler = (e: Event) => {
      cleanup();
      resolve(e.type);
    };
    const onError = () => {
      cleanup();
      reject(new Error("decode_error"));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("decode_timeout"));
    }, timeoutMs);
    events.forEach((e) => el.addEventListener(e, handler));
    el.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort);
  });
}

/** Detached <video> that must actually decode a first frame before analysis starts. */
export async function openDecodedVideo(url: string, signal?: AbortSignal) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, ["loadeddata"], 10_000, signal);
  } catch (error) {
    releaseVideo(video);
    throw error;
  }
  return {
    video,
    meta: { durationSec: video.duration, width: video.videoWidth, height: video.videoHeight },
  };
}

/** Seek and resolve with the media time (ms) the decoder settled on. */
export async function seekVideo(video: HTMLVideoElement, ms: number, signal?: AbortSignal): Promise<number> {
  const target = ms / 1000;
  if (Math.abs(video.currentTime - target) > 0.0005 || video.readyState < 2) {
    const settled = once(video, ["seeked"], SQUAT_P0.seekTimeoutMs, signal);
    video.currentTime = target;
    await settled;
  }
  return video.currentTime * 1000;
}

export function releaseVideo(video: HTMLVideoElement) {
  video.removeAttribute("src");
  video.load();
}

/** Yield a macrotask so input and paint run between inferences. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
