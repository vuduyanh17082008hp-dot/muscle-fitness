import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';

let detector: poseDetection.PoseDetector | null = null;

export async function loadPoseDetector() {
  if (detector) return detector;
  const model = poseDetection.SupportedModels.MoveNet;
  detector = await poseDetection.createDetector(model, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
  });
  return detector;
}

// Tính góc giữa 3 điểm (theo radian, sau đó đổi ra độ)
export function calculateAngle(a: {x:number,y:number}, b: {x:number,y:number}, c: {x:number,y:number}) {
  const ab = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
  const bc = Math.sqrt(Math.pow(b.x - c.x, 2) + Math.pow(b.y - c.y, 2));
  const ac = Math.sqrt(Math.pow(c.x - a.x, 2) + Math.pow(c.y - a.y, 2));
  const angleRad = Math.acos((ab * ab + bc * bc - ac * ac) / (2 * ab * bc));
  return angleRad * (180 / Math.PI);
}

// Đếm rep đơn giản cho Squat (theo dõi góc gối trái)
export function repCounter(
  keypoints: poseDetection.Keypoint[],
  state: { count: number; stage: 'up' | 'down' }
) {
  const leftHip = keypoints.find(k => k.name === 'left_hip');
  const leftKnee = keypoints.find(k => k.name === 'left_knee');
  const leftAnkle = keypoints.find(k => k.name === 'left_ankle');

  if (leftHip && leftKnee && leftAnkle && leftHip.score! > 0.5 && leftKnee.score! > 0.5 && leftAnkle.score! > 0.5) {
    const angle = calculateAngle(leftHip, leftKnee, leftAnkle);
    if (angle < 90 && state.stage === 'up') {
      state.stage = 'down';
    }
    if (angle > 160 && state.stage === 'down') {
      state.count++;
      state.stage = 'up';
    }
  }
  return state;
}