import type {
  Keypoint,
  PoseDetector,
} from "@tensorflow-models/pose-detection";

type Point = {
  x: number;
  y: number;
  score?: number;
};

export type RepCounterState = {
  count: number;
  stage: "up" | "down";
};

let detector: PoseDetector | null = null;
let detectorPromise: Promise<PoseDetector> | null = null;

export async function loadPoseDetector(): Promise<PoseDetector> {
  if (typeof window === "undefined") {
    throw new Error("Pose detector can only run in the browser.");
  }

  if (detector) {
    return detector;
  }

  if (detectorPromise) {
    return detectorPromise;
  }

  detectorPromise = (async () => {
    const tf = await import("@tensorflow/tfjs-core");

    await import("@tensorflow/tfjs-backend-webgl");

    const poseDetection = await import(
      "@tensorflow-models/pose-detection"
    );

    const backendReady = await tf.setBackend("webgl");

    if (!backendReady) {
      throw new Error("Unable to initialise the WebGL backend.");
    }

    await tf.ready();

    const loadedDetector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType:
          poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      },
    );

    detector = loadedDetector;

    return loadedDetector;
  })().catch((error: unknown) => {
    detectorPromise = null;
    throw error;
  });

  return detectorPromise;
}

export function calculateAngle(
  pointA: Point,
  pointB: Point,
  pointC: Point,
): number {
  const radians =
    Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) -
    Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);

  let angle = Math.abs((radians * 180) / Math.PI);

  if (angle > 180) {
    angle = 360 - angle;
  }

  return angle;
}

export function repCounter(
  keypoints: Keypoint[],
  currentState: RepCounterState,
): RepCounterState {
  const leftHip = keypoints.find(
    (keypoint) => keypoint.name === "left_hip",
  );

  const leftKnee = keypoints.find(
    (keypoint) => keypoint.name === "left_knee",
  );

  const leftAnkle = keypoints.find(
    (keypoint) => keypoint.name === "left_ankle",
  );

  if (!leftHip || !leftKnee || !leftAnkle) {
    return currentState;
  }

  const hipScore = leftHip.score ?? 0;
  const kneeScore = leftKnee.score ?? 0;
  const ankleScore = leftAnkle.score ?? 0;

  if (hipScore < 0.5 || kneeScore < 0.5 || ankleScore < 0.5) {
    return currentState;
  }

  const kneeAngle = calculateAngle(
    leftHip,
    leftKnee,
    leftAnkle,
  );

  if (kneeAngle < 95 && currentState.stage === "up") {
    return {
      ...currentState,
      stage: "down",
    };
  }

  if (kneeAngle > 155 && currentState.stage === "down") {
    return {
      count: currentState.count + 1,
      stage: "up",
    };
  }

  return currentState;
}