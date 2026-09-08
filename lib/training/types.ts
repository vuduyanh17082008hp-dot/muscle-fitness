export type TrainingSplit =
  | "auto"
  | "full_body"
  | "upper_lower"
  | "push_pull_legs"
  | "ppl_upper_lower"
  | "arnold"
  | "torso_limbs"
  | "body_part"
  | "custom";

export type TrainingIntensity =
  | "conservative"
  | "moderate"
  | "hard"
  | "very_hard";

export type TrainingVolume =
  | "low"
  | "moderate"
  | "high";

export type FailureStyle =
  | "rare"
  | "isolation_only"
  | "selected_last_sets";

export type ExerciseStyle =
  | "mixed"
  | "machine"
  | "free_weights";

export type MuscleGroup =
  | "Chest"
  | "Upper Chest"
  | "Back Width"
  | "Back Thickness"
  | "Side Delts"
  | "Rear Delts"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Biceps"
  | "Triceps"
  | "Calves"
  | "Abs";

export type CustomSplitDay = {
  name: string;
  muscles: MuscleGroup[];
};

export type TrainingPreferences = {
  splitType: TrainingSplit;

  trainingDays: number;

  customSplit: CustomSplitDay[];

  priorityMuscles: MuscleGroup[];

  intensityStyle: TrainingIntensity;

  volumeStyle: TrainingVolume;

  failureStyle: FailureStyle;

  exerciseStyle: ExerciseStyle;

  excludedExercises: string[];

  targetSessionMinutes: number;
};

export type ClientTrainingProfile = {
  goal: string | null;

  experience: string | null;

  trainingDays: number;

  sessionDurationMinutes: number;

  trainingLocation: string | null;

  availableEquipment: string[];

  priorityMuscles: string[];

  physicalLimitations: string | null;
};

export type ExternalExercise = {
  id: string;

  externalId: number | null;

  name: string;

  description: string;

  muscles: string[];

  secondaryMuscles: string[];

  equipment: string[];

  category: string | null;

  kind:
    | "compound"
    | "isolation"
    | "unknown";

  source:
    | "wger"
    | "muscle-fitness";

  sourceUrl: string | null;

  license: string | null;
};

export type ProgramExercise = {
  id: string;

  name: string;

  targetMuscle: MuscleGroup;

  muscles: string[];

  secondaryMuscles: string[];

  equipment: string[];

  sets: number;

  reps: string;

  rir: string;

  rest: string;

  failureInstruction: string;

  exerciseReason: string;

  source: string;

  sourceUrl: string | null;

  license: string | null;
};

export type ProgramDay = {
  day: number;

  title: string;

  focus: MuscleGroup[];

  exercises: ProgramExercise[];
};

export type GeneratedProgram = {
  version: 1;

  generatedAt: string;

  splitType: TrainingSplit;

  goal: string;

  intensityStyle: TrainingIntensity;

  volumeStyle: TrainingVolume;

  failureStyle: FailureStyle;

  priorityMuscles: MuscleGroup[];

  trainingDays: number;

  sessionMinutes: number;

  days: ProgramDay[];

  externalSourceUsed: boolean;

  externalExerciseCount: number;
};

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "Chest",
  "Upper Chest",
  "Back Width",
  "Back Thickness",
  "Side Delts",
  "Rear Delts",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Biceps",
  "Triceps",
  "Calves",
  "Abs",
];

export const DEFAULT_TRAINING_PREFERENCES: TrainingPreferences =
  {
    splitType: "auto",

    trainingDays: 3,

    customSplit: [],

    priorityMuscles: [],

    intensityStyle:
      "moderate",

    volumeStyle:
      "moderate",

    failureStyle:
      "isolation_only",

    exerciseStyle:
      "mixed",

    excludedExercises: [],

    targetSessionMinutes: 60,
  };