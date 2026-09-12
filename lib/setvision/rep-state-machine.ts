import { checkVisibility } from "@/lib/form-coach/geometry";
import type { ExerciseConfig } from "@/lib/setvision/exercise-config";
import type {
  CompletedRep,
  Landmark,
  PoseFrame,
  RepPhase,
  RepStateMachineResult,
  TimedPoseFrame,
} from "@/lib/setvision/types";

/**
 * Generalized rep state machine (spec Part B §14).
 *
 * TOP -> DESCENT -> BOTTOM -> ASCENT -> TOP (+1 rep)
 *
 * This generalizes the same hysteresis approach already proven in
 * lib/form-coach/squat-analyzer.ts (moving-average angle smoothing +
 * a minimum-hold time per transition + a refractory period between
 * completed reps, so a single noisy frame cannot register a fake rep
 * or a fake phase change) — parameterized by ExerciseConfig instead
 * of being squat-specific, and using elapsed TIME rather than a
 * frame count for the transition hold, since this runs against
 * uploaded video that may be sampled at a different, non-live rate
 * than a webcam's requestAnimationFrame loop.
 */

const SMOOTHING_WINDOW = 3;
const MIN_TRANSITION_HOLD_MS = 60;
const MIN_MS_BETWEEN_REPS = 400;
const HYSTERESIS_DEG = 5;

export function createRepStateMachine(config: ExerciseConfig) {
  let phase: RepPhase = "top";
  let phaseEnteredAt = -Infinity;
  let repCount = 0;
  let lastRepCompletedAtMs = -Infinity;
  let hasPassedBottom = false;

  const angleBuffer: number[] = [];

  let repTopAtMs = 0;
  let repBottomAtMs = 0;
  let repAscentStartAtMs = 0;
  let repMinAngle = 180;
  let repMaxAngle = 0;
  let repBottomBarProxy: Landmark | null = null;
  let repBottomFrame: PoseFrame | null = null;
  let repBarProxyTrack: Array<{ timestampMs: number; landmark: Landmark }> = [];

  function smooth(value: number): number {
    angleBuffer.push(value);
    if (angleBuffer.length > SMOOTHING_WINDOW) angleBuffer.shift();
    return angleBuffer.reduce((sum, v) => sum + v, 0) / angleBuffer.length;
  }

  function reset() {
    phase = "top";
    phaseEnteredAt = -Infinity;
    repCount = 0;
    lastRepCompletedAtMs = -Infinity;
    hasPassedBottom = false;
    angleBuffer.length = 0;
    repTopAtMs = 0;
    repBottomAtMs = 0;
    repAscentStartAtMs = 0;
    repMinAngle = 180;
    repMaxAngle = 0;
    repBottomBarProxy = null;
    repBottomFrame = null;
    repBarProxyTrack = [];
  }

  function processFrame({ timestampMs, frame }: TimedPoseFrame): RepStateMachineResult {
    const requiredPoints = config.requiredLandmarks.map(
      (base) => frame[`left_${base}`] ?? frame[`right_${base}`] ?? null,
    );

    const visibility = checkVisibility(requiredPoints);

    if (!visibility.ok) {
      return { phase, repCount, lastCompletedRep: null, visible: false };
    }

    const rawAngle = config.primaryAngleDeg(frame);

    if (rawAngle === null) {
      return { phase, repCount, lastCompletedRep: null, visible: false };
    }

    const angle = smooth(rawAngle);
    const barProxy = config.barProxy(frame);

    const timeInPhase = timestampMs - phaseEnteredAt;

    let nextPhase = phase;
    let completedRep: CompletedRep | null = null;

    if (phase === "top" && angle < config.topAngleThresholdDeg - HYSTERESIS_DEG) {
      nextPhase = "descent";
      repTopAtMs = timestampMs;
      repMinAngle = angle;
      repMaxAngle = angle;
      repBottomBarProxy = null;
      repBottomFrame = null;
      repBarProxyTrack = [];
      hasPassedBottom = false;
    } else if (
      phase === "descent" &&
      angle <= config.bottomAngleThresholdDeg &&
      timeInPhase >= MIN_TRANSITION_HOLD_MS
    ) {
      nextPhase = "bottom";
      hasPassedBottom = true;
      repBottomAtMs = timestampMs;
      if (barProxy) repBottomBarProxy = barProxy;
      repBottomFrame = frame;
    } else if (
      phase === "bottom" &&
      angle > config.bottomAngleThresholdDeg + HYSTERESIS_DEG &&
      timeInPhase >= MIN_TRANSITION_HOLD_MS
    ) {
      nextPhase = "ascent";
      repAscentStartAtMs = timestampMs;
    } else if (
      phase === "ascent" &&
      angle >= config.topAngleThresholdDeg &&
      timeInPhase >= MIN_TRANSITION_HOLD_MS
    ) {
      nextPhase = "top";

      if (hasPassedBottom && timestampMs - lastRepCompletedAtMs >= MIN_MS_BETWEEN_REPS) {
        repCount += 1;
        lastRepCompletedAtMs = timestampMs;

        completedRep = {
          repNumber: repCount,
          topAtMs: repTopAtMs,
          bottomAtMs: repBottomAtMs,
          ascentStartAtMs: repAscentStartAtMs,
          ascentEndAtMs: timestampMs,
          minAngleDeg: repMinAngle,
          maxAngleDeg: repMaxAngle,
          bottomBarProxy: repBottomBarProxy,
          bottomFrame: repBottomFrame,
          barProxyTrack: repBarProxyTrack,
        };
      }

      hasPassedBottom = false;
    } else if (phase === "descent" && angle >= config.topAngleThresholdDeg) {
      // Aborted rep — stood back up (or locked back out) without
      // reaching bottom. Return to top without counting anything.
      nextPhase = "top";
      hasPassedBottom = false;
    }

    if (nextPhase !== phase) {
      phaseEnteredAt = timestampMs;
    }

    phase = nextPhase;

    if (phase === "descent" || phase === "bottom" || phase === "ascent") {
      repMinAngle = Math.min(repMinAngle, angle);
      repMaxAngle = Math.max(repMaxAngle, angle);

      if (barProxy) {
        repBarProxyTrack.push({ timestampMs, landmark: barProxy });
      }
    }

    return { phase, repCount, lastCompletedRep: completedRep, visible: true };
  }

  return { processFrame, reset };
}

export type RepStateMachine = ReturnType<typeof createRepStateMachine>;
