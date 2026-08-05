"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Webcam from "react-webcam";
import toast from "react-hot-toast";

import {
  calculateAngle,
  loadPoseDetector,
  repCounter,
  type RepCounterState,
} from "@/lib/ai";

type CameraStatus =
  | "waiting"
  | "loading-model"
  | "ready"
  | "error";

const initialRepState: RepCounterState = {
  count: 0,
  stage: "up",
};

export default function PoseCamera() {
  const webcamRef = useRef<Webcam>(null);
  const animationFrameRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const errorShownRef = useRef(false);
  const repStateRef = useRef<RepCounterState>(initialRepState);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStatus, setCameraStatus] =
    useState<CameraStatus>("waiting");

  const [angle, setAngle] = useState<number | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [stage, setStage] =
    useState<RepCounterState["stage"]>("up");

  const scheduleNextFrame = useCallback(
    (callback: FrameRequestCallback) => {
      if (!runningRef.current) {
        return;
      }

      animationFrameRef.current =
        window.requestAnimationFrame(callback);
    },
    [],
  );

  const detectPose = useCallback(async () => {
    if (!runningRef.current) {
      return;
    }

    const video = webcamRef.current?.video;

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      scheduleNextFrame(() => {
        void detectPose();
      });

      return;
    }

    try {
      setCameraStatus((currentStatus) =>
        currentStatus === "ready"
          ? currentStatus
          : "loading-model",
      );

      const detector = await loadPoseDetector();

      if (!runningRef.current) {
        return;
      }

      const poses = await detector.estimatePoses(video, {
        flipHorizontal: false,
      });

      const pose = poses[0];

      if (!pose) {
        setAngle(null);
        setCameraStatus("ready");

        scheduleNextFrame(() => {
          void detectPose();
        });

        return;
      }

      const leftShoulder = pose.keypoints.find(
        (keypoint) => keypoint.name === "left_shoulder",
      );

      const leftElbow = pose.keypoints.find(
        (keypoint) => keypoint.name === "left_elbow",
      );

      const leftWrist = pose.keypoints.find(
        (keypoint) => keypoint.name === "left_wrist",
      );

      const shoulderScore = leftShoulder?.score ?? 0;
      const elbowScore = leftElbow?.score ?? 0;
      const wristScore = leftWrist?.score ?? 0;

      if (
        leftShoulder &&
        leftElbow &&
        leftWrist &&
        shoulderScore >= 0.5 &&
        elbowScore >= 0.5 &&
        wristScore >= 0.5
      ) {
        const currentAngle = calculateAngle(
          leftShoulder,
          leftElbow,
          leftWrist,
        );

        setAngle(currentAngle);
      } else {
        setAngle(null);
      }

      const nextRepState = repCounter(
        pose.keypoints,
        repStateRef.current,
      );

      repStateRef.current = nextRepState;
      setRepCount(nextRepState.count);
      setStage(nextRepState.stage);
      setCameraStatus("ready");
    } catch (error) {
      console.error("Pose detection error:", error);

      setCameraStatus("error");

      if (!errorShownRef.current) {
        errorShownRef.current = true;

        toast.error(
          "AI pose detection could not be started.",
        );
      }
    }

    scheduleNextFrame(() => {
      void detectPose();
    });
  }, [scheduleNextFrame]);

  useEffect(() => {
    if (!cameraReady) {
      return;
    }

    runningRef.current = true;

    animationFrameRef.current =
      window.requestAnimationFrame(() => {
        void detectPose();
      });

    return () => {
      runningRef.current = false;

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(
          animationFrameRef.current,
        );
      }
    };
  }, [cameraReady, detectPose]);

  function handleCameraReady() {
    errorShownRef.current = false;
    setCameraReady(true);
    setCameraStatus("loading-model");
  }

  function handleCameraError(error: string | DOMException) {
    console.error("Camera error:", error);

    setCameraReady(false);
    setCameraStatus("error");

    toast.error(
      "Camera access was denied or is unavailable.",
    );
  }

  function resetCounter() {
    repStateRef.current = initialRepState;
    setRepCount(0);
    setStage("up");
  }

  const statusMessage = (() => {
    switch (cameraStatus) {
      case "waiting":
        return "Waiting for camera permission...";

      case "loading-model":
        return "Loading the AI pose model...";

      case "ready":
        return "AI Form Coach is active.";

      case "error":
        return "Camera or AI model is unavailable.";

      default:
        return "Preparing camera...";
    }
  })();

  return (
    <section className="w-full">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
          <div className="relative aspect-video">
            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width: 1280,
                height: 720,
                facingMode: "user",
              }}
              onUserMedia={handleCameraReady}
              onUserMediaError={handleCameraError}
              className="h-full w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
              <div className="rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white backdrop-blur">
                Live camera
              </div>

              <div
                className={[
                  "h-3 w-3 rounded-full",
                  cameraStatus === "ready"
                    ? "bg-emerald-400"
                    : cameraStatus === "error"
                      ? "bg-red-500"
                      : "animate-pulse bg-amber-400",
                ].join(" ")}
                aria-label={statusMessage}
              />
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5">
              <p className="text-sm font-medium text-white">
                {statusMessage}
              </p>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Squat repetitions
            </p>

            <p className="mt-3 text-6xl font-black text-white">
              {repCount}
            </p>

            <p className="mt-2 text-sm text-neutral-400">
              Current stage:{" "}
              <span className="font-semibold uppercase text-amber-400">
                {stage}
              </span>
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Left elbow angle
            </p>

            <p className="mt-3 text-4xl font-black text-white">
              {angle === null ? "--" : `${Math.round(angle)}°`}
            </p>

            <p className="mt-3 text-sm leading-6 text-neutral-400">
              Keep your full body visible and make sure the
              room has enough light.
            </p>
          </div>

          <button
            type="button"
            onClick={resetCounter}
            className="min-h-12 w-full rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold uppercase tracking-[0.15em] text-black transition hover:bg-amber-400"
          >
            Reset counter
          </button>
        </aside>
      </div>
    </section>
  );
}