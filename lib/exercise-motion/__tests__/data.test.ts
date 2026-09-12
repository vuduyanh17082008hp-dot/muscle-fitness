import { describe, expect, it } from "vitest";

import { EXERCISE_MOTION_LIBRARY, getExerciseMotion } from "../data";
import { JOINT_IDS } from "../types";
import { LOCAL_EXERCISE_LIBRARY } from "@/lib/workouts/exercise-library";

describe("EXERCISE_MOTION_LIBRARY", () => {
  it("gives every animation at least 2 phases so the player has something to interpolate between", () => {
    for (const [id, motion] of Object.entries(EXERCISE_MOTION_LIBRARY)) {
      expect(motion.phases.length, `${id} should have >= 2 phases`).toBeGreaterThanOrEqual(2);
    }
  });

  it("defines every joint on every phase's pose (no silently-missing coordinates)", () => {
    for (const [id, motion] of Object.entries(EXERCISE_MOTION_LIBRARY)) {
      for (const phase of motion.phases) {
        for (const joint of JOINT_IDS) {
          const point = phase.pose[joint];
          expect(point, `${id} phase "${phase.id}" is missing joint "${joint}"`).toBeDefined();
          expect(Number.isFinite(point.x), `${id} phase "${phase.id}" joint "${joint}".x is not finite`).toBe(true);
          expect(Number.isFinite(point.y), `${id} phase "${phase.id}" joint "${joint}".y is not finite`).toBe(true);
        }
      }
    }
  });

  it("keys every dataset by its own id", () => {
    for (const [key, motion] of Object.entries(EXERCISE_MOTION_LIBRARY)) {
      expect(motion.id).toBe(key);
    }
  });

  it("getExerciseMotion returns null for missing/undefined ids rather than throwing", () => {
    expect(getExerciseMotion(undefined)).toBeNull();
    expect(getExerciseMotion(null)).toBeNull();
    expect(getExerciseMotion("not-a-real-exercise")).toBeNull();
  });

  it("every animationId on LOCAL_EXERCISE_LIBRARY has matching verified motion data", () => {
    const exercisesWithAnimation = LOCAL_EXERCISE_LIBRARY.filter((exercise) => exercise.animationId);

    expect(exercisesWithAnimation.length).toBeGreaterThan(0);

    for (const exercise of exercisesWithAnimation) {
      expect(
        EXERCISE_MOTION_LIBRARY[exercise.animationId as string],
        `${exercise.name} references animationId "${exercise.animationId}" with no motion data`,
      ).toBeDefined();
    }
  });

  it("covers the 13 required flagship exercises", () => {
    const requiredIds = [
      "bench-press",
      "chest-press",
      "lat-pulldown",
      "seated-cable-row",
      "squat",
      "leg-press",
      "romanian-deadlift",
      "shoulder-press",
      "lateral-raise",
      "biceps-curl",
      "triceps-pushdown",
      "push-up",
      "plank",
    ];

    for (const id of requiredIds) {
      expect(EXERCISE_MOTION_LIBRARY[id], `missing required animation "${id}"`).toBeDefined();
    }
  });
});
