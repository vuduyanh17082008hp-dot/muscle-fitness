"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import toast from "react-hot-toast";
import { loadPoseDetector, calculateAngle } from "@/lib/ai";

export default function PoseCamera() {
  const webcamRef = useRef<Webcam>(null);
  const [loading, setLoading] = useState(true);
  const [angle, setAngle] = useState<number | null>(null);

  // Placeholder variable names for your keypoints
  // Usually: [0]=nose, [5]=left shoulder, [6]=right shoulder, [7]=left elbow, [8]=right elbow, etc.
  let kp1: { score?: number, x: number, y: number } | null = null; // e.g. Shoulder
  let kp2: { score?: number, x: number, y: number } | null = null; // e.g. Elbow
  let kp3: { score?: number, x: number, y: number } | null = null; // e.g. Wrist

  const runPoseDetection = useCallback(async () => {
    const detector = await loadPoseDetector();
    if (!webcamRef.current || !webcamRef.current.video) return;

    const video = webcamRef.current.video;
    if (video.readyState !== 4) return;

    try {
      const poses = await detector.estimatePoses(video);
      if (poses.length > 0) {
        const keypoints = poses[0].keypoints;
        
        // NOTE: Update these indices to match the specific body parts you want to track
        kp1 = keypoints[5] || null; // Left Shoulder
        kp2 = keypoints[7] || null; // Left Elbow
        kp3 = keypoints[9] || null; // Left Wrist

        if (kp1 && kp2 && kp3) {
          // *** FIX: Use optional chaining (?.) and nullish coalescing (??) to avoid undefined errors ***
          const s1 = kp1?.score ?? 0;
          const s2 = kp2?.score ?? 0;
          const s3 = kp3?.score ?? 0;

          // Optional: check if scores are high enough to be accurate
          if (s1 > 0.5 && s2 > 0.5 && s3 > 0.5) {
            const calculatedAngle = calculateAngle(kp1, kp2, kp3);
            setAngle(calculatedAngle);
          } else {
            setAngle(null);
          }
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Pose detection failed");
    }
    
    // Loop the detection
    requestAnimationFrame(runPoseDetection);
  }, []);

  useEffect(() => {
    setLoading(false);
    runPoseDetection();
  }, [runPoseDetection]);

  if (loading) {
    return <div className="p-10 text-center">Loading Camera...</div>;
  }

  return (
    <div className="flex flex-col items-center p-4">
      <div className="relative">
        <Webcam 
          ref={webcamRef} 
          mirrored={true}
          className="rounded-lg shadow-lg w-full max-w-lg"
        />
      </div>
      
      {angle !== null ? (
        <div className="mt-4 text-xl font-bold text-blue-600">
          Current Angle: {Math.round(angle)}°
        </div>
      ) : (
        <div className="mt-4 text-gray-500">No pose detected.</div>
      )}
    </div>
  );
}