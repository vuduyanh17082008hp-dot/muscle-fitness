"use client";

import { useEffect, useState } from "react";

import type { DanteRobotState } from "@/components/dante/dante-robot";

/* =========================================================
   DANTE PRESENCE

   Maps application-level activity (an AI request starting,
   finishing, failing) onto DanteRobot's visual state, so the
   SVG component never has to know about chat/streaming/loading
   concerns.
========================================================= */

export type DanteActivity =
  | "idle"
  | "listening"
  | "thinking"
  | "success"
  | "error";

type UseDantePresenceOptions = {
  /** How long the transient "speaking" beat lasts after a reply lands. */
  speakingDurationMs?: number;
  /** How long a "success" flash lasts before returning to idle. */
  successDurationMs?: number;
  /** How long an "error" flash lasts before returning to idle. */
  errorDurationMs?: number;
};

const DEFAULTS = {
  speakingDurationMs: 2200,
  successDurationMs: 1800,
  errorDurationMs: 2400,
};

/**
 * activity:
 *  - "idle"      -> robot is idle
 *  - "listening" -> input is focused / awaiting the user
 *  - "thinking"  -> a request is in flight
 *  - "success"   -> a reply just landed / an action just succeeded
 *  - "error"     -> the last action failed
 *
 * "success" is surfaced to the robot as a brief "speaking" beat when it
 * follows "thinking" (i.e. a chat reply), and reverts to "idle" on its own.
 */
export function useDantePresence(
  activity: DanteActivity,
  options: UseDantePresenceOptions = {},
): DanteRobotState {
  const { speakingDurationMs, successDurationMs, errorDurationMs } = {
    ...DEFAULTS,
    ...options,
  };

  const [visualState, setVisualState] = useState<DanteRobotState>("idle");
  const [prevActivity, setPrevActivity] = useState(activity);
  const [wasThinking, setWasThinking] = useState(false);

  // Adjust state directly during render when the activity prop changes —
  // avoids the extra render + effect round-trip for a purely derived value.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (activity !== prevActivity) {
    setPrevActivity(activity);

    if (activity === "thinking") {
      setWasThinking(true);
      setVisualState("thinking");
    } else if (activity === "listening") {
      setVisualState("listening");
    } else if (activity === "success") {
      setVisualState(wasThinking ? "speaking" : "success");
      setWasThinking(false);
    } else if (activity === "error") {
      setWasThinking(false);
      setVisualState("error");
    } else {
      setWasThinking(false);
      setVisualState("idle");
    }
  }

  // Transient states (speaking / success / error) revert to idle on their own.
  useEffect(() => {
    if (
      visualState !== "speaking" &&
      visualState !== "success" &&
      visualState !== "error"
    ) {
      return;
    }

    const duration =
      visualState === "speaking"
        ? speakingDurationMs
        : visualState === "success"
          ? successDurationMs
          : errorDurationMs;

    const timeoutId = window.setTimeout(() => {
      setVisualState("idle");
    }, duration);

    return () => window.clearTimeout(timeoutId);
  }, [visualState, speakingDurationMs, successDurationMs, errorDurationMs]);

  return visualState;
}

/* =========================================================
   STATE COPY — for the textual announcement accessibility
   requires alongside the animation.
========================================================= */

export const DANTE_STATE_LABEL: Record<DanteRobotState, string> = {
  idle: "Dante is ready.",
  listening: "Dante is listening.",
  thinking: "Dante is thinking...",
  speaking: "Dante is responding.",
  success: "Dante finished successfully.",
  error: "Dante ran into an error.",
};
