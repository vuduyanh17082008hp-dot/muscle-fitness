import { classifyExercise } from "@/lib/setvision/exercise-classifier";
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

function deriveOverallConfidence(params: {
  classificationConfidence: number;
  visibilityRatio: number;
  repCount: number;
  hasTorsoLength: boolean;
}): number {
  let score = 0;
  let maxScore = 0;

  maxScore += 1;
  score += params.classificationConfidence;

  maxScore += 1;
  score += params.visibilityRatio;

  maxScore += 1;
  score += Math.min(1, params.repCount / MIN_REPS_FOR_RELIABLE_CONSISTENCY);

  maxScore += 1;
  score += params.hasTorsoLength ? 1 : 0;

  return round(score / maxScore, 2);
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
        confidence: 1,
        signals: ["Exercise was specified by the caller, not auto-classified."],
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

  const completedReps: CompletedRep[] = [];
  let visibleFrameCount = 0;

  for (const timedFrame of frames) {
    const result = machine.processFrame(timedFrame);

    if (result.visible) {
      visibleFrameCount += 1;
    }

    if (result.lastCompletedRep) {
      completedReps.push(result.lastCompletedRep);
    }
  }

  const visibilityRatio = frames.length > 0 ? visibleFrameCount / frames.length : 0;
  const limitations: string[] = [];

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

  const torsoLength = averageTorsoLength(frames.map((f) => f.frame));

  if (!torsoLength) {
    limitations.push(
      "Could not estimate torso length from the video, so velocity and bar-path metrics are unavailable.",
    );
  }

  const repRoms = computeAllRepRom(completedReps, config);
  const repTempos = computeAllRepTempo(completedReps);

  const velocity = computeVelocity(completedReps, torsoLength, {
    metersPerTorsoLength: options.metersPerTorsoLength,
  });

  const technique = computeTechniqueConsistency(completedReps, config, torsoLength, {
    rom: repRoms,
    tempo: repTempos,
  });

  const confidence = deriveOverallConfidence({
    classificationConfidence: classification.confidence,
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
