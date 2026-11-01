import { classifyExercise, estimateCameraView, handsAtOrBelowKnees } from "@/lib/setvision/exercise-classifier";
import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import { averageTorsoLength } from "@/lib/setvision/normalization";
import { createRepStateMachine } from "@/lib/setvision/rep-state-machine";
import { computeAllRepRom } from "@/lib/setvision/rom";
import { computeTechniqueConsistency } from "@/lib/setvision/technique-consistency";
import { averageConcentricTime, averageEccentricTime, computeAllRepTempo } from "@/lib/setvision/tempo";
import { computeVelocity } from "@/lib/setvision/velocity";
import type {
  CompletedRep,
  SetVisionAnalysis,
  SetVisionExerciseId,
  TimedPoseFrame,
} from "@/lib/setvision/types";

/**
 * analyzeWorkoutVideo() (spec Part B §21, §27's `setvision.analyzeWorkoutVideo()`).
 *
 * Input is already-extracted pose frames with timestamps — this
 * module has no opinion about WHERE those frames came from (a live
 * webcam loop or an uploaded video's <video> element run through the
 * exact same lib/ai.ts::loadPoseDetector() loop; see
 * components/setvision/video-analyzer.tsx for the uploaded-video
 * path). That separation keeps the algorithmic core testable with
 * plain synthetic data, with no DOM/video/TensorFlow dependency.
 */

const MIN_VISIBILITY_RATIO = 0.7;
/** First classification signal when the user picked the exercise — the UI keys off it to say so. */
export const MANUAL_SELECTION_SIGNAL = "Exercise was selected manually, not auto-detected.";
const MIN_REPS_FOR_RELIABLE_CONSISTENCY = 3;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function emptyAnalysis(
  exercise: SetVisionExerciseId,
  classification: SetVisionAnalysis["exerciseClassification"],
  limitations: string[],
): SetVisionAnalysis {
  return {
    exercise,
    exerciseClassification: classification,
    reps: 0,
    romConsistency: null,
    averageEccentricTime: null,
    averageConcentricTime: null,
    velocity: {
      calibrated: false,
      unit: "torso-lengths/s",
      perRep: [],
      mean: null,
      peak: null,
      final: null,
      velocityLoss: null,
    },
    technique: {
      romConsistency: null,
      tempoConsistency: null,
      barPathConsistency: null,
      asymmetryDeg: null,
    },
    confidence: 0,
    perRep: { rom: [], tempo: [] },
    limitations,
  };
}

/**
 * Movement-analysis quality from tracking evidence only. Deliberately has no
 * classification input: choosing (or confirming) an exercise resolves which
 * movement it is, it does not make the pose tracking any better.
 */
function deriveOverallConfidence(params: {
  visibilityRatio: number;
  repCount: number;
  hasTorsoLength: boolean;
}): number {
  let score = 0;
  let maxScore = 0;

  maxScore += 1;
  score += params.visibilityRatio;

  maxScore += 1;
  score += Math.min(1, params.repCount / MIN_REPS_FOR_RELIABLE_CONSISTENCY);

  maxScore += 1;
  score += params.hasTorsoLength ? 1 : 0;

  return round(score / maxScore, 2);
}

const secondsLabel = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Squat-depth pickup / put-down guard. Pose alone cannot tell picking a
 * dumbbell up from a squat rep: both bend the knees to depth. The one
 * difference it can see is the hands reaching the knees or lower at the
 * bottom. Such a rep is set aside ONLY as an outlier — when most reps with
 * clearly tracked hands kept them above the knees. When every rep is
 * hands-low (e.g. dumbbells held at the sides) nothing is dropped; the
 * count is flagged for the user to check instead, so genuine reps are
 * never suppressed wholesale.
 */
// ponytail: one deepest-frame check per rep; a per-rep hand-height trace is the upgrade if real clips disagree.
function excludePickupOutliers(reps: CompletedRep[], limitations: string[]): CompletedRep[] {
  const handsLow = reps.map((rep) => (rep.deepestFrame ? handsAtOrBelowKnees(rep.deepestFrame) : null));
  const known = handsLow.filter((v) => v !== null).length;
  const high = handsLow.filter((v) => v === false).length;
  const lowReps = reps.filter((_, i) => handsLow[i] === true);

  if (lowReps.length === 0) return reps;

  if (high > known / 2) {
    for (const rep of lowReps) {
      limitations.push(
        `A movement from ${secondsLabel(rep.topAtMs)} to ${secondsLabel(rep.ascentEndAtMs)} reached squat depth with the hands at or below the knees, unlike the other reps — it may be equipment being picked up or put down, so it was not counted.`,
      );
    }
    return reps.filter((_, i) => handsLow[i] !== true).map((rep, i) => ({ ...rep, repNumber: i + 1 }));
  }

  limitations.push(
    `The hands were at or below the knees at the bottom of ${lowReps.length} rep(s). From pose alone that cannot be told apart from picking something up or putting it down — check the rep count against the video.`,
  );
  return reps;
}

export function analyzeFrameSequence(
  frames: TimedPoseFrame[],
  options: {
    exercise?: SetVisionExerciseId | null;
    metersPerTorsoLength?: number | null;
  } = {},
): SetVisionAnalysis {
  const classification = options.exercise
    ? {
        exercise: options.exercise,
        confidence: null,
        signals: [MANUAL_SELECTION_SIGNAL],
      }
    : classifyExercise(frames.map((f) => f.frame));

  const exercise = options.exercise ?? classification.exercise;

  if (!exercise) {
    return emptyAnalysis("squat", classification, [
      "Could not confidently classify the exercise from the video. Try again with the full lift visible, or specify the exercise manually.",
    ]);
  }

  const config = getExerciseConfig(exercise);
  const machine = createRepStateMachine(config);

  const detectedReps: CompletedRep[] = [];
  let visibleFrameCount = 0;
  let finalPhase = "top";

  for (const timedFrame of frames) {
    const result = machine.processFrame(timedFrame);

    if (result.visible) {
      visibleFrameCount += 1;
      finalPhase = result.phase;
    }

    if (result.lastCompletedRep) {
      detectedReps.push(result.lastCompletedRep);
    }
  }

  const limitations: string[] = [];
  const completedReps = exercise === "squat" ? excludePickupOutliers(detectedReps, limitations) : detectedReps;

  const visibilityRatio = frames.length > 0 ? visibleFrameCount / frames.length : 0;

  if (frames.length > 0 && visibilityRatio < MIN_VISIBILITY_RATIO) {
    limitations.push(
      `Only ${Math.round(visibilityRatio * 100)}% of frames had clear visibility of the required landmarks — results may be less reliable.`,
    );
  }

  if (completedReps.length === 0) {
    limitations.push(
      "No complete reps were detected. Check that the full lift (start to finish) is visible in the video.",
    );
  } else if (completedReps.length < MIN_REPS_FOR_RELIABLE_CONSISTENCY) {
    limitations.push(
      `Only ${completedReps.length} rep(s) detected — consistency metrics (ROM/tempo/bar-path) are less meaningful with this few reps.`,
    );
  }

  if (machine.getDroppedReps() > 0) {
    limitations.push(
      `Tracking was lost mid-movement ${machine.getDroppedReps()} time(s); those movements were not counted as reps.`,
    );
  }

  if (finalPhase !== "top") {
    limitations.push("The clip ends mid-movement; that last movement was not counted as a rep.");
  }

  if (completedReps.some((rep) => !rep.startObserved)) {
    limitations.push(
      "A rep began before tracking did (already at the bottom), so its eccentric and bottom-hold times are not reported.",
    );
  }

  const { view } = estimateCameraView(frames.map((f) => f.frame));
  // Joint ranges are only meaningful as 2D angles when the camera is side-on.
  const sideOn = view === "side";

  if (!sideOn && exercise !== "bench_press") {
    limitations.push(
      view === "frontal"
        ? "The camera faces the lifter, so joint angles are 2D projections: joint range is not reported, and rep timing comes from the projected joint-angle trace."
        : "The camera could not be verified as side-on, so joint range is not reported, and rep timing comes from the projected joint-angle trace.",
    );
  }

  const torsoLength = averageTorsoLength(frames.map((f) => f.frame));

  if (!torsoLength) {
    limitations.push(
      "Could not estimate torso length from the video, so velocity and bar-path metrics are unavailable.",
    );
  }

  const repRoms = sideOn || exercise === "bench_press" ? computeAllRepRom(completedReps, config) : [];
  const repTempos = computeAllRepTempo(completedReps);

  const velocity = computeVelocity(completedReps, torsoLength, {
    metersPerTorsoLength: options.metersPerTorsoLength,
  });

  const technique = computeTechniqueConsistency(completedReps, config, torsoLength, {
    rom: repRoms,
    tempo: repTempos,
  });

  const confidence = deriveOverallConfidence({
    visibilityRatio,
    repCount: completedReps.length,
    hasTorsoLength: torsoLength !== null,
  });

  return {
    exercise,
    exerciseClassification: classification,
    reps: completedReps.length,
    romConsistency: technique.romConsistency,
    averageEccentricTime: averageEccentricTime(repTempos),
    averageConcentricTime: averageConcentricTime(repTempos),
    velocity,
    technique,
    confidence,
    perRep: { rom: repRoms, tempo: repTempos },
    limitations,
  };
}
