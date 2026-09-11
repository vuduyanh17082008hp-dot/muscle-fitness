import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Gauge,
  Info,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  TimerReset,
  TrendingUp,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { PageVisual } from "@/components/visual/page-visual";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TYPES
========================================================= */

type Exercise = {
  id: string;

  name: string;

  muscle: string;

  secondaryMuscles?: string[];

  equipment: string[];

  category:
    | "compound"
    | "supported_compound"
    | "isolation";

  difficulty:
    | "beginner"
    | "intermediate"
    | "advanced";

  sets: {
    beginner: number;
    intermediate: number;
    advanced: number;
  };

  reps: string;

  rest: string;

  rir: string;

  tempo: string;

  setup: string[];

  execution: string[];

  cues: string[];

  mistakes: string[];

  purpose: string;
};

type PlannedExercise = {
  exercise: Exercise;
  sets: number;
};

type TrainingDay = {
  day: number;
  title: string;
  focus: string;
  exercises: PlannedExercise[];
};

type FitnessProfile = {
  height_cm: number | null;
  weight_kg: number | null;

  goal: string | null;

  experience: string | null;

  training_days: number | null;

  session_duration_minutes:
    | number
    | null;

  training_location:
    | string
    | null;

  available_equipment:
    string[];

  priority_muscles:
    string[];

  physical_limitations:
    | string
    | null;
};

/* =========================================================
   EXERCISE DATABASE
========================================================= */

const EXERCISES: Exercise[] = [
  /* =======================================================
     CHEST
  ======================================================= */

  {
    id: "incline-db-press",

    name:
      "Incline Dumbbell Press",

    muscle:
      "Upper Chest",

    secondaryMuscles: [
      "Front Delts",
      "Triceps",
    ],

    equipment: [
      "dumbbell",
      "bench",
      "gym",
    ],

    category:
      "compound",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "6–10",

    rest:
      "2–3 min",

    rir:
      "1–3 RIR",

    tempo:
      "2–3 sec eccentric",

    setup: [
      "Set the bench at roughly 20–35°.",
      "Plant both feet firmly on the floor.",
      "Keep shoulder blades controlled against the bench.",
      "Start with the dumbbells above the upper-chest line.",
    ],

    execution: [
      "Lower the dumbbells under control.",
      "Allow the elbows to travel slightly below the torso if comfortable.",
      "Press upward and slightly inward.",
      "Keep the upper chest loaded instead of shrugging the shoulders.",
    ],

    cues: [
      "Chest up.",
      "Control the stretch.",
      "Drive through the upper chest.",
      "Do not bounce.",
    ],

    mistakes: [
      "Bench angle too steep.",
      "Elbows excessively flared.",
      "Shrugging toward the ears.",
      "Cutting the eccentric short.",
    ],

    purpose:
      "Stable upper-chest compound for progressive overload.",
  },

  {
    id:
      "machine-chest-press",

    name:
      "Machine Chest Press",

    muscle:
      "Chest",

    secondaryMuscles: [
      "Triceps",
      "Front Delts",
    ],

    equipment: [
      "machine",
      "gym",
    ],

    category:
      "supported_compound",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "8–12",

    rest:
      "2–3 min",

    rir:
      "1–2 RIR",

    tempo:
      "Controlled eccentric",

    setup: [
      "Adjust the seat so the handles align with mid chest.",
      "Keep the upper back firmly supported.",
      "Set the shoulder blades comfortably back and down.",
    ],

    execution: [
      "Press forward without losing torso position.",
      "Control the return until the chest is comfortably stretched.",
      "Repeat through the same range every rep.",
    ],

    cues: [
      "Press through the chest.",
      "Keep shoulders away from ears.",
      "Same ROM every rep.",
    ],

    mistakes: [
      "Seat positioned too high or low.",
      "Shoulders rolling forward.",
      "Bouncing out of the stretch.",
    ],

    purpose:
      "Highly stable chest movement that allows hard hypertrophy sets.",
  },

  {
    id:
      "low-high-cable-fly",

    name:
      "Low-to-High Cable Fly",

    muscle:
      "Upper Chest",

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 3,
    },

    reps:
      "10–15",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "2–3 sec eccentric",

    setup: [
      "Set cables around low hip height.",
      "Take a small staggered stance.",
      "Maintain a soft bend in the elbows.",
    ],

    execution: [
      "Sweep the arms upward and inward.",
      "Finish around upper-chest or eye-line depending on anatomy.",
      "Return slowly into a chest stretch.",
    ],

    cues: [
      "Hug upward.",
      "Lead with the elbows.",
      "Do not turn it into a press.",
    ],

    mistakes: [
      "Excess elbow flexion.",
      "Shrugging.",
      "Using momentum.",
    ],

    purpose:
      "Upper-chest isolation using a different line of pull from pressing.",
  },

  /* =======================================================
     DELTS
  ======================================================= */

  {
    id:
      "cable-lateral-raise",

    name:
      "Cable Lateral Raise",

    muscle:
      "Side Delts",

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 4,
      advanced: 4,
    },

    reps:
      "10–20",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Controlled",

    setup: [
      "Place the cable low.",
      "Stand slightly away from the stack.",
      "Keep the shoulder relaxed rather than shrugged.",
    ],

    execution: [
      "Raise the arm out and slightly forward.",
      "Stop around shoulder height.",
      "Lower slowly while maintaining delt tension.",
    ],

    cues: [
      "Lead with the elbow.",
      "Reach outward.",
      "Keep traps quiet.",
    ],

    mistakes: [
      "Shrugging.",
      "Swinging the torso.",
      "Turning the movement into an upright row.",
    ],

    purpose:
      "High-tension side-delt movement for shoulder width.",
  },

  {
    id:
      "reverse-cable-fly",

    name:
      "Cable Reverse Fly",

    muscle:
      "Rear Delts",

    secondaryMuscles: [
      "Upper Back",
    ],

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "12–20",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Controlled",

    setup: [
      "Set cables around shoulder height.",
      "Keep the chest stable.",
      "Maintain only a slight elbow bend.",
    ],

    execution: [
      "Sweep the arms outward.",
      "Keep tension on the rear delts.",
      "Return slowly without allowing the stack to slam.",
    ],

    cues: [
      "Reach wide.",
      "Rear delts move the arms.",
      "Avoid excessive scapular retraction.",
    ],

    mistakes: [
      "Turning it into a row.",
      "Using momentum.",
      "Shrugging.",
    ],

    purpose:
      "Rear-delt isolation with constant cable tension.",
  },

  /* =======================================================
     LATS / BACK
  ======================================================= */

  {
    id:
      "single-arm-lat-pulldown",

    name:
      "Single-Arm Lat Pulldown",

    muscle:
      "Lats",

    equipment: [
      "cable",
      "lat pulldown",
      "gym",
    ],

    category:
      "supported_compound",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "8–12",

    rest:
      "90–120 sec",

    rir:
      "1–2 RIR",

    tempo:
      "Controlled eccentric",

    setup: [
      "Sit or kneel securely.",
      "Reach the working arm overhead.",
      "Allow a controlled lat stretch.",
    ],

    execution: [
      "Drive the elbow toward the hip.",
      "Keep the torso relatively stable.",
      "Return slowly to the stretched position.",
    ],

    cues: [
      "Elbow to hip.",
      "Stretch the lat.",
      "Do not curl the handle.",
    ],

    mistakes: [
      "Pulling primarily with the biceps.",
      "Excessive torso rotation.",
      "Stopping before the lat is stretched.",
    ],

    purpose:
      "Lat-biased vertical pull for back width.",
  },

  {
    id:
      "chest-supported-row",

    name:
      "Chest-Supported Row",

    muscle:
      "Upper Back",

    secondaryMuscles: [
      "Lats",
      "Rear Delts",
      "Biceps",
    ],

    equipment: [
      "machine",
      "dumbbell",
      "bench",
      "gym",
    ],

    category:
      "supported_compound",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 4,
      advanced: 4,
    },

    reps:
      "6–12",

    rest:
      "2–3 min",

    rir:
      "1–2 RIR",

    tempo:
      "Controlled eccentric",

    setup: [
      "Support the chest firmly.",
      "Use a grip that allows comfortable elbow travel.",
      "Start with the arms extended.",
    ],

    execution: [
      "Pull the elbows back.",
      "Allow the shoulder blades to move naturally.",
      "Control the eccentric into a full reach.",
    ],

    cues: [
      "Row through the elbows.",
      "Keep chest on support.",
      "Reach forward under control.",
    ],

    mistakes: [
      "Lifting the chest off the pad.",
      "Shortened ROM.",
      "Jerking the weight.",
    ],

    purpose:
      "Stable rowing pattern for back thickness.",
  },

  {
    id:
      "wide-cable-row",

    name:
      "Wide Cable Row",

    muscle:
      "Upper Back",

    secondaryMuscles: [
      "Rear Delts",
      "Traps",
    ],

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "supported_compound",

    difficulty:
      "intermediate",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "8–15",

    rest:
      "90–120 sec",

    rir:
      "1–2 RIR",

    tempo:
      "Controlled",

    setup: [
      "Use a wider handle or dual handles.",
      "Brace the torso.",
      "Start with the arms extended.",
    ],

    execution: [
      "Drive elbows outward and backward.",
      "Finish without excessive lumbar extension.",
      "Return to a controlled stretch.",
    ],

    cues: [
      "Elbows wide.",
      "Upper back drives.",
      "Stay braced.",
    ],

    mistakes: [
      "Leaning excessively.",
      "Shrugging.",
      "Pulling too low.",
    ],

    purpose:
      "Upper-back thickness using a wide elbow path.",
  },

  /* =======================================================
     BICEPS
  ======================================================= */

  {
    id:
      "bayesian-curl",

    name:
      "Bayesian Cable Curl",

    muscle:
      "Biceps — Long Head",

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "intermediate",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 3,
    },

    reps:
      "8–15",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Slow eccentric",

    setup: [
      "Stand slightly in front of the cable.",
      "Keep the working arm behind the torso.",
      "Maintain a stable shoulder.",
    ],

    execution: [
      "Curl without moving the upper arm forward.",
      "Squeeze the biceps.",
      "Lower into a controlled stretched position.",
    ],

    cues: [
      "Keep shoulder back.",
      "Curl, do not swing.",
      "Own the stretch.",
    ],

    mistakes: [
      "Shoulder drifting forward.",
      "Torso rotation.",
      "Using momentum.",
    ],

    purpose:
      "Lengthened-position biceps work emphasizing the long head.",
  },

  {
    id:
      "incline-db-curl",

    name:
      "Incline Dumbbell Curl",

    muscle:
      "Biceps",

    equipment: [
      "dumbbell",
      "bench",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 3,
    },

    reps:
      "8–15",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Slow eccentric",

    setup: [
      "Use a moderately inclined bench.",
      "Allow the arms to hang behind the torso.",
    ],

    execution: [
      "Curl while keeping the shoulders stable.",
      "Lower fully under control.",
    ],

    cues: [
      "Keep upper arm still.",
      "No swinging.",
    ],

    mistakes: [
      "Shoulders moving forward.",
      "Shortening the bottom range.",
    ],

    purpose:
      "Simple lengthened biceps isolation.",
  },

  /* =======================================================
     TRICEPS
  ======================================================= */

  {
    id:
      "overhead-cable-extension",

    name:
      "Overhead Cable Triceps Extension",

    muscle:
      "Triceps — Long Head",

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "8–15",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Controlled stretch",

    setup: [
      "Position the cable behind the body.",
      "Keep elbows comfortably overhead.",
      "Brace the torso.",
    ],

    execution: [
      "Extend the elbows fully.",
      "Return slowly into a deep triceps stretch.",
    ],

    cues: [
      "Move at the elbow.",
      "Keep ribs controlled.",
      "Own the stretch.",
    ],

    mistakes: [
      "Excessive elbow movement.",
      "Arching the lower back.",
      "Using momentum.",
    ],

    purpose:
      "Lengthened triceps work emphasizing the long head.",
  },

  {
    id:
      "triceps-pressdown",

    name:
      "Cable Triceps Pressdown",

    muscle:
      "Triceps",

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 3,
    },

    reps:
      "10–15",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Controlled",

    setup: [
      "Stand stable in front of the cable.",
      "Keep elbows beside the torso.",
    ],

    execution: [
      "Extend the elbows until the triceps are shortened.",
      "Return under control.",
    ],

    cues: [
      "Elbows pinned.",
      "Finish with triceps.",
    ],

    mistakes: [
      "Shoulder movement.",
      "Using bodyweight to push down.",
    ],

    purpose:
      "Stable shortened-position triceps isolation.",
  },

  /* =======================================================
     QUADS
  ======================================================= */

  {
    id:
      "hack-squat",

    name:
      "Hack Squat",

    muscle:
      "Quads",

    secondaryMuscles: [
      "Glutes",
    ],

    equipment: [
      "hack squat",
      "machine",
      "gym",
    ],

    category:
      "compound",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 4,
      advanced: 4,
    },

    reps:
      "6–12",

    rest:
      "2–4 min",

    rir:
      "1–3 RIR",

    tempo:
      "Controlled eccentric",

    setup: [
      "Place feet where the knees can travel comfortably.",
      "Keep the back supported.",
      "Brace before descending.",
    ],

    execution: [
      "Descend as deep as mobility and control allow.",
      "Allow controlled knee flexion.",
      "Drive through the platform without bouncing.",
    ],

    cues: [
      "Knees travel naturally.",
      "Stay controlled.",
      "Push through the whole foot.",
    ],

    mistakes: [
      "Cutting depth unnecessarily.",
      "Bouncing at the bottom.",
      "Losing foot pressure.",
    ],

    purpose:
      "Stable quad-biased compound that supports high effort.",
  },

  {
    id:
      "leg-extension",

    name:
      "Leg Extension",

    muscle:
      "Quads",

    equipment: [
      "leg extension",
      "machine",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "10–20",

    rest:
      "60–120 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Controlled",

    setup: [
      "Align the machine pivot with the knee.",
      "Secure the hips against the pad.",
    ],

    execution: [
      "Extend the knee smoothly.",
      "Control the return into knee flexion.",
    ],

    cues: [
      "Quads move the load.",
      "Stay seated firmly.",
    ],

    mistakes: [
      "Hips lifting.",
      "Kicking explosively.",
    ],

    purpose:
      "Direct quad isolation after compound work.",
  },

  /* =======================================================
     HAMSTRINGS
  ======================================================= */

  {
    id:
      "seated-leg-curl",

    name:
      "Seated Leg Curl",

    muscle:
      "Hamstrings",

    equipment: [
      "leg curl",
      "machine",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "8–15",

    rest:
      "90–120 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Slow eccentric",

    setup: [
      "Adjust the machine so the knee aligns with its pivot.",
      "Secure the thighs.",
    ],

    execution: [
      "Curl the pad down using the hamstrings.",
      "Control the return into the stretched position.",
    ],

    cues: [
      "Keep hips down.",
      "Pull through the hamstrings.",
    ],

    mistakes: [
      "Hips lifting.",
      "Rushing the eccentric.",
    ],

    purpose:
      "Lengthened hamstring isolation.",
  },

  {
    id:
      "romanian-deadlift",

    name:
      "Romanian Deadlift",

    muscle:
      "Hamstrings",

    secondaryMuscles: [
      "Glutes",
      "Erectors",
    ],

    equipment: [
      "barbell",
      "dumbbell",
      "gym",
    ],

    category:
      "compound",

    difficulty:
      "intermediate",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "6–10",

    rest:
      "2–4 min",

    rir:
      "2–3 RIR",

    tempo:
      "2–3 sec eccentric",

    setup: [
      "Stand tall with the load close to the thighs.",
      "Brace the trunk.",
      "Keep a soft knee bend.",
    ],

    execution: [
      "Push the hips backward.",
      "Lower until hamstrings are strongly loaded without losing spinal position.",
      "Drive the hips forward to stand.",
    ],

    cues: [
      "Hips back.",
      "Keep load close.",
      "Feel hamstrings stretch.",
    ],

    mistakes: [
      "Turning it into a squat.",
      "Rounding excessively.",
      "Chasing unnecessary depth.",
    ],

    purpose:
      "Hip-hinge movement loading the hamstrings at long muscle lengths.",
  },

  /* =======================================================
     GLUTES
  ======================================================= */

  {
    id:
      "bulgarian-split-squat",

    name:
      "Deep Bulgarian Split Squat",

    muscle:
      "Glutes",

    secondaryMuscles: [
      "Quads",
      "Adductors",
    ],

    equipment: [
      "dumbbell",
      "bench",
      "bodyweight",
      "gym",
      "home",
    ],

    category:
      "compound",

    difficulty:
      "intermediate",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 3,
    },

    reps:
      "8–12 / leg",

    rest:
      "2 min",

    rir:
      "1–2 RIR",

    tempo:
      "Controlled eccentric",

    setup: [
      "Set the rear foot on a bench.",
      "Choose a stance that allows stable depth.",
    ],

    execution: [
      "Descend under control.",
      "Allow the working hip to flex deeply.",
      "Drive through the lead leg.",
    ],

    cues: [
      "Stay balanced.",
      "Use the front leg.",
      "Control depth.",
    ],

    mistakes: [
      "Pushing excessively from the rear foot.",
      "Losing balance.",
    ],

    purpose:
      "Lengthened-position glute and leg training.",
  },

  {
    id:
      "hip-thrust",

    name:
      "Hip Thrust",

    muscle:
      "Glutes",

    equipment: [
      "barbell",
      "machine",
      "bench",
      "gym",
    ],

    category:
      "compound",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "8–15",

    rest:
      "90–150 sec",

    rir:
      "1–2 RIR",

    tempo:
      "Controlled",

    setup: [
      "Position the upper back securely.",
      "Set feet where full hip extension feels strong.",
    ],

    execution: [
      "Drive hips upward.",
      "Finish with the glutes rather than lumbar extension.",
      "Lower under control.",
    ],

    cues: [
      "Ribs down.",
      "Squeeze glutes.",
      "Do not overextend back.",
    ],

    mistakes: [
      "Hyperextending the spine.",
      "Feet too far or too close.",
    ],

    purpose:
      "Shortened-position glute overload.",
  },

  /* =======================================================
     CALVES
  ======================================================= */

  {
    id:
      "standing-calf-raise",

    name:
      "Standing Calf Raise",

    muscle:
      "Calves — Gastrocnemius",

    equipment: [
      "machine",
      "dumbbell",
      "gym",
      "home",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 3,
      intermediate: 4,
      advanced: 4,
    },

    reps:
      "8–15",

    rest:
      "60–120 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Pause in stretch",

    setup: [
      "Keep knees mostly extended.",
      "Use a stable support if necessary.",
    ],

    execution: [
      "Lower into a controlled calf stretch.",
      "Rise onto the toes.",
      "Pause briefly at the top.",
    ],

    cues: [
      "Full stretch.",
      "Drive through big toe.",
    ],

    mistakes: [
      "Bouncing.",
      "Partial ROM.",
    ],

    purpose:
      "Primary gastrocnemius calf movement.",
  },

  {
    id:
      "seated-calf-raise",

    name:
      "Seated Calf Raise",

    muscle:
      "Calves — Soleus",

    equipment: [
      "machine",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "10–20",

    rest:
      "60–90 sec",

    rir:
      "0–2 RIR",

    tempo:
      "Pause in stretch",

    setup: [
      "Sit with the knees bent.",
      "Position the forefoot securely.",
    ],

    execution: [
      "Lower the heel under control.",
      "Raise through full plantar flexion.",
    ],

    cues: [
      "Do not bounce.",
      "Own both ends of the ROM.",
    ],

    mistakes: [
      "Rushed repetitions.",
      "Short ROM.",
    ],

    purpose:
      "Bent-knee calf work emphasizing the soleus.",
  },

  /* =======================================================
     CORE
  ======================================================= */

  {
    id:
      "cable-crunch",

    name:
      "Cable Crunch",

    muscle:
      "Abs",

    equipment: [
      "cable",
      "gym",
    ],

    category:
      "isolation",

    difficulty:
      "beginner",

    sets: {
      beginner: 2,
      intermediate: 3,
      advanced: 4,
    },

    reps:
      "10–20",

    rest:
      "60–90 sec",

    rir:
      "1–2 RIR",

    tempo:
      "Controlled",

    setup: [
      "Kneel securely in front of the cable.",
      "Hold the rope near the head.",
    ],

    execution: [
      "Flex the trunk using the abdominals.",
      "Return without turning the movement into a hip hinge.",
    ],

    cues: [
      "Ribs toward pelvis.",
      "Abs shorten the torso.",
    ],

    mistakes: [
      "Pulling with the arms.",
      "Hip hinging instead of spinal flexion.",
    ],

    purpose:
      "Loadable abdominal flexion.",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function normalize(
  value: string
) {
  return value
    .toLowerCase()
    .trim();
}

function humanize(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "Not available";
  }

  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function getExperience(
  value:
    | string
    | null
):
  | "beginner"
  | "intermediate"
  | "advanced" {
  if (
    value ===
      "intermediate" ||
    value ===
      "advanced"
  ) {
    return value;
  }

  return "beginner";
}

/* =========================================================
   EQUIPMENT FILTER
========================================================= */

function exerciseAvailable(
  exercise: Exercise,
  fitness: FitnessProfile
) {
  const location =
    normalize(
      fitness.training_location ??
        ""
    );

  const equipment =
    fitness.available_equipment.map(
      normalize
    );

  /*
    Gym users are assumed to have
    standard gym equipment unless
    specifically configured otherwise.
  */

  if (location === "gym") {
    return true;
  }

  if (
    exercise.equipment.includes(
      "bodyweight"
    )
  ) {
    return true;
  }

  return exercise.equipment.some(
    (required) =>
      equipment.some(
        (available) =>
          available.includes(
            normalize(required)
          ) ||
          normalize(required).includes(
            available
          )
      )
  );
}

/* =========================================================
   GET EXERCISE
========================================================= */

function findExercise(
  id: string,
  fitness: FitnessProfile
) {
  const exercise =
    EXERCISES.find(
      (item) =>
        item.id === id
    );

  if (!exercise) {
    return null;
  }

  if (
    !exerciseAvailable(
      exercise,
      fitness
    )
  ) {
    return null;
  }

  return exercise;
}

/* =========================================================
   CREATE PLANNED EXERCISE
========================================================= */

function planned(
  id: string,
  fitness: FitnessProfile
): PlannedExercise | null {
  const exercise =
    findExercise(
      id,
      fitness
    );

  if (!exercise) {
    return null;
  }

  const experience =
    getExperience(
      fitness.experience
    );

  return {
    exercise,

    sets:
      exercise.sets[
        experience
      ],
  };
}

/* =========================================================
   CLEAN DAY
========================================================= */

function createDay(
  day: number,
  title: string,
  focus: string,
  ids: string[],
  fitness: FitnessProfile
): TrainingDay {
  return {
    day,
    title,
    focus,

    exercises: ids
      .map(
        (id) =>
          planned(
            id,
            fitness
          )
      )
      .filter(
        (
          item
        ): item is PlannedExercise =>
          item !== null
      ),
  };
}

/* =========================================================
   WEEKLY SPLIT ENGINE
========================================================= */

function createTrainingPlan(
  fitness: FitnessProfile
): TrainingDay[] {
  const days =
    Math.min(
      Math.max(
        fitness.training_days ??
          3,
        1
      ),
      7
    );

  /* =======================================================
     1 DAY
  ======================================================= */

  if (days === 1) {
    return [
      createDay(
        1,
        "Full Body",
        "Whole-body foundation",
        [
          "hack-squat",
          "incline-db-press",
          "single-arm-lat-pulldown",
          "seated-leg-curl",
          "cable-lateral-raise",
          "cable-crunch",
        ],
        fitness
      ),
    ];
  }

  /* =======================================================
     2 DAYS
  ======================================================= */

  if (days === 2) {
    return [
      createDay(
        1,
        "Upper Body",
        "Chest · Back · Delts · Arms",
        [
          "incline-db-press",
          "single-arm-lat-pulldown",
          "chest-supported-row",
          "cable-lateral-raise",
          "bayesian-curl",
          "overhead-cable-extension",
        ],
        fitness
      ),

      createDay(
        2,
        "Lower Body",
        "Quads · Hamstrings · Glutes · Calves",
        [
          "hack-squat",
          "romanian-deadlift",
          "leg-extension",
          "seated-leg-curl",
          "hip-thrust",
          "standing-calf-raise",
          "cable-crunch",
        ],
        fitness
      ),
    ];
  }

  /* =======================================================
     3 DAYS
  ======================================================= */

  if (days === 3) {
    return [
      createDay(
        1,
        "Full Body A",
        "Chest · Quads · Lats",
        [
          "incline-db-press",
          "hack-squat",
          "single-arm-lat-pulldown",
          "cable-lateral-raise",
          "seated-leg-curl",
          "overhead-cable-extension",
        ],
        fitness
      ),

      createDay(
        2,
        "Full Body B",
        "Back · Hamstrings · Chest",
        [
          "chest-supported-row",
          "romanian-deadlift",
          "machine-chest-press",
          "leg-extension",
          "reverse-cable-fly",
          "bayesian-curl",
        ],
        fitness
      ),

      createDay(
        3,
        "Full Body C",
        "Lower body · Upper chest · Back",
        [
          "hack-squat",
          "incline-db-press",
          "single-arm-lat-pulldown",
          "hip-thrust",
          "cable-lateral-raise",
          "cable-crunch",
        ],
        fitness
      ),
    ];
  }

  /* =======================================================
     4 DAYS
  ======================================================= */

  if (days === 4) {
    return [
      createDay(
        1,
        "Upper A",
        "Chest · Lats · Delts",
        [
          "incline-db-press",
          "single-arm-lat-pulldown",
          "machine-chest-press",
          "chest-supported-row",
          "cable-lateral-raise",
          "overhead-cable-extension",
        ],
        fitness
      ),

      createDay(
        2,
        "Lower A",
        "Quads · Hamstrings",
        [
          "hack-squat",
          "seated-leg-curl",
          "leg-extension",
          "romanian-deadlift",
          "standing-calf-raise",
          "cable-crunch",
        ],
        fitness
      ),

      createDay(
        3,
        "Upper B",
        "Back · Upper chest · Arms",
        [
          "chest-supported-row",
          "low-high-cable-fly",
          "single-arm-lat-pulldown",
          "reverse-cable-fly",
          "bayesian-curl",
          "triceps-pressdown",
        ],
        fitness
      ),

      createDay(
        4,
        "Lower B",
        "Glutes · Quads · Hamstrings",
        [
          "romanian-deadlift",
          "hack-squat",
          "hip-thrust",
          "seated-leg-curl",
          "leg-extension",
          "seated-calf-raise",
        ],
        fitness
      ),
    ];
  }

  /* =======================================================
     5 DAYS
  ======================================================= */

  if (days === 5) {
    return [
      createDay(
        1,
        "Push",
        "Chest · Side Delts · Triceps",
        [
          "incline-db-press",
          "machine-chest-press",
          "low-high-cable-fly",
          "cable-lateral-raise",
          "overhead-cable-extension",
          "triceps-pressdown",
        ],
        fitness
      ),

      createDay(
        2,
        "Pull",
        "Lats · Upper Back · Biceps",
        [
          "single-arm-lat-pulldown",
          "chest-supported-row",
          "wide-cable-row",
          "reverse-cable-fly",
          "bayesian-curl",
          "incline-db-curl",
        ],
        fitness
      ),

      createDay(
        3,
        "Legs",
        "Quads · Hamstrings · Glutes",
        [
          "hack-squat",
          "seated-leg-curl",
          "romanian-deadlift",
          "leg-extension",
          "hip-thrust",
          "standing-calf-raise",
        ],
        fitness
      ),

      createDay(
        4,
        "Upper",
        "Chest · Back · Delts",
        [
          "incline-db-press",
          "single-arm-lat-pulldown",
          "chest-supported-row",
          "cable-lateral-raise",
          "reverse-cable-fly",
          "overhead-cable-extension",
        ],
        fitness
      ),

      createDay(
        5,
        "Lower + Arms",
        "Legs · Biceps · Triceps",
        [
          "hack-squat",
          "seated-leg-curl",
          "leg-extension",
          "bayesian-curl",
          "triceps-pressdown",
          "cable-crunch",
        ],
        fitness
      ),
    ];
  }

  /* =======================================================
     6+ DAYS
  ======================================================= */

  return [
    createDay(
      1,
      "Push A",
      "Chest priority",
      [
        "incline-db-press",
        "machine-chest-press",
        "low-high-cable-fly",
        "cable-lateral-raise",
        "overhead-cable-extension",
      ],
      fitness
    ),

    createDay(
      2,
      "Pull A",
      "Lat width priority",
      [
        "single-arm-lat-pulldown",
        "chest-supported-row",
        "reverse-cable-fly",
        "bayesian-curl",
      ],
      fitness
    ),

    createDay(
      3,
      "Legs A",
      "Quad priority",
      [
        "hack-squat",
        "leg-extension",
        "seated-leg-curl",
        "standing-calf-raise",
        "cable-crunch",
      ],
      fitness
    ),

    createDay(
      4,
      "Push B",
      "Chest · Delts · Triceps",
      [
        "machine-chest-press",
        "low-high-cable-fly",
        "cable-lateral-raise",
        "overhead-cable-extension",
        "triceps-pressdown",
      ],
      fitness
    ),

    createDay(
      5,
      "Pull B",
      "Back thickness priority",
      [
        "chest-supported-row",
        "wide-cable-row",
        "single-arm-lat-pulldown",
        "reverse-cable-fly",
        "incline-db-curl",
      ],
      fitness
    ),

    createDay(
      6,
      "Legs B",
      "Hamstrings · Glutes",
      [
        "romanian-deadlift",
        "seated-leg-curl",
        "hip-thrust",
        "hack-squat",
        "seated-calf-raise",
      ],
      fitness
    ),
  ];
}

/* =========================================================
   PRIORITY MUSCLE SORTING
========================================================= */

function priorityScore(
  exercise: Exercise,
  priorities: string[]
) {
  const target =
    normalize(
      exercise.muscle
    );

  return priorities.some(
    (priority) => {
      const value =
        normalize(priority);

      return (
        target.includes(value) ||
        value.includes(target) ||
        exercise.secondaryMuscles
          ?.some((muscle) =>
            normalize(
              muscle
            ).includes(value)
          )
      );
    }
  )
    ? 1
    : 0;
}

function applyPriority(
  days: TrainingDay[],
  fitness: FitnessProfile
) {
  const priorities =
    fitness.priority_muscles ??
    [];

  if (
    priorities.length === 0
  ) {
    return days;
  }

  return days.map(
    (day) => ({
      ...day,

      exercises: [
        ...day.exercises,
      ].sort(
        (a, b) =>
          priorityScore(
            b.exercise,
            priorities
          ) -
          priorityScore(
            a.exercise,
            priorities
          )
      ),
    })
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function TrainingPage() {
  const supabase =
    await createClient();

  /* =======================================================
     AUTH
  ======================================================= */

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    redirect(
      "/login?next=/training"
    );
  }

  /* =======================================================
     FITNESS PROFILE
  ======================================================= */

  const {
    data: fitness,
    error:
      fitnessError,
  } =
    await supabase
      .from(
        "fitness_profiles"
      )
      .select(
        `
          height_cm,
          weight_kg,
          goal,
          experience,
          training_days,
          session_duration_minutes,
          training_location,
          available_equipment,
          priority_muscles,
          physical_limitations
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (fitnessError) {
    throw new Error(
      `Unable to load training profile: ${fitnessError.message}`
    );
  }

  if (!fitness) {
    redirect(
      "/onboarding"
    );
  }

  const trainingPlan =
    applyPriority(
      createTrainingPlan(
        fitness
      ),
      fitness
    );

  const totalWeeklySets =
    trainingPlan.reduce(
      (
        total,
        day
      ) =>
        total +
        day.exercises.reduce(
          (
            dayTotal,
            plannedExercise
          ) =>
            dayTotal +
            plannedExercise.sets,
          0
        ),
      0
    );

  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">

        {/* =================================================
            NAVIGATION
        ================================================= */}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/8 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />

            Dashboard
          </Link>

          <Link
            href="/chatbot"
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/20"
          >
            <Brain className="h-4 w-4" />

            Ask Dante
          </Link>
        </div>

        {/* =================================================
            HERO
        ================================================= */}

        <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-[#171717] via-[#0d0d0d] to-black p-7 sm:p-10">
          <PageVisual page="training" />

          <div className="relative z-10 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
            <div>
              <div className="flex items-center gap-2 text-amber-500">
                <Sparkles className="h-4 w-4" />

                <p className="text-xs font-black uppercase tracking-[0.3em]">
                  Personalized Training System
                </p>
              </div>

              <h1 className="mt-5 max-w-3xl text-4xl font-black uppercase leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Your training.
                <span className="block text-amber-500">
                  Built from your profile.
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                Exercise selection,
                working sets, repetition
                targets, rest periods,
                RIR and technique cues
                are organized around
                your current training
                profile.
              </p>
            </div>

            {/* PROFILE SUMMARY */}

            <div className="grid grid-cols-2 gap-3">
              <SummaryCard
                label="Goal"
                value={humanize(
                  fitness.goal
                )}
              />

              <SummaryCard
                label="Experience"
                value={humanize(
                  fitness.experience
                )}
              />

              <SummaryCard
                label="Frequency"
                value={`${fitness.training_days ?? 3}× / week`}
              />

              <SummaryCard
                label="Session"
                value={`${fitness.session_duration_minutes ?? 60} min`}
              />

              <SummaryCard
                label="Weekly sets"
                value={String(
                  totalWeeklySets
                )}
              />

              <SummaryCard
                label="Location"
                value={humanize(
                  fitness.training_location
                )}
              />
            </div>
          </div>
        </header>

        {/* =================================================
            PRIORITIES
        ================================================= */}

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <InfoCard
            icon={
              <Target className="h-5 w-5" />
            }
            title="Priority muscles"
            value={
              fitness
                .priority_muscles
                ?.length
                ? fitness
                    .priority_muscles
                    .join(", ")
                : "Balanced development"
            }
          />

          <InfoCard
            icon={
              <Dumbbell className="h-5 w-5" />
            }
            title="Available equipment"
            value={
              fitness
                .available_equipment
                ?.length
                ? fitness
                    .available_equipment
                    .join(", ")
                : fitness.training_location ===
                  "gym"
                ? "Standard gym equipment"
                : "Limited equipment"
            }
          />

          <InfoCard
            icon={
              <ShieldAlert className="h-5 w-5" />
            }
            title="Limitations"
            value={
              fitness
                .physical_limitations ||
              "No limitations reported"
            }
          />
        </section>

        {/* =================================================
            TRAINING PRINCIPLES
        ================================================= */}

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Gauge className="h-5 w-5 text-amber-500" />

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-500">
                Programming Rules
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                How to use this program
              </h2>
            </div>
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Rule
              title="Working sets"
              text="Warm-up sets do not count. The prescribed sets are challenging working sets."
            />

            <Rule
              title="RIR"
              text="RIR means Reps In Reserve. 2 RIR = stop when roughly two clean reps remain."
            />

            <Rule
              title="Rest"
              text="Heavy compounds generally receive more rest than isolation movements."
            />

            <Rule
              title="Execution"
              text="Use repeatable ROM, controlled eccentric and stable technique before adding load."
            />
          </div>
        </section>

        {/* =================================================
            WEEKLY PLAN
        ================================================= */}

        <section className="mt-10">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-500">
              Weekly Program
            </p>

            <h2 className="mt-2 text-3xl font-black uppercase">
              Your Training Split
            </h2>
          </div>

          <div className="space-y-8">
            {trainingPlan.map(
              (trainingDay) => (
                <article
                  key={
                    trainingDay.day
                  }
                  className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]"
                >
                  {/* DAY HEADER */}

                  <header className="border-b border-white/10 bg-white/3 px-6 py-5 sm:px-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-500">
                          Day{" "}
                          {
                            trainingDay.day
                          }
                        </p>

                        <h3 className="mt-2 text-2xl font-black uppercase">
                          {
                            trainingDay.title
                          }
                        </h3>
                      </div>

                      <p className="text-sm text-zinc-500">
                        {
                          trainingDay.focus
                        }
                      </p>
                    </div>
                  </header>

                  {/* EXERCISES */}

                  <div className="divide-y divide-white/8">
                    {trainingDay.exercises.map(
                      (
                        plannedExercise,
                        index
                      ) => (
                        <ExerciseCard
                          key={
                            plannedExercise
                              .exercise.id
                          }
                          index={
                            index
                          }
                          plannedExercise={
                            plannedExercise
                          }
                          priority={
                            priorityScore(
                              plannedExercise.exercise,
                              fitness.priority_muscles ??
                                []
                            ) >
                            0
                          }
                        />
                      )
                    )}
                  </div>
                </article>
              )
            )}
          </div>
        </section>

        {/* =================================================
            PROGRESSION
        ================================================= */}

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-7">
            <TrendingUp className="h-6 w-6 text-amber-500" />

            <h2 className="mt-4 text-2xl font-bold">
              Progressive overload
            </h2>

            <div className="mt-5 space-y-4 text-sm leading-7 text-zinc-400">
              <p>
                1. Keep the same
                technique and ROM.
              </p>

              <p>
                2. Progress toward
                the top of the rep
                range.
              </p>

              <p>
                3. Once all working
                sets reach the top
                of the range at the
                intended RIR, add a
                small amount of load.
              </p>

              <p>
                4. Do not add weight
                if execution quality
                deteriorates.
              </p>
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-7">
            <RotateCcw className="h-6 w-6 text-amber-500" />

            <h2 className="mt-4 text-2xl font-bold">
              Fatigue management
            </h2>

            <div className="mt-5 space-y-4 text-sm leading-7 text-zinc-400">
              <p>
                Reduce training load
                or volume when
                performance declines
                repeatedly across
                sessions.
              </p>

              <p>
                Technical compounds
                should generally be
                stopped further from
                failure than stable
                isolation movements.
              </p>

              <p>
                Joint pain is not a
                target-muscle
                stimulus. Change the
                movement if necessary.
              </p>
            </div>
          </article>
        </section>

        {/* =================================================
            SAFETY
        ================================================= */}

        <section className="mt-8 rounded-3xl border border-amber-500/15 bg-amber-500/5 p-6">
          <div className="flex gap-3">
            <Info className="mt-1 h-5 w-5 shrink-0 text-amber-500" />

            <p className="text-sm leading-7 text-zinc-400">
              This program is generated
              from the information you
              supplied. If you experience
              sharp pain, numbness,
              dizziness or other unusual
              symptoms, stop the exercise
              and seek an appropriate
              qualified professional.
          </p>
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-zinc-100">
        {value}
      </p>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  value,
}: {
  icon:
    React.ReactNode;
  title: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5">
      <div className="flex items-center gap-2 text-amber-500">
        {icon}

        <p className="text-xs font-black uppercase tracking-[0.2em]">
          {title}
        </p>
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-300">
        {value}
      </p>
    </article>
  );
}

function Rule({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl border border-white/8 bg-black/20 p-5">
      <CheckCircle2 className="h-5 w-5 text-amber-500" />

      <h3 className="mt-4 font-bold">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zinc-500">
        {text}
      </p>
    </article>
  );
}

/* =========================================================
   EXERCISE CARD
========================================================= */

function ExerciseCard({
  index,
  plannedExercise,
  priority,
}: {
  index: number;
  plannedExercise:
    PlannedExercise;
  priority: boolean;
}) {
  const {
    exercise,
    sets,
  } =
    plannedExercise;

  return (
    <div className="p-6 sm:p-8">
      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">

        {/* ===============================================
            SUMMARY
        =============================================== */}

        <div>
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-black">
              {String(
                index + 1
              ).padStart(
                2,
                "0"
              )}
            </span>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xl font-bold text-white">
                  {
                    exercise.name
                  }
                </h4>

                {priority && (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-500">
                    Priority
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm font-semibold text-amber-500">
                {
                  exercise.muscle
                }
              </p>

              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">
                {
                  exercise.purpose
                }
              </p>
            </div>
          </div>

          {/* TRAINING VARIABLES */}

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <TrainingMetric
              icon={
                <Dumbbell className="h-4 w-4" />
              }
              label="Sets"
              value={String(
                sets
              )}
            />

            <TrainingMetric
              icon={
                <Target className="h-4 w-4" />
              }
              label="Reps"
              value={
                exercise.reps
              }
            />

            <TrainingMetric
              icon={
                <Gauge className="h-4 w-4" />
              }
              label="RIR"
              value={
                exercise.rir
              }
            />

            <TrainingMetric
              icon={
                <Clock3 className="h-4 w-4" />
              }
              label="Rest"
              value={
                exercise.rest
              }
            />

            <TrainingMetric
              icon={
                <TimerReset className="h-4 w-4" />
              }
              label="Tempo"
              value={
                exercise.tempo
              }
            />
          </div>
        </div>

        {/* ===============================================
            TECHNIQUE DETAILS
        =============================================== */}

        <div className="grid gap-3 md:grid-cols-2">

          <TechniqueSection
            title="Setup"
            items={
              exercise.setup
            }
          />

          <TechniqueSection
            title="Execution"
            items={
              exercise.execution
            }
          />

          <TechniqueSection
            title="Coaching cues"
            items={
              exercise.cues
            }
            accent
          />

          <TechniqueSection
            title="Avoid"
            items={
              exercise.mistakes
            }
            warning
          />
        </div>
      </div>
    </div>
  );
}

function TrainingMetric({
  icon,
  label,
  value,
}: {
  icon:
    React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
      <div className="flex items-center gap-1.5 text-zinc-600">
        {icon}

        <span className="text-[10px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>

      <p className="mt-2 text-xs font-bold text-zinc-200">
        {value}
      </p>
    </div>
  );
}

function TechniqueSection({
  title,
  items,
  accent = false,
  warning = false,
}: {
  title: string;
  items: string[];
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-5">
      <p
        className={
          warning
            ? "text-xs font-black uppercase tracking-[0.18em] text-red-400"
            : accent
            ? "text-xs font-black uppercase tracking-[0.18em] text-amber-500"
            : "text-xs font-black uppercase tracking-[0.18em] text-zinc-500"
        }
      >
        {title}
      </p>

      <ul className="mt-4 space-y-2">
        {items.map(
          (item) => (
            <li
              key={item}
              className="flex gap-2 text-sm leading-6 text-zinc-400"
            >
              <span
                className={
                  warning
                    ? "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"
                    : accent
                    ? "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    : "mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600"
                }
              />

              {item}
            </li>
          )
        )}
      </ul>
    </div>
  );
}