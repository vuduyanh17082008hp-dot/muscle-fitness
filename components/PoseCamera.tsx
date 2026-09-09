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

/* =========================================================
   TYPES
========================================================= */

type CameraStatus =
  | "waiting"
  | "loading-model"
  | "ready"
  | "error";

/* =========================================================
   INITIAL STATE
========================================================= */

const initialRepState: RepCounterState = {
  count: 0,
  stage: "up",
};

/* =========================================================
   COMPONENT
========================================================= */

export default function PoseCamera() {
  const webcamRef =
    useRef<Webcam>(null);

  const animationFrameRef =
    useRef<number | null>(
      null,
    );

  const runningRef =
    useRef(false);

  const errorShownRef =
    useRef(false);

  const repStateRef =
    useRef<RepCounterState>({
      ...initialRepState,
    });

  /* =======================================================
     CAMERA STATE
  ======================================================= */

  const [
    cameraReady,
    setCameraReady,
  ] =
    useState(false);

  const [
    cameraStatus,
    setCameraStatus,
  ] =
    useState<CameraStatus>(
      "waiting",
    );

  /* =======================================================
     POSE STATE
  ======================================================= */

  const [
    angle,
    setAngle,
  ] =
    useState<number | null>(
      null,
    );

  const [
    repCount,
    setRepCount,
  ] =
    useState(0);

  const [
    stage,
    setStage,
  ] =
    useState<
      RepCounterState["stage"]
    >("up");

  /* =======================================================
     PROCESS ONE CAMERA FRAME

     IMPORTANT:
     This function processes exactly one frame.

     It does NOT recursively call itself.

     The requestAnimationFrame loop lives inside useEffect,
     avoiding the ESLint error:

     "Cannot access variable before it is declared"
  ======================================================= */

  const processFrame =
    useCallback(
      async () => {
        if (
          !runningRef.current
        ) {
          return;
        }

        const video =
          webcamRef.current
            ?.video;

        if (
          !video ||
          video.readyState <
            HTMLMediaElement
              .HAVE_CURRENT_DATA
        ) {
          return;
        }

        try {
          setCameraStatus(
            (
              currentStatus,
            ) =>
              currentStatus ===
              "ready"
                ? currentStatus
                : "loading-model",
          );

          /* ===============================================
             LOAD AI MODEL
          =============================================== */

          const detector =
            await loadPoseDetector();

          if (
            !runningRef.current
          ) {
            return;
          }

          /* ===============================================
             ESTIMATE POSE
          =============================================== */

          const poses =
            await detector.estimatePoses(
              video,
              {
                flipHorizontal:
                  false,
              },
            );

          if (
            !runningRef.current
          ) {
            return;
          }

          const pose =
            poses[0];

          /* ===============================================
             NO PERSON DETECTED
          =============================================== */

          if (!pose) {
            setAngle(null);

            setCameraStatus(
              "ready",
            );

            return;
          }

          /* ===============================================
             LEFT ARM KEYPOINTS
          =============================================== */

          const leftShoulder =
            pose.keypoints.find(
              (
                keypoint,
              ) =>
                keypoint.name ===
                "left_shoulder",
            );

          const leftElbow =
            pose.keypoints.find(
              (
                keypoint,
              ) =>
                keypoint.name ===
                "left_elbow",
            );

          const leftWrist =
            pose.keypoints.find(
              (
                keypoint,
              ) =>
                keypoint.name ===
                "left_wrist",
            );

          const shoulderScore =
            leftShoulder?.score ??
            0;

          const elbowScore =
            leftElbow?.score ??
            0;

          const wristScore =
            leftWrist?.score ??
            0;

          /* ===============================================
             ELBOW ANGLE
          =============================================== */

          if (
            leftShoulder &&
            leftElbow &&
            leftWrist &&
            shoulderScore >=
              0.5 &&
            elbowScore >=
              0.5 &&
            wristScore >=
              0.5
          ) {
            const currentAngle =
              calculateAngle(
                leftShoulder,
                leftElbow,
                leftWrist,
              );

            setAngle(
              currentAngle,
            );
          } else {
            setAngle(null);
          }

          /* ===============================================
             REP COUNTER
          =============================================== */

          const nextRepState =
            repCounter(
              pose.keypoints,
              repStateRef.current,
            );

          repStateRef.current =
            nextRepState;

          setRepCount(
            nextRepState.count,
          );

          setStage(
            nextRepState.stage,
          );

          setCameraStatus(
            "ready",
          );

          /*
           * If pose detection recovered after a temporary
           * issue, allow future errors to be displayed.
           */
          errorShownRef.current =
            false;
        } catch (
          error
        ) {
          console.error(
            "Pose detection error:",
            error,
          );

          setCameraStatus(
            "error",
          );

          if (
            !errorShownRef.current
          ) {
            errorShownRef.current =
              true;

            toast.error(
              "AI pose detection could not be started.",
            );
          }
        }
      },
      [],
    );

  /* =======================================================
     AI CAMERA LOOP
  ======================================================= */

  useEffect(() => {
    if (!cameraReady) {
      return;
    }

    runningRef.current =
      true;

    let cancelled =
      false;

    /*
     * Function declaration is intentionally used here.
     *
     * It can safely schedule itself after the current frame
     * finishes without triggering the React ESLint
     * "accessed before declaration" rule.
     */
    async function runFrame() {
      if (
        cancelled ||
        !runningRef.current
      ) {
        return;
      }

      await processFrame();

      if (
        cancelled ||
        !runningRef.current
      ) {
        return;
      }

      animationFrameRef.current =
        window.requestAnimationFrame(
          () => {
            void runFrame();
          },
        );
    }

    animationFrameRef.current =
      window.requestAnimationFrame(
        () => {
          void runFrame();
        },
      );

    return () => {
      cancelled =
        true;

      runningRef.current =
        false;

      if (
        animationFrameRef.current !==
        null
      ) {
        window.cancelAnimationFrame(
          animationFrameRef.current,
        );

        animationFrameRef.current =
          null;
      }
    };
  }, [
    cameraReady,
    processFrame,
  ]);

  /* =======================================================
     CAMERA READY
  ======================================================= */

  function handleCameraReady() {
    errorShownRef.current =
      false;

    setCameraReady(
      true,
    );

    setCameraStatus(
      "loading-model",
    );
  }

  /* =======================================================
     CAMERA ERROR
  ======================================================= */

  function handleCameraError(
    error:
      | string
      | DOMException,
  ) {
    console.error(
      "Camera error:",
      error,
    );

    runningRef.current =
      false;

    setCameraReady(
      false,
    );

    setCameraStatus(
      "error",
    );

    toast.error(
      "Camera access was denied or is unavailable.",
    );
  }

  /* =======================================================
     RESET COUNTER
  ======================================================= */

  function resetCounter() {
    const resetState:
      RepCounterState = {
      ...initialRepState,
    };

    repStateRef.current =
      resetState;

    setRepCount(
      resetState.count,
    );

    setStage(
      resetState.stage,
    );

    setAngle(null);
  }

  /* =======================================================
     STATUS MESSAGE
  ======================================================= */

  const statusMessage =
    (() => {
      switch (
        cameraStatus
      ) {
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

  /* =======================================================
     UI
  ======================================================= */

  return (
    <section className="w-full">
      <div
        className="
          grid

          gap-6

          lg:grid-cols-[minmax(0,1fr)_320px]
        "
      >
        {/* =================================================
            CAMERA
        ================================================= */}

        <div
          className="
            overflow-hidden

            rounded-3xl

            border
            border-white/10

            bg-black

            shadow-2xl
          "
        >
          <div className="relative aspect-video">
            <Webcam
              ref={
                webcamRef
              }
              audio={
                false
              }
              mirrored
              screenshotFormat="image/jpeg"
              videoConstraints={{
                width:
                  1280,

                height:
                  720,

                facingMode:
                  "user",
              }}
              onUserMedia={
                handleCameraReady
              }
              onUserMediaError={
                handleCameraError
              }
              className="
                h-full
                w-full

                object-cover
              "
            />

            {/* =============================================
                TOP OVERLAY
            ============================================= */}

            <div
              className="
                pointer-events-none

                absolute
                inset-x-0
                top-0

                flex

                items-center
                justify-between

                bg-linear-to-b

                from-black/80
                to-transparent

                p-4
              "
            >
              <div
                className="
                  rounded-full

                  border
                  border-white/10

                  bg-black/60

                  px-4
                  py-2

                  text-xs
                  font-semibold

                  uppercase

                  tracking-[0.18em]

                  text-white

                  backdrop-blur
                "
              >
                Live camera
              </div>

              <div
                className={[
                  "size-3 rounded-full",

                  cameraStatus ===
                  "ready"
                    ? "bg-emerald-400"
                    : cameraStatus ===
                        "error"
                      ? "bg-red-500"
                      : "animate-pulse bg-amber-400",
                ].join(" ")}
                aria-label={
                  statusMessage
                }
              />
            </div>

            {/* =============================================
                BOTTOM OVERLAY
            ============================================= */}

            <div
              className="
                pointer-events-none

                absolute
                inset-x-0
                bottom-0

                bg-linear-to-t

                from-black/90
                to-transparent

                p-5
              "
            >
              <p
                className="
                  text-sm
                  font-medium

                  text-white
                "
              >
                {
                  statusMessage
                }
              </p>
            </div>
          </div>
        </div>

        {/* =================================================
            METRICS
        ================================================= */}

        <aside className="space-y-4">
          {/* REP COUNT */}

          <div
            className="
              rounded-3xl

              border
              border-white/10

              bg-white/4

              p-6
            "
          >
            <p
              className="
                text-xs
                font-semibold

                uppercase

                tracking-[0.2em]

                text-neutral-400
              "
            >
              Squat repetitions
            </p>

            <p
              className="
                mt-3

                text-6xl
                font-black

                text-white
              "
            >
              {
                repCount
              }
            </p>

            <p
              className="
                mt-2

                text-sm

                text-neutral-400
              "
            >
              Current stage:{" "}

              <span
                className="
                  font-semibold

                  uppercase

                  text-amber-400
                "
              >
                {
                  stage
                }
              </span>
            </p>
          </div>

          {/* ANGLE */}

          <div
            className="
              rounded-3xl

              border
              border-white/10

              bg-white/4

              p-6
            "
          >
            <p
              className="
                text-xs
                font-semibold

                uppercase

                tracking-[0.2em]

                text-neutral-400
              "
            >
              Left elbow angle
            </p>

            <p
              className="
                mt-3

                text-4xl
                font-black

                text-white
              "
            >
              {angle ===
              null
                ? "--"
                : `${Math.round(
                    angle,
                  )}°`}
            </p>

            <p
              className="
                mt-3

                text-sm
                leading-6

                text-neutral-400
              "
            >
              Keep your full body visible and make sure the room has
              enough light.
            </p>
          </div>

          {/* RESET */}

          <button
            type="button"
            onClick={
              resetCounter
            }
            className="
              min-h-12
              w-full

              rounded-2xl

              bg-amber-500

              px-5
              py-3

              text-sm
              font-bold

              uppercase

              tracking-[0.15em]

              text-black

              transition

              hover:bg-amber-400
            "
          >
            Reset counter
          </button>
        </aside>
      </div>
    </section>
  );
}