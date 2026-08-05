import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Filter,
  Layers3,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   TYPES
========================================================= */

type ExerciseDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced";

type ExerciseLibraryItem = {
  id: string;
  slug: string;
  name: string;
  description: string;

  bodyPart: string;
  primaryMuscle: string;
  secondaryMuscles: string[];

  equipment: string;
  difficulty: ExerciseDifficulty;
  movementPattern: string;

  instructions: string[];
  coachingCues: string[];
};

type ExerciseLibraryPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    muscle?: string | string[];
    equipment?: string | string[];
    difficulty?: string | string[];
  }>;
};

/* =========================================================
   LOCAL EXERCISE LIBRARY
========================================================= */

const EXERCISE_LIBRARY: ExerciseLibraryItem[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "barbell-bench-press",
    name: "Barbell Bench Press",
    description:
      "Compound horizontal press for building chest, shoulder and triceps strength.",
    bodyPart: "Upper Body",
    primaryMuscle: "Chest",
    secondaryMuscles: [
      "Front Deltoids",
      "Triceps",
    ],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Horizontal Push",
    instructions: [
      "Lie on the bench with both feet firmly planted.",
      "Retract your shoulder blades and grip the bar securely.",
      "Lower the bar toward the lower chest under control.",
      "Press upward while maintaining full-body tension.",
    ],
    coachingCues: [
      "Keep your shoulder blades retracted.",
      "Maintain stable leg drive.",
      "Do not bounce the bar off your chest.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    description:
      "Incline pressing movement that places greater emphasis on the upper chest.",
    bodyPart: "Upper Body",
    primaryMuscle: "Upper Chest",
    secondaryMuscles: [
      "Front Deltoids",
      "Triceps",
    ],
    equipment: "Dumbbells",
    difficulty: "intermediate",
    movementPattern: "Incline Push",
    instructions: [
      "Set the bench to a low incline.",
      "Hold the dumbbells beside your upper chest.",
      "Press the dumbbells upward and slightly inward.",
      "Lower them slowly until the chest is stretched.",
    ],
    coachingCues: [
      "Avoid setting the bench too steep.",
      "Keep your wrists stacked over your elbows.",
      "Control the lowering phase.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "machine-chest-press",
    name: "Machine Chest Press",
    description:
      "Stable machine press that allows controlled chest training with reduced balance demands.",
    bodyPart: "Upper Body",
    primaryMuscle: "Chest",
    secondaryMuscles: [
      "Front Deltoids",
      "Triceps",
    ],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Horizontal Push",
    instructions: [
      "Adjust the seat so the handles align with the middle chest.",
      "Keep your back against the pad.",
      "Press the handles forward without aggressively locking the elbows.",
      "Return under control.",
    ],
    coachingCues: [
      "Keep your chest lifted.",
      "Avoid shrugging the shoulders.",
      "Use a controlled range of motion.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    slug: "cable-fly",
    name: "Cable Fly",
    description:
      "Cable isolation movement for training the chest through horizontal adduction.",
    bodyPart: "Upper Body",
    primaryMuscle: "Chest",
    secondaryMuscles: [
      "Front Deltoids",
    ],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Horizontal Adduction",
    instructions: [
      "Stand between two cable pulleys.",
      "Maintain a slight bend in the elbows.",
      "Bring both hands together in front of the chest.",
      "Return slowly into the stretched position.",
    ],
    coachingCues: [
      "Move through the shoulders, not the elbows.",
      "Keep your rib cage controlled.",
      "Do not let the weights pull you backward.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    slug: "barbell-overhead-press",
    name: "Barbell Overhead Press",
    description:
      "Vertical compound press for developing shoulder and triceps strength.",
    bodyPart: "Upper Body",
    primaryMuscle: "Shoulders",
    secondaryMuscles: [
      "Triceps",
      "Upper Chest",
      "Core",
    ],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Vertical Push",
    instructions: [
      "Begin with the bar at upper-chest height.",
      "Brace your core before pressing.",
      "Press the bar vertically overhead.",
      "Finish with the bar stacked over the shoulders.",
    ],
    coachingCues: [
      "Avoid excessive lower-back extension.",
      "Keep the ribs controlled.",
      "Move your head slightly forward at lockout.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    slug: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    description:
      "Isolation exercise for building the side deltoids with continuous cable tension.",
    bodyPart: "Shoulders",
    primaryMuscle: "Side Deltoids",
    secondaryMuscles: [
      "Upper Trapezius",
    ],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Shoulder Abduction",
    instructions: [
      "Stand beside a low cable pulley.",
      "Hold the handle with the outside arm.",
      "Raise the arm until approximately shoulder height.",
      "Lower the cable slowly.",
    ],
    coachingCues: [
      "Lead with the elbow.",
      "Keep the shoulder away from the ear.",
      "Avoid swinging your torso.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    slug: "reverse-pec-deck",
    name: "Reverse Pec Deck",
    description:
      "Machine isolation movement for the rear deltoids and upper back.",
    bodyPart: "Shoulders",
    primaryMuscle: "Rear Deltoids",
    secondaryMuscles: [
      "Rhomboids",
      "Middle Trapezius",
    ],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Horizontal Abduction",
    instructions: [
      "Sit facing the machine pad.",
      "Grip the handles with the arms near shoulder height.",
      "Drive the arms outward and backward.",
      "Return under control.",
    ],
    coachingCues: [
      "Avoid excessive shrugging.",
      "Keep your chest against the pad.",
      "Pause briefly at peak contraction.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    slug: "lat-pulldown",
    name: "Lat Pulldown",
    description:
      "Vertical pulling exercise for developing the lats, upper back and biceps.",
    bodyPart: "Back",
    primaryMuscle: "Latissimus Dorsi",
    secondaryMuscles: [
      "Biceps",
      "Rear Deltoids",
      "Upper Back",
    ],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Vertical Pull",
    instructions: [
      "Grip the bar slightly wider than shoulder width.",
      "Begin with the arms extended.",
      "Pull the elbows down toward the sides.",
      "Return slowly to the stretched position.",
    ],
    coachingCues: [
      "Drive through the elbows.",
      "Avoid excessive torso movement.",
      "Allow the lats to stretch at the top.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000009",
    slug: "chest-supported-row",
    name: "Chest-Supported Row",
    description:
      "Supported horizontal row for building the upper back without lower-back fatigue.",
    bodyPart: "Back",
    primaryMuscle: "Upper Back",
    secondaryMuscles: [
      "Latissimus Dorsi",
      "Rear Deltoids",
      "Biceps",
    ],
    equipment: "Dumbbells",
    difficulty: "beginner",
    movementPattern: "Horizontal Pull",
    instructions: [
      "Lie chest-down on an inclined bench.",
      "Allow the arms to extend naturally.",
      "Pull the dumbbells toward the lower ribs.",
      "Lower the weights under control.",
    ],
    coachingCues: [
      "Keep your chest against the bench.",
      "Avoid excessive shrugging.",
      "Pause briefly at the top.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000010",
    slug: "seated-cable-row",
    name: "Seated Cable Row",
    description:
      "Cable horizontal pull for training the lats, upper back and elbow flexors.",
    bodyPart: "Back",
    primaryMuscle: "Upper Back",
    secondaryMuscles: [
      "Latissimus Dorsi",
      "Biceps",
      "Rear Deltoids",
    ],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Horizontal Pull",
    instructions: [
      "Sit upright with the feet secured.",
      "Begin with the arms extended.",
      "Pull the handle toward the abdomen.",
      "Return without allowing the torso to collapse.",
    ],
    coachingCues: [
      "Keep the chest tall.",
      "Pull through the elbows.",
      "Avoid leaning too far backward.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000011",
    slug: "barbell-back-squat",
    name: "Barbell Back Squat",
    description:
      "Compound lower-body movement for developing the quadriceps, glutes and trunk.",
    bodyPart: "Lower Body",
    primaryMuscle: "Quadriceps",
    secondaryMuscles: [
      "Glutes",
      "Hamstrings",
      "Core",
    ],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Squat",
    instructions: [
      "Position the bar securely across the upper back.",
      "Brace your torso before descending.",
      "Bend the hips and knees to reach a controlled depth.",
      "Drive through the floor to return to standing.",
    ],
    coachingCues: [
      "Keep the knees tracking over the toes.",
      "Maintain balanced foot pressure.",
      "Brace before every repetition.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000012",
    slug: "leg-press",
    name: "Leg Press",
    description:
      "Machine-based compound exercise for lower-body hypertrophy.",
    bodyPart: "Lower Body",
    primaryMuscle: "Quadriceps",
    secondaryMuscles: [
      "Glutes",
      "Hamstrings",
    ],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Squat",
    instructions: [
      "Place both feet securely on the platform.",
      "Release the safety mechanism.",
      "Lower the platform to a controlled depth.",
      "Press upward without aggressively locking the knees.",
    ],
    coachingCues: [
      "Keep your lower back against the pad.",
      "Do not allow the knees to collapse inward.",
      "Use a controlled range of motion.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000013",
    slug: "romanian-deadlift",
    name: "Romanian Deadlift",
    description:
      "Hip-hinge exercise for the hamstrings, glutes and posterior chain.",
    bodyPart: "Lower Body",
    primaryMuscle: "Hamstrings",
    secondaryMuscles: [
      "Glutes",
      "Erector Spinae",
      "Forearms",
    ],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Hip Hinge",
    instructions: [
      "Hold the bar close to the thighs.",
      "Maintain a slight bend in the knees.",
      "Push the hips backward while keeping the spine neutral.",
      "Extend the hips to return to standing.",
    ],
    coachingCues: [
      "Keep the bar close to your body.",
      "Do not turn the movement into a squat.",
      "Stop when the hamstrings reach a strong stretch.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000014",
    slug: "seated-leg-curl",
    name: "Seated Leg Curl",
    description:
      "Knee-flexion isolation exercise for developing the hamstrings.",
    bodyPart: "Lower Body",
    primaryMuscle: "Hamstrings",
    secondaryMuscles: [
      "Gastrocnemius",
    ],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Knee Flexion",
    instructions: [
      "Adjust the seat so the knee aligns with the machine pivot.",
      "Secure the thigh pad.",
      "Curl the lower leg downward.",
      "Return slowly to the stretched position.",
    ],
    coachingCues: [
      "Keep your hips against the seat.",
      "Avoid using momentum.",
      "Control the stretched position.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000015",
    slug: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    description:
      "Single-leg squat variation for building quadriceps, glutes and stability.",
    bodyPart: "Lower Body",
    primaryMuscle: "Quadriceps",
    secondaryMuscles: [
      "Glutes",
      "Hamstrings",
      "Core",
    ],
    equipment: "Dumbbells",
    difficulty: "intermediate",
    movementPattern: "Single-Leg Squat",
    instructions: [
      "Place the rear foot on a bench.",
      "Position the front foot far enough forward for balance.",
      "Lower the rear knee toward the floor.",
      "Drive through the front foot to stand.",
    ],
    coachingCues: [
      "Keep most of the pressure on the front leg.",
      "Control the descent.",
      "Do not allow the front knee to collapse inward.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000016",
    slug: "standing-calf-raise",
    name: "Standing Calf Raise",
    description:
      "Ankle plantar-flexion exercise for developing the calves.",
    bodyPart: "Lower Body",
    primaryMuscle: "Calves",
    secondaryMuscles: [],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Plantar Flexion",
    instructions: [
      "Place the balls of the feet securely on the platform.",
      "Lower the heels into a controlled stretch.",
      "Raise the heels as high as possible.",
      "Pause before returning downward.",
    ],
    coachingCues: [
      "Avoid bouncing.",
      "Pause at the top.",
      "Use the complete available range.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000017",
    slug: "ez-bar-curl",
    name: "EZ-Bar Curl",
    description:
      "Elbow-flexion exercise for building the biceps and brachialis.",
    bodyPart: "Arms",
    primaryMuscle: "Biceps",
    secondaryMuscles: [
      "Brachialis",
      "Forearms",
    ],
    equipment: "EZ Bar",
    difficulty: "beginner",
    movementPattern: "Elbow Flexion",
    instructions: [
      "Hold the EZ bar with an underhand grip.",
      "Keep the upper arms close to the torso.",
      "Curl the bar upward.",
      "Lower the bar under control.",
    ],
    coachingCues: [
      "Avoid swinging your torso.",
      "Keep the elbows stable.",
      "Control the eccentric phase.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000018",
    slug: "incline-dumbbell-curl",
    name: "Incline Dumbbell Curl",
    description:
      "Biceps curl variation that trains the elbow flexors from a lengthened position.",
    bodyPart: "Arms",
    primaryMuscle: "Biceps",
    secondaryMuscles: [
      "Brachialis",
      "Forearms",
    ],
    equipment: "Dumbbells",
    difficulty: "intermediate",
    movementPattern: "Elbow Flexion",
    instructions: [
      "Lie back on an inclined bench.",
      "Allow the arms to hang naturally.",
      "Curl the dumbbells without moving the upper arms forward.",
      "Lower slowly to full elbow extension.",
    ],
    coachingCues: [
      "Keep the shoulders behind the torso.",
      "Avoid swinging.",
      "Control the bottom position.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000019",
    slug: "cable-triceps-pushdown",
    name: "Cable Triceps Pushdown",
    description:
      "Cable isolation exercise for building the triceps.",
    bodyPart: "Arms",
    primaryMuscle: "Triceps",
    secondaryMuscles: [],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Elbow Extension",
    instructions: [
      "Hold the attachment with the elbows beside the torso.",
      "Extend the elbows until the arms are straight.",
      "Contract the triceps at the bottom.",
      "Return under control.",
    ],
    coachingCues: [
      "Keep the elbows fixed.",
      "Avoid excessive torso movement.",
      "Fully extend the elbows.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000020",
    slug: "overhead-cable-triceps-extension",
    name: "Overhead Cable Triceps Extension",
    description:
      "Overhead elbow-extension movement that emphasises the long head of the triceps.",
    bodyPart: "Arms",
    primaryMuscle: "Triceps",
    secondaryMuscles: [],
    equipment: "Cable",
    difficulty: "intermediate",
    movementPattern: "Elbow Extension",
    instructions: [
      "Face away from the cable stack.",
      "Position the arms overhead.",
      "Extend the elbows until the arms are straight.",
      "Return into a controlled stretch.",
    ],
    coachingCues: [
      "Keep the upper arms stable.",
      "Avoid excessive back extension.",
      "Control the stretched position.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000021",
    slug: "cable-crunch",
    name: "Cable Crunch",
    description:
      "Weighted spinal-flexion exercise for developing the abdominal muscles.",
    bodyPart: "Core",
    primaryMuscle: "Abdominals",
    secondaryMuscles: [
      "Obliques",
    ],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Spinal Flexion",
    instructions: [
      "Kneel while holding the cable near the head.",
      "Keep the hips relatively stable.",
      "Bring the ribs toward the pelvis.",
      "Return slowly without losing abdominal tension.",
    ],
    coachingCues: [
      "Move through the spine rather than the hips.",
      "Keep the cable close to the head.",
      "Exhale during the contraction.",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000022",
    slug: "hanging-knee-raise",
    name: "Hanging Knee Raise",
    description:
      "Core exercise combining hip flexion with controlled pelvic movement.",
    bodyPart: "Core",
    primaryMuscle: "Abdominals",
    secondaryMuscles: [
      "Hip Flexors",
      "Forearms",
    ],
    equipment: "Pull-Up Bar",
    difficulty: "intermediate",
    movementPattern: "Hip Flexion",
    instructions: [
      "Hang from the bar with the body stable.",
      "Raise the knees toward the torso.",
      "Curl the pelvis slightly upward.",
      "Lower the legs without swinging.",
    ],
    coachingCues: [
      "Avoid using momentum.",
      "Control the lowering phase.",
      "Think about bringing the pelvis toward the ribs.",
    ],
  },
];

/* =========================================================
   HELPERS
========================================================= */

function getSearchParameter(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function uniqueSortedValues(
  values: string[],
): string[] {
  return [...new Set(values)].sort(
    (first, second) =>
      first.localeCompare(second),
  );
}

function getDifficultyClasses(
  difficulty: ExerciseDifficulty,
): string {
  switch (difficulty) {
    case "beginner":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";

    case "advanced":
      return "border-red-500/25 bg-red-500/10 text-red-300";

    default:
      return "border-orange-500/25 bg-orange-500/10 text-orange-300";
  }
}

function matchesSearch(
  exercise: ExerciseLibraryItem,
  query: string,
): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  const searchableText = [
    exercise.name,
    exercise.description,
    exercise.bodyPart,
    exercise.primaryMuscle,
    exercise.secondaryMuscles.join(" "),
    exercise.equipment,
    exercise.difficulty,
    exercise.movementPattern,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

/* =========================================================
   PAGE
========================================================= */

export default async function ExerciseLibraryPage({
  searchParams,
}: ExerciseLibraryPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      `/login?next=${encodeURIComponent(
        "/dashboard/workouts/library",
      )}`,
    );
  }

  const resolvedSearchParams = await searchParams;

  const query = getSearchParameter(
    resolvedSearchParams.q,
  );

  const muscle = getSearchParameter(
    resolvedSearchParams.muscle,
  );

  const equipment = getSearchParameter(
    resolvedSearchParams.equipment,
  );

  const difficulty = getSearchParameter(
    resolvedSearchParams.difficulty,
  );

  const muscleOptions = uniqueSortedValues(
    EXERCISE_LIBRARY.map(
      (exercise) => exercise.primaryMuscle,
    ),
  );

  const equipmentOptions = uniqueSortedValues(
    EXERCISE_LIBRARY.map(
      (exercise) => exercise.equipment,
    ),
  );

  const filteredExercises =
    EXERCISE_LIBRARY.filter((exercise) => {
      const matchesQuery = matchesSearch(
        exercise,
        query,
      );

      const matchesMuscle =
        !muscle ||
        muscle === "all" ||
        exercise.primaryMuscle === muscle;

      const matchesEquipment =
        !equipment ||
        equipment === "all" ||
        exercise.equipment === equipment;

      const matchesDifficulty =
        !difficulty ||
        difficulty === "all" ||
        exercise.difficulty === difficulty;

      return (
        matchesQuery &&
        matchesMuscle &&
        matchesEquipment &&
        matchesDifficulty
      );
    });

  const beginnerCount =
    EXERCISE_LIBRARY.filter(
      (exercise) =>
        exercise.difficulty === "beginner",
    ).length;

  const equipmentCount =
    equipmentOptions.length;

  const muscleCount =
    muscleOptions.length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      {/* Background */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="absolute right-[-240px] top-[-260px] h-[650px] w-[650px] rounded-full bg-orange-500/[0.07] blur-[150px]" />

        <div className="absolute bottom-[-320px] left-[-260px] h-[700px] w-[700px] rounded-full bg-red-500/[0.045] blur-[170px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,7,7,0.9)_82%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Navigation */}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/workouts"
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />

            Back to workouts
          </Link>

          <Link
            href="/dashboard/workouts/plans/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-400 px-5 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-300"
          >
            <Sparkles className="h-4 w-4" />

            Build workout plan
          </Link>
        </div>

        {/* Hero */}

        <header className="mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d]/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
                  <Dumbbell className="h-5 w-5 text-orange-400" />
                </span>

                <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                  Exercise database
                </p>
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Exercise Library
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
                Explore exercises by muscle,
                equipment, difficulty and movement
                pattern before adding them to your
                training programme.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
                Available exercises
              </p>

              <p className="mt-2 text-3xl font-black text-orange-300">
                {EXERCISE_LIBRARY.length}
              </p>
            </div>
          </div>
        </header>

        {/* Statistics */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<Dumbbell className="h-5 w-5" />}
            label="Exercises"
            value={EXERCISE_LIBRARY.length}
          />

          <StatCard
            icon={<Target className="h-5 w-5" />}
            label="Primary muscles"
            value={muscleCount}
          />

          <StatCard
            icon={<Layers3 className="h-5 w-5" />}
            label="Equipment types"
            value={equipmentCount}
          />

          <StatCard
            icon={
              <CheckCircle2 className="h-5 w-5" />
            }
            label="Beginner friendly"
            value={beginnerCount}
          />
        </section>

        {/* Filters */}

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
              <Filter className="h-5 w-5" />
            </span>

            <div>
              <h2 className="font-black">
                Filter exercises
              </h2>

              <p className="mt-1 text-xs text-zinc-600">
                Search by exercise, muscle or
                equipment.
              </p>
            </div>
          </div>

          <form
            action="/dashboard/workouts/library"
            method="get"
            className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5"
          >
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

              <input
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search exercise..."
                className="h-12 w-full rounded-xl border border-white/10 bg-black/40 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-700 hover:border-white/20 focus:border-orange-400/60 focus:ring-4 focus:ring-orange-500/10"
              />
            </label>

            <select
              name="muscle"
              defaultValue={muscle || "all"}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#111111] px-4 text-sm text-zinc-300 outline-none transition hover:border-white/20 focus:border-orange-400/60"
            >
              <option value="all">
                All muscles
              </option>

              {muscleOptions.map((option) => (
                <option
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              ))}
            </select>

            <select
              name="equipment"
              defaultValue={equipment || "all"}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#111111] px-4 text-sm text-zinc-300 outline-none transition hover:border-white/20 focus:border-orange-400/60"
            >
              <option value="all">
                All equipment
              </option>

              {equipmentOptions.map((option) => (
                <option
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              ))}
            </select>

            <select
              name="difficulty"
              defaultValue={difficulty || "all"}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#111111] px-4 text-sm text-zinc-300 outline-none transition hover:border-white/20 focus:border-orange-400/60"
            >
              <option value="all">
                All levels
              </option>

              <option value="beginner">
                Beginner
              </option>

              <option value="intermediate">
                Intermediate
              </option>

              <option value="advanced">
                Advanced
              </option>
            </select>

            <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-5 sm:flex-row">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-400 px-6 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-300"
              >
                <Search className="h-4 w-4" />

                Apply filters
              </button>

              <Link
                href="/dashboard/workouts/library"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-6 text-xs font-black uppercase tracking-[0.12em] text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                Clear filters
              </Link>
            </div>
          </form>
        </section>

        {/* Results heading */}

        <section className="mt-10">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.27em] text-orange-400">
                Exercise catalogue
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Available Exercises
              </h2>
            </div>

            <p className="text-sm text-zinc-600">
              {filteredExercises.length} of{" "}
              {EXERCISE_LIBRARY.length} exercises
            </p>
          </div>

          {filteredExercises.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-20 text-center">
              <Search className="mx-auto h-8 w-8 text-zinc-700" />

              <h3 className="mt-4 text-xl font-black text-zinc-300">
                No exercises found
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-600">
                Change your search term or remove
                some filters to see more exercises.
              </p>

              <Link
                href="/dashboard/workouts/library"
                className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-orange-400 px-5 text-xs font-black uppercase tracking-wider text-black transition hover:bg-orange-300"
              >
                Reset filters
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredExercises.map(
                (exercise) => (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                  />
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: number;
};

function StatCard({
  icon,
  label,
  value,
}: StatCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
        {icon}
      </div>

      <p className="mt-5 text-xs font-black uppercase tracking-wider text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black">
        {value}
      </p>
    </article>
  );
}

type ExerciseCardProps = {
  exercise: ExerciseLibraryItem;
};

function ExerciseCard({
  exercise,
}: ExerciseCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] transition hover:-translate-y-1 hover:border-orange-500/25 hover:shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
      <div className="relative border-b border-white/10 p-5">
        <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-40 w-40 rounded-full bg-orange-500/[0.07] blur-3xl" />

        <div className="relative flex items-start justify-between gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
            <Dumbbell className="h-5 w-5" />
          </span>

          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${getDifficultyClasses(
              exercise.difficulty,
            )}`}
          >
            {exercise.difficulty}
          </span>
        </div>

        <h3 className="relative mt-5 text-xl font-black text-zinc-100">
          {exercise.name}
        </h3>

        <p className="relative mt-2 text-sm leading-6 text-zinc-600">
          {exercise.description}
        </p>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="grid grid-cols-2 gap-3">
          <ExerciseDetail
            label="Primary muscle"
            value={exercise.primaryMuscle}
          />

          <ExerciseDetail
            label="Equipment"
            value={exercise.equipment}
          />

          <ExerciseDetail
            label="Body part"
            value={exercise.bodyPart}
          />

          <ExerciseDetail
            label="Movement"
            value={exercise.movementPattern}
          />
        </div>

        {exercise.secondaryMuscles.length > 0 ? (
          <div className="mt-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-700">
              Secondary muscles
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {exercise.secondaryMuscles.map(
                (muscle) => (
                  <span
                    key={muscle}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-zinc-500"
                  >
                    {muscle}
                  </span>
                ),
              )}
            </div>
          </div>
        ) : null}

        <details className="group/details mt-5 overflow-hidden rounded-xl border border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-500 transition hover:text-white">
            Technique guide

            <ChevronRight className="h-4 w-4 transition group-open/details:rotate-90" />
          </summary>

          <div className="space-y-5 border-t border-white/10 p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Instructions
              </p>

              <ol className="mt-3 space-y-2">
                {exercise.instructions.map(
                  (instruction, index) => (
                    <li
                      key={instruction}
                      className="flex gap-3 text-xs leading-6 text-zinc-500"
                    >
                      <span className="font-black text-orange-400">
                        {index + 1}.
                      </span>

                      <span>{instruction}</span>
                    </li>
                  ),
                )}
              </ol>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Coaching cues
              </p>

              <ul className="mt-3 space-y-2">
                {exercise.coachingCues.map(
                  (cue) => (
                    <li
                      key={cue}
                      className="flex gap-3 text-xs leading-6 text-zinc-500"
                    >
                      <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />

                      <span>{cue}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </details>

        <div className="mt-auto pt-5">
          <Link
            href="/dashboard/workouts/plans/new"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 text-xs font-black uppercase tracking-[0.1em] text-orange-300 transition hover:bg-orange-500/20"
          >
            Add to a workout plan

            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

type ExerciseDetailProps = {
  label: string;
  value: string;
};

function ExerciseDetail({
  label,
  value,
}: ExerciseDetailProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-700">
        {label}
      </p>

      <p className="mt-1 line-clamp-2 text-xs font-bold text-zinc-400">
        {value}
      </p>
    </div>
  );
}