import type { Pose, PoseDetector } from "@tensorflow-models/pose-detection";

import { loadMultiPoseDetector, loadPoseDetector } from "@/lib/ai";
import type { DetectedPerson, PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";
import { credible } from "@/lib/setvision/person-check";

/**
 * Extracts pose frames from an already-loaded <video> element by
 * seeking through it at a fixed sample interval and running the same
 * MoveNet detector already used by the live Form Coach camera
 * (lib/ai.ts::loadPoseDetector — client-side only, singleton-cached).
 *
 * Seeking (rather than real-time playback) means an uploaded video is
 * analyzed as fast as the browser can seek+infer, not limited to
 * real-time playback speed, and sample density is independent of the
 * source video's own frame rate.
 */

export type CollectProgress = {
  processedMs: number;
  totalMs: number;
};

const DEFAULT_SAMPLE_INTERVAL_MS = 100; // 10 samples/sec

function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - timeSec) < 0.001) {
      resolve();
      return;
    }

    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = timeSec;
  });
}

export async function collectPoseFrames(
  video: HTMLVideoElement,
  options: {
    sampleIntervalMs?: number;
    onProgress?: (progress: CollectProgress) => void;
    onFrame?: (frame: PoseFrame, timestampMs: number) => void;
  } = {},
): Promise<TimedPoseFrame[]> {
  const sampleIntervalMs = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const detector = await loadPoseDetector();
  // Person check (lib/setvision/person-check.ts). A load failure is recorded as
  // `people: null` on every frame, which refuses the clip — never "nobody else there".
  const multi = await loadMultiPoseDetector().catch(() => null);
  const scene = sceneMeter();

  const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
  const frames: TimedPoseFrame[] = [];

  for (let t = 0; t <= durationMs; t += sampleIntervalMs) {
    await seekTo(video, t / 1000);

    const poses = await detector.estimatePoses(video, { flipHorizontal: false });
    const pose = poses[0];

    const frame: PoseFrame = {};

    if (pose) {
      for (const keypoint of pose.keypoints) {
        if (!keypoint.name) continue;
        frame[keypoint.name] = {
          x: keypoint.x,
          y: keypoint.y,
          score: keypoint.score ?? 0,
        };
      }
    }

    frames.push({ timestampMs: t, frame, people: await detectPeople(multi, video, t), scene: scene(video) });
    options.onFrame?.(frame, t);
    options.onProgress?.({ processedMs: t, totalMs: durationMs });
  }

  multi?.dispose();
  return frames;
}

async function detectPeople(multi: PoseDetector | null, video: HTMLVideoElement, t: number): Promise<DetectedPerson[] | null> {
  return (await multiPoses(multi, video, t))?.map(toPerson) ?? null;
}

async function multiPoses(multi: PoseDetector | null, video: HTMLVideoElement, t: number): Promise<Pose[] | null> {
  if (!multi) return null;
  try {
    // Explicit timestamp: frames come from seeking, so the tracker must see video time, not wall time.
    return await multi.estimatePoses(video, { flipHorizontal: false }, t);
  } catch {
    return null;
  }
}

/** Scene-cut sampler: 64×36 grey thumbnail per sample → change vs the previous sample, brightness, and 1 s span change. */
function sceneMeter(): (video: HTMLVideoElement) => { diff: number | null; luma: number; span: number | null } | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 36;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  let previous: Float32Array | null = null;
  const history: Array<{ t: number; grey: Float32Array }> = [];
  return (video) => {
    if (!context) return undefined;
    context.drawImage(video, 0, 0, 64, 36);
    const rgba = context.getImageData(0, 0, 64, 36).data;
    const grey = new Float32Array(64 * 36);
    let luma = 0;
    let diff = 0;
    for (let i = 0; i < grey.length; i += 1) {
      grey[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
      luma += grey[i];
      if (previous) diff += Math.abs(grey[i] - previous[i]);
    }
    // The sample ~1 s back (scan and collector both sample on a fixed grid, so ≥ 950 ms back is ≈ 1 s).
    const t = video.currentTime * 1000;
    while (history.length > 1 && t - history[1].t >= 950) history.shift();
    const old = history.length && t - history[0].t >= 950 ? history[0].grey : null;
    let changed = 0;
    if (old) for (let i = 0; i < grey.length; i += 1) if (Math.abs(grey[i] - old[i]) > 30) changed += 1;
    history.push({ t, grey });
    const result = {
      diff: previous ? Math.round((diff / grey.length) * 10) / 10 : null,
      luma: Math.round(luma / grey.length),
      span: old ? Math.round((changed / grey.length) * 100) / 100 : null,
    };
    previous = grey;
    return result;
  };
}

/**
 * Subject scan for the AI visual review (no rep tracking): MultiPose + scene cuts at 5 Hz, giving
 * the same TimedPoseFrame shape the tracked path produces, so both go through ONE subjectGate.
 * `frame` holds the single credible person's keypoints (empty when there isn't exactly one).
 */
export async function scanSubject(video: HTMLVideoElement, onProgress?: (progress: CollectProgress) => void): Promise<TimedPoseFrame[]> {
  const multi = await loadMultiPoseDetector().catch(() => null);
  const scene = sceneMeter();
  const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
  const frames: TimedPoseFrame[] = [];
  for (let t = 0; t <= durationMs; t += 200) {
    await seekTo(video, t / 1000);
    const poses = await multiPoses(multi, video, t);
    const people = poses?.map(toPerson) ?? null;
    const credibleIdx = people ? people.flatMap((p, i) => (credible(p) ? [i] : [])) : [];
    const frame: PoseFrame = {};
    if (poses && credibleIdx.length === 1) {
      for (const k of poses[credibleIdx[0]].keypoints) if (k.name) frame[k.name] = { x: k.x, y: k.y, score: k.score ?? 0 };
    }
    frames.push({ timestampMs: t, frame, people, scene: scene(video) });
    onProgress?.({ processedMs: t, totalMs: durationMs });
  }
  multi?.dispose();
  return frames;
}

function toPerson(pose: Pose): DetectedPerson {
  const seen = pose.keypoints.filter((k) => (k.score ?? 0) >= 0.3);
  return {
    id: pose.id ?? null,
    score: Math.round((pose.score ?? 0) * 100) / 100,
    visible: seen.length,
    cx: seen.length ? Math.round(seen.reduce((s, k) => s + k.x, 0) / seen.length) : 0,
    cy: seen.length ? Math.round(seen.reduce((s, k) => s + k.y, 0) / seen.length) : 0,
  };
}

/**
 * Evenly spaced JPEG stills (longest side ≤ 512 px) for the AI visual review —
 * one per second of video, 6–12 in all, from 3 % to 97 % of the clip so the
 * first and last frames aren't a black intro/outro.
 * ponytail: even spacing, so a fast set longer than ~12 s is sampled sparsely; pick frames at tracked rep bottoms if that matters.
 */
export async function sampleStills(video: HTMLVideoElement): Promise<Array<{ tMs: number; image: string }>> {
  const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
  const count = Math.min(12, Math.max(6, Math.round(durationMs / 1000)));
  const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context || durationMs <= 0 || canvas.width === 0) throw new Error("Video has no readable picture.");

  const stills: Array<{ tMs: number; image: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const tMs = Math.round(durationMs * (0.03 + (0.94 * i) / (count - 1)));
    await seekTo(video, tMs / 1000);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stills.push({ tMs, image: canvas.toDataURL("image/jpeg", 0.75) });
  }
  return stills;
}
