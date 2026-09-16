import { describe, expect, it } from "vitest";
import { preferenceSchema, generatedProgramSchema } from "../preferences-schema";
import { generateTrainingProgram } from "../program-engine";
import { DEFAULT_TRAINING_PREFERENCES, type ClientTrainingProfile, type TrainingSplit } from "../types";

const profile: ClientTrainingProfile = {
  goal: "muscle_gain", experience: "beginner", trainingDays: 3,
  sessionDurationMinutes: 60, trainingLocation: "gym", availableEquipment: [],
  priorityMuscles: [], physicalLimitations: null,
};

describe("persisted program validation", () => {
  it("accepts actual deterministic generator output", () => {
    const splits: TrainingSplit[] = ["auto", "full_body", "upper_lower", "push_pull_legs", "ppl_upper_lower", "arnold", "torso_limbs", "body_part"];
    for (const splitType of splits) {
      for (let trainingDays = 2; trainingDays <= 7; trainingDays++) {
        const program = generateTrainingProgram(profile, { ...DEFAULT_TRAINING_PREFERENCES, splitType, trainingDays }, []);
        expect(generatedProgramSchema.safeParse(program).success, `${splitType}/${trainingDays}`).toBe(true);
      }
    }
  });

  it("rejects corrupt nested programs and unsafe source links", () => {
    const program = generateTrainingProgram(profile, DEFAULT_TRAINING_PREFERENCES, []);
    expect(generatedProgramSchema.safeParse({ ...program, days: "corrupt" }).success).toBe(false);
    program.days[0].exercises[0].sourceUrl = "javascript:alert(1)";
    expect(generatedProgramSchema.safeParse(program).success).toBe(false);
  });

  it("requires a nonempty, distinct muscle list and one day per custom training day", () => {
    const preferences = { ...DEFAULT_TRAINING_PREFERENCES, splitType: "custom" };
    expect(preferenceSchema.safeParse(preferences).success).toBe(false);
    const customSplit = ["A", "B", "C"].map((name) => ({ name, muscles: ["Chest"] }));
    expect(preferenceSchema.safeParse({ ...preferences, customSplit }).success).toBe(true);
    customSplit[0].muscles = [];
    expect(preferenceSchema.safeParse({ ...preferences, customSplit }).success).toBe(false);
    customSplit[0].muscles = ["Chest", "Chest"];
    expect(preferenceSchema.safeParse({ ...preferences, customSplit }).success).toBe(false);
  });
});
