/** SetVision P0 public API — bodyweight squat, side view, uploaded clip ≤ 30 s. */
export { SQUAT_P0 } from "@/lib/setvision/squat-p0/config";
export { analyzeSquatObservations, applyCorrections } from "@/lib/setvision/squat-p0/analyze";
export { LIVE_P1A, assessReadiness, createFrameScheduler, createLiveSquatSession } from "@/lib/setvision/squat-p0/live";
export type {
  LiveInterruption,
  LivePhase,
  LiveSetResult,
  LiveSnapshot,
  LiveSquatSession,
  LiveTracking,
  Readiness,
  ReadinessIssue,
} from "@/lib/setvision/squat-p0/live";
export { createSquatRepCounter, smoothMedian3 } from "@/lib/setvision/squat-p0/rep-counter";
export {
  AnalysisCancelledError,
  sampleObservations,
  validateDecodedMedia,
  validateVideoFile,
} from "@/lib/setvision/squat-p0/extract";
export type { MediaRejection, SamplerDeps, SamplerStats } from "@/lib/setvision/squat-p0/extract";
export type * from "@/lib/setvision/squat-p0/types";
