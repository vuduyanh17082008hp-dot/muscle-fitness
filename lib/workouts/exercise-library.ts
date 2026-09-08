export type ExerciseDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced";

export type ExerciseLibraryItem = {
  id: string | null;

  name: string;

  description: string;

  primaryMuscle: string;

  secondaryMuscles: string[];

  equipment: string;

  difficulty:
    ExerciseDifficulty;

  movementPattern: string;

  source:
    | "muscle-fitness"
    | "wger";

  sourceUrl:
    | string
    | null;
};

export const LOCAL_EXERCISE_LIBRARY: ExerciseLibraryItem[] =
  [
    {
      id:
        "10000000-0000-4000-8000-000000000001",

      name:
        "Barbell Bench Press",

      description:
        "Horizontal pressing compound exercise.",

      primaryMuscle:
        "Chest",

      secondaryMuscles: [
        "Front Deltoids",
        "Triceps",
      ],

      equipment:
        "Barbell",

      difficulty:
        "intermediate",

      movementPattern:
        "Horizontal Push",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000002",

      name:
        "Incline Dumbbell Press",

      description:
        "Incline pressing exercise emphasizing the upper chest.",

      primaryMuscle:
        "Upper Chest",

      secondaryMuscles: [
        "Front Deltoids",
        "Triceps",
      ],

      equipment:
        "Dumbbells",

      difficulty:
        "intermediate",

      movementPattern:
        "Incline Push",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000003",

      name:
        "Machine Chest Press",

      description:
        "Stable machine chest press.",

      primaryMuscle:
        "Chest",

      secondaryMuscles: [
        "Triceps",
      ],

      equipment:
        "Machine",

      difficulty:
        "beginner",

      movementPattern:
        "Horizontal Push",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000004",

      name:
        "Cable Fly",

      description:
        "Chest isolation exercise.",

      primaryMuscle:
        "Chest",

      secondaryMuscles: [],

      equipment:
        "Cable",

      difficulty:
        "beginner",

      movementPattern:
        "Horizontal Adduction",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000005",

      name:
        "Cable Lateral Raise",

      description:
        "Side-delt isolation exercise.",

      primaryMuscle:
        "Side Deltoids",

      secondaryMuscles: [],

      equipment:
        "Cable",

      difficulty:
        "beginner",

      movementPattern:
        "Shoulder Abduction",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000006",

      name:
        "Reverse Pec Deck",

      description:
        "Rear-delt isolation exercise.",

      primaryMuscle:
        "Rear Deltoids",

      secondaryMuscles: [
        "Upper Back",
      ],

      equipment:
        "Machine",

      difficulty:
        "beginner",

      movementPattern:
        "Horizontal Abduction",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000007",

      name:
        "Lat Pulldown",

      description:
        "Vertical pulling movement for lat development.",

      primaryMuscle:
        "Latissimus Dorsi",

      secondaryMuscles: [
        "Biceps",
      ],

      equipment:
        "Cable",

      difficulty:
        "beginner",

      movementPattern:
        "Vertical Pull",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000008",

      name:
        "Chest-Supported Row",

      description:
        "Stable horizontal pulling movement.",

      primaryMuscle:
        "Upper Back",

      secondaryMuscles: [
        "Latissimus Dorsi",
        "Biceps",
      ],

      equipment:
        "Dumbbells",

      difficulty:
        "beginner",

      movementPattern:
        "Horizontal Pull",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000009",

      name:
        "Seated Cable Row",

      description:
        "Cable row for upper-back development.",

      primaryMuscle:
        "Upper Back",

      secondaryMuscles: [
        "Latissimus Dorsi",
        "Biceps",
      ],

      equipment:
        "Cable",

      difficulty:
        "beginner",

      movementPattern:
        "Horizontal Pull",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000010",

      name:
        "Leg Press",

      description:
        "Stable machine lower-body compound.",

      primaryMuscle:
        "Quadriceps",

      secondaryMuscles: [
        "Glutes",
      ],

      equipment:
        "Machine",

      difficulty:
        "beginner",

      movementPattern:
        "Squat",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000011",

      name:
        "Barbell Back Squat",

      description:
        "Free-weight squat compound.",

      primaryMuscle:
        "Quadriceps",

      secondaryMuscles: [
        "Glutes",
        "Hamstrings",
      ],

      equipment:
        "Barbell",

      difficulty:
        "intermediate",

      movementPattern:
        "Squat",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000012",

      name:
        "Seated Leg Curl",

      description:
        "Hamstring isolation exercise.",

      primaryMuscle:
        "Hamstrings",

      secondaryMuscles: [],

      equipment:
        "Machine",

      difficulty:
        "beginner",

      movementPattern:
        "Knee Flexion",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000013",

      name:
        "Romanian Deadlift",

      description:
        "Hip-hinge movement for hamstrings and glutes.",

      primaryMuscle:
        "Hamstrings",

      secondaryMuscles: [
        "Glutes",
      ],

      equipment:
        "Barbell",

      difficulty:
        "intermediate",

      movementPattern:
        "Hip Hinge",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000014",

      name:
        "Hip Thrust",

      description:
        "Hip-extension exercise emphasizing the glutes.",

      primaryMuscle:
        "Glutes",

      secondaryMuscles: [
        "Hamstrings",
      ],

      equipment:
        "Barbell",

      difficulty:
        "beginner",

      movementPattern:
        "Hip Extension",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000015",

      name:
        "EZ-Bar Curl",

      description:
        "Biceps isolation movement.",

      primaryMuscle:
        "Biceps",

      secondaryMuscles: [
        "Forearms",
      ],

      equipment:
        "EZ Bar",

      difficulty:
        "beginner",

      movementPattern:
        "Elbow Flexion",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000016",

      name:
        "Cable Triceps Pushdown",

      description:
        "Stable triceps isolation movement.",

      primaryMuscle:
        "Triceps",

      secondaryMuscles: [],

      equipment:
        "Cable",

      difficulty:
        "beginner",

      movementPattern:
        "Elbow Extension",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000017",

      name:
        "Overhead Cable Triceps Extension",

      description:
        "Lengthened-position triceps movement.",

      primaryMuscle:
        "Triceps",

      secondaryMuscles: [],

      equipment:
        "Cable",

      difficulty:
        "intermediate",

      movementPattern:
        "Elbow Extension",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000018",

      name:
        "Standing Calf Raise",

      description:
        "Calf isolation exercise.",

      primaryMuscle:
        "Calves",

      secondaryMuscles: [],

      equipment:
        "Machine",

      difficulty:
        "beginner",

      movementPattern:
        "Plantar Flexion",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },

    {
      id:
        "10000000-0000-4000-8000-000000000019",

      name:
        "Cable Crunch",

      description:
        "Loadable abdominal exercise.",

      primaryMuscle:
        "Abdominals",

      secondaryMuscles: [],

      equipment:
        "Cable",

      difficulty:
        "beginner",

      movementPattern:
        "Spinal Flexion",

      source:
        "muscle-fitness",

      sourceUrl:
        null,
    },
  ];