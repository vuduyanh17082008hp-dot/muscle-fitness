import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/** Pre-hackathon micro-fix: player clock in the athlete zone, action-specific set feedback, no blank-load sets. */

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/dashboard/workouts/actions", () => ({
  finishWorkoutAction: vi.fn(),
  replaceSessionExerciseAction: vi.fn(),
  saveWorkoutSetAction: vi.fn(),
  skipSessionExerciseAction: vi.fn(),
}));

import { requiresExplicitLoad, setSaveMessage } from "@/features/workouts/calculations";
import { WorkoutPlayer } from "@/features/workouts/workout-player";

describe("set feedback names the action that happened", () => {
  it("log, undo and edit each get their own message", () => {
    expect(setSaveMessage(false, true)).toBe("Set saved.");
    expect(setSaveMessage(true, false)).toBe("Set undone — it no longer counts.");
    expect(setSaveMessage(true, true)).toBe("Changes saved.");
  });
});

describe("explicit load is required only where the equipment carries one", () => {
  it.each(["dumbbell", "barbell", "cable", "machine", "ez_bar", "kettlebell"])("%s needs a weight", (eq) => {
    expect(requiresExplicitLoad(eq)).toBe(true);
  });
  it.each(["bodyweight", "pull_up_bar", " Bodyweight "])("%s can be logged without one", (eq) => {
    expect(requiresExplicitLoad(eq)).toBe(false);
  });
});

describe("player header clock uses the athlete time zone, not the server's", () => {
  const render = (timeZone: string) =>
    renderToStaticMarkup(createElement(WorkoutPlayer, {
      sessionId: "s1", sessionName: "Full Body B", startedAt: "2026-10-28T09:14:31Z", timeZone,
      allowSubstitution: false, initialExercises: [], replacementOptions: [],
    })).toLowerCase();

  it.each([
    ["Asia/Singapore", "05:14 pm"],
    ["Asia/Ho_Chi_Minh", "04:14 pm"],
    ["America/Los_Angeles", "02:14 am"],
  ])("%s", (tz, clock) => {
    expect(render(tz)).toContain(clock);
  });
});
