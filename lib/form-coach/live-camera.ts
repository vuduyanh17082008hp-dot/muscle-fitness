/**
 * Form Coach P1A — camera acquisition helpers (no React, no pose model).
 * The live page calls getUserMedia only from an explicit user action and
 * stops every track it opened; nothing is recorded or uploaded.
 */

export type CameraFailure =
  | "insecure_context"
  | "unsupported"
  | "denied"
  | "not_found"
  | "in_use"
  | "overconstrained"
  | "interrupted"
  | "unknown";

export const CAMERA_FAILURE_TEXT: Record<CameraFailure, { title: string; detail: string }> = {
  insecure_context: {
    title: "Camera needs a secure page",
    detail: "Browsers only allow the camera on HTTPS (or localhost). Open Muscle Fitness over https:// and try again.",
  },
  unsupported: {
    title: "This browser can't open a camera here",
    detail: "Live counting needs a browser with camera access (getUserMedia), such as current Chrome, Edge, Safari or Firefox.",
  },
  denied: {
    title: "Camera permission was denied",
    detail: "Allow camera access for this site in your browser's address bar or site settings (and in your device's privacy settings), then press Start camera again.",
  },
  not_found: {
    title: "No camera found",
    detail: "No camera is connected or enabled on this device.",
  },
  in_use: {
    title: "The camera couldn't start",
    detail: "Another app or tab may be using it, or the hardware reported an error. Close other apps using the camera and try again.",
  },
  overconstrained: {
    title: "That camera isn't available",
    detail: "The selected camera could not be opened with the requested settings. Choose another camera or try the default.",
  },
  interrupted: {
    title: "The camera stopped",
    detail: "The camera was disconnected, turned off, or its permission was revoked. Counting stopped; start the camera again to continue.",
  },
  unknown: {
    title: "The camera couldn't start",
    detail: "Something went wrong opening the camera. Try again, or upload a recording instead.",
  },
};

type CameraEnv = {
  isSecureContext?: boolean;
  mediaDevices?: { getUserMedia?: unknown } | undefined;
};

/** Checked before any permission prompt. */
export function checkCameraSupport(env: CameraEnv): CameraFailure | null {
  if (env.isSecureContext === false) return "insecure_context";
  if (typeof env.mediaDevices?.getUserMedia !== "function") return "unsupported";
  return null;
}

/** getUserMedia rejection → one user-facing category (names per the Media Capture spec + legacy Chrome aliases). */
export function classifyCameraError(error: unknown): CameraFailure {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "not_found";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in_use";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "overconstrained";
    case "TypeError":
      return "unsupported";
    default:
      return "unknown";
  }
}

export type CameraChoice = { deviceId: string } | { facingMode: "user" | "environment" };

/** No audio, ever. 720p ideal; the pose model downsamples anyway. */
export function cameraConstraints(choice: CameraChoice): MediaStreamConstraints {
  const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
  if ("deviceId" in choice) video.deviceId = { exact: choice.deviceId };
  else video.facingMode = { ideal: choice.facingMode };
  return { audio: false, video };
}

/** Stop every track of a stream this page opened. Safe to call twice or with null. */
export function stopStream(stream: { getTracks: () => Array<{ stop: () => void }> } | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}
