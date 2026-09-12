import { loadPoseDetector } from "@/lib/ai";
import type { PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";

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

    frames.push({ timestampMs: t, frame });
    options.onFrame?.(frame, t);
    options.onProgress?.({ processedMs: t, totalMs: durationMs });
  }

  return frames;
}
