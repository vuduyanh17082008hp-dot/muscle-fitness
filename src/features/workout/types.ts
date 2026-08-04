export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms"
  | "traps";

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "other";

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type Exercise = {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  difficulty: Difficulty;
  instructions: string[];
  techniqueCues: string[];
  mediaUrl?: string;
  mediaType?: "image" | "video";
  contraindications: string[];
};

export type PlanExercise = {
  id: string;
  exerciseId: string;
  order: number;
  sets: number;
  repMin: number;
  repMax: number;
  /** Prefer RIR when set; otherwise use RPE */
  targetRir?: number;
  targetRpe?: number;
  restSeconds: number;
  /** e.g. "3-1-2-0" (eccentric-pause-concentric-pause) */
  tempo?: string;
  coachNotes?: string;
};

export type WorkoutDay = {
  id: string;
  name: string;
  order: number;
  exercises: PlanExercise[];
};

export type WorkoutPlan = {
  id: string;
  name: string;
  description: string;
  days: WorkoutDay[];
  createdAt: string;
  updatedAt: string;
};

export type LoggedSet = {
  id: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  rir?: number;
  completed: boolean;
  completedAt?: string;
  skipped?: boolean;
};

export type SessionExercise = {
  id: string;
  exerciseId: string;
  order: number;
  plannedSets: number;
  repMin: number;
  repMax: number;
  targetRir?: number;
  targetRpe?: number;
  restSeconds: number;
  tempo?: string;
  coachNotes?: string;
  replacedFromExerciseId?: string;
  skipped: boolean;
  sets: LoggedSet[];
  previousBest?: {
    weightKg: number;
    reps: number;
    estimated1Rm: number;
    completedAt: string;
  };
};

export type WorkoutSession = {
  id: string;
  planId?: string;
  dayId?: string;
  name: string;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt?: string;
  exercises: SessionExercise[];
  notes?: string;
  deload?: boolean;
};

export type NextSessionRecommendation = {
  sessionName: string;
  summary: string;
  adjustments: Array<{
    exerciseId: string;
    exerciseName: string;
    action: "increase_weight" | "increase_reps" | "hold" | "deload" | "swap";
    detail: string;
    suggestedWeightKg?: number;
    suggestedRepMin?: number;
    suggestedRepMax?: number;
  }>;
  deloadSuggested: boolean;
};

export type WorkoutDatabase = {
  exercises: Exercise[];
  plans: WorkoutPlan[];
  sessions: WorkoutSession[];
};
