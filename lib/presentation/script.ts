import type { DantePoseName } from "@/components/dante-avatar/poses";

/**
 * Presentation script (spec Part E §27-28).
 *
 * A fixed, deterministic sequence of "beats" — each has a duration
 * (auto-advances) but the presenter can always move forward/back
 * manually (spec §26: "keyboard-controllable"). Total intro runtime
 * sums to ~43s, inside the spec's 35-45s target.
 *
 * Narrative follows spec §28's core idea directly — no page/feature
 * list, just the intelligence thesis.
 */

export type SceneId =
  | "black"
  | "logo"
  | "dante_enter"
  | "dante_intro"
  | "problem"
  | "setvision"
  | "hawkerlens"
  | "recovery"
  | "dante_core"
  | "recommendation"
  | "pose"
  | "handoff"
  | "closed_loop";

export type PresentationBeat = {
  id: SceneId;
  durationMs: number;
  caption: string | null;
  pose?: DantePoseName;
  /** Optional pre-generated audio for this beat (spec §24) — see components/presentation/presentation-stage.tsx for the fallback rule if this file doesn't exist. */
  audioSrc?: string;
  /** Whether this beat is part of the timed auto-advancing intro, or a manually-advanced beat after it (e.g. the deeper closed-loop demo). */
  autoAdvance: boolean;
};

export const PRESENTATION_SCRIPT: PresentationBeat[] = [
  { id: "black", durationMs: 1500, caption: null, autoAdvance: true },
  { id: "logo", durationMs: 3000, caption: "MUSCLE FITNESS", autoAdvance: true },
  {
    id: "dante_enter",
    durationMs: 3000,
    caption: null,
    pose: "walk_in",
    audioSrc: "/audio/presentation/01-dante-enter.mp3",
    autoAdvance: true,
  },
  {
    id: "dante_intro",
    durationMs: 2500,
    caption: "I am Dante.",
    pose: "idle_breathing",
    audioSrc: "/audio/presentation/02-i-am-dante.mp3",
    autoAdvance: true,
  },
  {
    id: "problem",
    durationMs: 5500,
    caption:
      "Most fitness applications record what you did. Muscle Fitness asks a different question: what should you do next?",
    pose: "explain_gesture",
    audioSrc: "/audio/presentation/03-problem.mp3",
    autoAdvance: true,
  },
  {
    id: "setvision",
    durationMs: 5500,
    caption: "SetVision helps me understand how you train.",
    pose: "point_to_ui",
    audioSrc: "/audio/presentation/04-setvision.mp3",
    autoAdvance: true,
  },
  {
    id: "hawkerlens",
    durationMs: 5500,
    caption: "HawkerLens helps me understand what you eat.",
    pose: "point_to_ui",
    audioSrc: "/audio/presentation/05-hawkerlens.mp3",
    autoAdvance: true,
  },
  {
    id: "recovery",
    durationMs: 4500,
    caption: "Recovery tells me how ready you are.",
    pose: "point_to_ui",
    audioSrc: "/audio/presentation/06-recovery.mp3",
    autoAdvance: true,
  },
  {
    id: "dante_core",
    durationMs: 4500,
    caption: "I combine those signals to adapt the next decision.",
    pose: "explain_gesture",
    audioSrc: "/audio/presentation/07-dante-core.mp3",
    autoAdvance: true,
  },
  {
    id: "recommendation",
    durationMs: 5500,
    caption: "Fatigue is elevated today — here's how I'd adjust your next set.",
    pose: "explain_gesture",
    audioSrc: "/audio/presentation/08-recommendation.mp3",
    autoAdvance: true,
  },
  {
    id: "pose",
    durationMs: 2500,
    caption: "I am Dante.",
    pose: "front_double_biceps",
    audioSrc: "/audio/presentation/09-pose.mp3",
    autoAdvance: true,
  },
  {
    id: "handoff",
    durationMs: 4000,
    caption: "But technology is only part of the story. Duy Anh, take it from here.",
    pose: "handoff",
    audioSrc: "/audio/presentation/10-handoff.mp3",
    autoAdvance: false,
  },
  {
    id: "closed_loop",
    durationMs: 0,
    caption: "The closed loop: plan, train, adapt, improve.",
    pose: "explain_gesture",
    autoAdvance: false,
  },
];

export const INTRO_TOTAL_MS = PRESENTATION_SCRIPT.filter((b) => b.autoAdvance).reduce(
  (sum, b) => sum + b.durationMs,
  0,
);
