"use client";

import { useState } from "react";
import Webcam from "react-webcam";
import { Camera, CameraOff } from "lucide-react";

export function FormCheckPanel() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden border border-ink/10 bg-ink">
        <div className="aspect-video w-full">
          {enabled ? (
            <Webcam
              audio={false}
              mirrored
              className="h-full w-full object-cover"
              videoConstraints={{ facingMode: "user" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-graphite to-ink text-bone/60">
              Camera off — enable to begin a form check
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setEnabled((value) => !value)}
          className="inline-flex items-center gap-2 bg-lime px-4 py-2 text-sm font-semibold text-ink transition hover:bg-lime-deep hover:text-bone"
        >
          {enabled ? <CameraOff size={16} /> : <Camera size={16} />}
          {enabled ? "Stop camera" : "Enable camera"}
        </button>
        <p className="max-w-md self-center text-sm text-steel">
          Pose detection loads in the browser when TensorFlow models are ready.
          Keep the bar path in frame and stand side-on for best feedback.
        </p>
      </div>
    </div>
  );
}
