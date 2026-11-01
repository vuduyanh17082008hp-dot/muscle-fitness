import { SQUAT_P0 } from "@/lib/setvision/squat-p0/config";
import type { PoseObservation } from "@/lib/setvision/squat-p0/types";

/* ---------------- file / media validation (before and after decoding) ---------------- */

const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"];

export type MediaRejection =
  | { code: "not_video"; message: string }
  | { code: "too_large"; message: string }
  | { code: "too_long"; message: string }
  | { code: "unknown_duration"; message: string }
  | { code: "undecodable"; message: string };

/** Cheap checks on the File itself — the decoder still has the final word (see validateDecodedMedia). */
export function validateVideoFile(file: { name: string; type: string; size: number }): MediaRejection | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!file.type.startsWith("video/") && !VIDEO_EXTENSIONS.includes(ext)) {
    return { code: "not_video", message: "That file is not a video. Choose an MP4, MOV or WebM clip." };
  }
  if (file.size > SQUAT_P0.maxFileBytes) {
    return {
      code: "too_large",
      message: `That video is ${Math.round(file.size / 1048576)} MB; the limit is ${SQUAT_P0.maxFileBytes / 1048576} MB.`,
    };
  }
  return null;
}

/** Checks on what the browser actually decoded. */
export function validateDecodedMedia(meta: { durationSec: number; width: number; height: number }): MediaRejection | null {
  if (!meta.width || !meta.height) {
    return { code: "undecodable", message: "This browser could not decode any picture from that video." };
  }
  if (!Number.isFinite(meta.durationSec) || meta.durationSec <= 0) {
    return {
      code: "unknown_duration",
      message: "This video does not report a duration, so its timestamps cannot be trusted. Re-save it as MP4 and try again.",
    };
  }
  if (meta.durationSec * 1000 > SQUAT_P0.maxDurationMs + SQUAT_P0.durationToleranceMs) {
    return {
      code: "too_long",
      message: `That video is ${meta.durationSec.toFixed(1)} s; the limit is ${SQUAT_P0.maxDurationMs / 1000} s. Trim it to one set.`,
    };
  }
  return null;
}

/* ---------------- bounded frame sampling ---------------- */

export class AnalysisCancelledError extends Error {
  constructor() {
    super("Analysis cancelled");
    this.name = "AnalysisCancelledError";
  }
}

export type SamplerDeps = {
  durationMs: number;
  /** Seek the decoder to `ms` (media time). Resolves with the media time actually reached. */
  seek: (ms: number) => Promise<number>;
  /** Run pose detection on the current frame; `timestampMs` must strictly increase. */
  detect: (timestampMs: number) => Omit<PoseObservation, "timestampMs" | "timestampSource">;
  signal?: AbortSignal;
  intervalMs?: number;
  onProgress?: (p: { done: number; total: number; lastInferenceMs: number }) => void;
  /** Lets the UI breathe between frames; injected so tests run without timers. */
  yieldToMain?: () => Promise<void>;
  now?: () => number;
};

export type SamplerStats = {
  frames: number;
  totalMs: number;
  meanInferenceMs: number;
  maxInferenceMs: number;
};

/**
 * One frame in flight at a time: seek → detect → record → yield. No queue,
 * memory is O(frames) of small landmark objects (≤ 301 for a 30 s clip).
 */
export async function sampleObservations(deps: SamplerDeps): Promise<{ observations: PoseObservation[]; stats: SamplerStats }> {
  const interval = deps.intervalMs ?? SQUAT_P0.sampleIntervalMs;
  const now = deps.now ?? (() => performance.now());
  const total = Math.floor(deps.durationMs / interval) + 1;
  const observations: PoseObservation[] = [];
  const started = now();
  let inferSum = 0;
  let inferMax = 0;
  let lastTs = -1;

  for (let i = 0; i < total; i += 1) {
    if (deps.signal?.aborted) throw new AnalysisCancelledError();
    const reached = await deps.seek(Math.min(i * interval, deps.durationMs));
    if (deps.signal?.aborted) throw new AnalysisCancelledError();

    // Media time of the decoded frame, rounded to whole ms; skip if the decoder did not advance.
    const ts = Math.round(reached);
    if (ts <= lastTs) continue;
    lastTs = ts;

    const t0 = now();
    const detected = deps.detect(ts);
    const inferMs = now() - t0;
    inferSum += inferMs;
    inferMax = Math.max(inferMax, inferMs);

    observations.push({ ...detected, timestampMs: ts, timestampSource: "seek" });
    deps.onProgress?.({ done: i + 1, total, lastInferenceMs: inferMs });
    if (deps.yieldToMain) await deps.yieldToMain();
  }

  return {
    observations,
    stats: {
      frames: observations.length,
      totalMs: now() - started,
      meanInferenceMs: observations.length ? inferSum / observations.length : 0,
      maxInferenceMs: inferMax,
    },
  };
}
