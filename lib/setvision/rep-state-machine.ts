import type { ExerciseConfig } from "@/lib/setvision/exercise-config";
import type {
  CompletedRep,
  Landmark,
  MovementEvent,
  PoseFrame,
  RepPhase,
  RepStateMachineResult,
  TimedPoseFrame,
} from "@/lib/setvision/types";

/** What the machine needs from an engine config (exercise-config.ts). */
export type RepMachineConfig = Pick<ExerciseConfig, "primaryAngleDeg" | "topAngleThresholdDeg" | "bottomAngleThresholdDeg" | "barProxy"> & {
  /** Which end of the angle range is the rest position; default "high" (the original squat orientation). */
  rest?: "high" | "low";
};

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
 *
 * "top" is the REST position and "bottom" the working end. For an engine
 * whose rest is the low end of its angle (overhead press in the rack,
 * lateral raise with the arms down) the angle is negated internally, so the
 * same transitions and hysteresis apply; reps report raw angles.
 */

const SMOOTHING_WINDOW = 3;
const MIN_TRANSITION_HOLD_MS = 60;
const MIN_MS_BETWEEN_REPS = 400;
const HYSTERESIS_DEG = 5;
/**
 * A rep that leaves the rest position and comes back without reaching the
 * working end is reported as a partial movement only when it travelled at
 * least this share of the way between the two thresholds — smaller dips are
 * treated as noise, not as attempted reps.
 */
const PARTIAL_MIN_FRACTION = 0.4;
/**
 * A gap between clearly tracked frames longer than this means the
 * movement in between was not observed: any rep in progress is dropped
 * (never stitched across the gap) and the machine re-arms only once
 * the lifter is seen at the top or bottom position again.
 */
export const MAX_TRACKING_GAP_MS = 1000;

export function createRepStateMachine(config: RepMachineConfig) {
  const sign = config.rest === "low" ? -1 : 1;
  const topThreshold = sign * config.topAngleThresholdDeg;
  const bottomThreshold = sign * config.bottomAngleThresholdDeg;
  const partialDepth = topThreshold - PARTIAL_MIN_FRACTION * (topThreshold - bottomThreshold);
  const events: MovementEvent[] = [];

  let phase: RepPhase = "top";
  let phaseEnteredAt = -Infinity;
  let repCount = 0;
  let lastRepCompletedAtMs = -Infinity;
  let hasPassedBottom = false;
  /** False until the lifter has been seen clearly at the top (or bottom) — i.e. at clip start and after tracking loss. */
  let armed = false;
  /** Whether the current rep's descent was actually observed from the top. */
  let repStartObserved = true;
  let lastVisibleAtMs = -Infinity;
  let droppedReps = 0;

  const angleBuffer: number[] = [];

  let repTopAtMs = 0;
  let repBottomAtMs = 0;
  let repAscentStartAtMs = 0;
  let repMinAngle = 180;
  let repMaxAngle = 0;
  let repBottomBarProxy: Landmark | null = null;
  let repBottomFrame: PoseFrame | null = null;
  let repDeepestFrame: PoseFrame | null = null;
  /** Highest angle seen while standing/locked out before the current rep — its true top, for the joint range. */
  let topPeakAngle = -Infinity;
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
    armed = false;
    repStartObserved = true;
    lastVisibleAtMs = -Infinity;
    droppedReps = 0;
    events.length = 0;
    angleBuffer.length = 0;
    repTopAtMs = 0;
    repBottomAtMs = 0;
    repAscentStartAtMs = 0;
    repMinAngle = 180;
    repMaxAngle = 0;
    repBottomBarProxy = null;
    repBottomFrame = null;
    repDeepestFrame = null;
    topPeakAngle = -Infinity;
    repBarProxyTrack = [];
  }

  function beginRep(timestampMs: number, angle: number, frame: PoseFrame) {
    repTopAtMs = timestampMs;
    repMinAngle = angle;
    repMaxAngle = Math.max(angle, topPeakAngle);
    topPeakAngle = -Infinity;
    repBottomBarProxy = null;
    repBottomFrame = null;
    repDeepestFrame = frame;
    repBarProxyTrack = [];
    hasPassedBottom = false;
  }

  function processFrame({ timestampMs, frame }: TimedPoseFrame): RepStateMachineResult {
    // primaryAngleDeg is null unless one body side's joints are all
    // clearly tracked (exercise-config.ts::sameSidePoints).
    const measured = config.primaryAngleDeg(frame);

    if (measured === null) {
      return { phase, repCount, lastCompletedRep: null, visible: false };
    }
    const rawAngle = sign * measured;

    if (timestampMs - lastVisibleAtMs > MAX_TRACKING_GAP_MS && lastVisibleAtMs > -Infinity) {
      if (phase !== "top") {
        droppedReps += 1;
        events.push({ kind: "uncertain", startMs: repTopAtMs, endMs: lastVisibleAtMs });
      }
      phase = "top";
      phaseEnteredAt = timestampMs;
      hasPassedBottom = false;
      armed = false;
      angleBuffer.length = 0;
      topPeakAngle = -Infinity;
    }
    lastVisibleAtMs = timestampMs;

    const angle = smooth(rawAngle);
    const barProxy = config.barProxy ? config.barProxy(frame) : null;

    if (!armed) {
      // Clip start or resumed tracking: only a clearly observed top or
      // bottom position is a trustworthy place to start counting from.
      if (angle >= topThreshold) {
        armed = true;
        repStartObserved = true;
        phase = "top";
        phaseEnteredAt = timestampMs;
      } else if (angle <= bottomThreshold) {
        // Already at the bottom (e.g. a deadlift set starting from the
        // floor, or a clip cut mid-rep): the ascent can still be
        // observed, but this rep's descent and hold were not.
        armed = true;
        repStartObserved = false;
        beginRep(timestampMs, angle, frame);
        hasPassedBottom = true;
        repBottomAtMs = timestampMs;
        if (barProxy) repBottomBarProxy = barProxy;
        repBottomFrame = frame;
        phase = "bottom";
        phaseEnteredAt = timestampMs;
      }
      return { phase, repCount, lastCompletedRep: null, visible: true };
    }

    const timeInPhase = timestampMs - phaseEnteredAt;

    let nextPhase = phase;
    let completedRep: CompletedRep | null = null;

    if (phase === "top" && angle < topThreshold - HYSTERESIS_DEG) {
      nextPhase = "descent";
      repStartObserved = true;
      beginRep(timestampMs, angle, frame);
    } else if (
      phase === "descent" &&
      angle <= bottomThreshold &&
      timeInPhase >= MIN_TRANSITION_HOLD_MS
    ) {
      nextPhase = "bottom";
      hasPassedBottom = true;
      repBottomAtMs = timestampMs;
      if (barProxy) repBottomBarProxy = barProxy;
      repBottomFrame = frame;
    } else if (
      phase === "bottom" &&
      angle > bottomThreshold + HYSTERESIS_DEG &&
      timeInPhase >= MIN_TRANSITION_HOLD_MS
    ) {
      nextPhase = "ascent";
      repAscentStartAtMs = timestampMs;
    } else if (
      phase === "ascent" &&
      angle <= bottomThreshold &&
      timeInPhase >= MIN_TRANSITION_HOLD_MS
    ) {
      // Sank back into the hole (a wobble during a long bottom hold):
      // still the same hold — the concentric clock restarts on the real
      // drive up instead of absorbing the rest of the pause.
      nextPhase = "bottom";
    } else if (
      phase === "ascent" &&
      angle >= topThreshold &&
      timeInPhase >= MIN_TRANSITION_HOLD_MS
    ) {
      nextPhase = "top";
      repMaxAngle = Math.max(repMaxAngle, angle);

      if (hasPassedBottom && timestampMs - lastRepCompletedAtMs >= MIN_MS_BETWEEN_REPS) {
        repCount += 1;
        lastRepCompletedAtMs = timestampMs;

        completedRep = {
          repNumber: repCount,
          topAtMs: repTopAtMs,
          startObserved: repStartObserved,
          bottomAtMs: repBottomAtMs,
          ascentStartAtMs: repAscentStartAtMs,
          ascentEndAtMs: timestampMs,
          // Raw angles: for a rest-low engine the oriented min is the raw max.
          minAngleDeg: sign === 1 ? repMinAngle : -repMaxAngle,
          maxAngleDeg: sign === 1 ? repMaxAngle : -repMinAngle,
          bottomBarProxy: repBottomBarProxy,
          bottomFrame: repBottomFrame,
          deepestFrame: repDeepestFrame,
          barProxyTrack: repBarProxyTrack,
        };
      }

      hasPassedBottom = false;
    } else if (phase === "descent" && angle >= topThreshold) {
      // Aborted rep — stood back up (or locked back out) without
      // reaching bottom. Return to top without counting it; a real attempt
      // (not a small dip) is reported as a partial movement.
      nextPhase = "top";
      hasPassedBottom = false;
      if (repMinAngle <= partialDepth) events.push({ kind: "partial", startMs: repTopAtMs, endMs: timestampMs });
    }

    if (nextPhase !== phase) {
      phaseEnteredAt = timestampMs;
    }

    phase = nextPhase;

    if (phase === "top") {
      topPeakAngle = Math.max(topPeakAngle, angle);
    } else {
      if (angle < repMinAngle) repDeepestFrame = frame;
      repMinAngle = Math.min(repMinAngle, angle);
      repMaxAngle = Math.max(repMaxAngle, angle);

      if (barProxy) {
        repBarProxyTrack.push({ timestampMs, landmark: barProxy });
      }
    }

    return { phase, repCount, lastCompletedRep: completedRep, visible: true };
  }

  /** In-progress reps discarded because tracking was lost mid-rep. */
  const getDroppedReps = () => droppedReps;
  /** Partial and tracking-lost movements so far, plus the in-progress one when `endMs` (the clip end) is given. */
  const getEvents = (endMs?: number): MovementEvent[] =>
    endMs !== undefined && armed && phase !== "top" ? [...events, { kind: "uncertain", startMs: repTopAtMs, endMs }] : [...events];

  return { processFrame, reset, getDroppedReps, getEvents };
}

export type RepStateMachine = ReturnType<typeof createRepStateMachine>;
