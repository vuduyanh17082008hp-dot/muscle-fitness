/**
 * ONE canonical exercise-library data model, used by:
 *  - app/dashboard/workouts/plan-builder.tsx (exercise picker when
 *    building a plan)
 *  - app/dashboard/workouts/plans/new/page.tsx
 *  - lib/workouts/excercise/route.ts (API route)
 *  - app/dashboard/workouts/library/page.tsx (the technique library)
 *
 * Previously the library page kept its own hand-duplicated 22-item
 * copy of this list (same ids, richer fields) that had already
 * drifted from this file (3 extra exercises, `coachingCues` vs
 * nothing here at all). This file is now the single source of truth;
 * the library page imports from here instead of maintaining a parallel
 * copy — see components/training/exercise-technique-panel.tsx for how
 * the newer fields (safetyCues/commonMistakes/animationId/stabilizers)
 * feed the ExerciseMotionPlayer + MuscleMap.
 *
 * `animationId` is only set on exercises with verified, hand-authored
 * keyframe data in lib/exercise-motion/data.ts. Every other field
 * (instructions, safetyCues) is populated for all 24 exercises;
 * `commonMistakes`/`stabilizers` are populated only for the 13
 * flagship exercises that ship with an animation — for the rest, the
 * UI must show "Technique animation coming soon" rather than
 * inventing content, so those fields are intentionally left unset.
 */

export type ExerciseDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced";

export type ExerciseLibraryItem = {
  id: string | null;
  slug?: string;
  name: string;
  description: string;

  bodyPart?: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  /** Muscles that stabilize the movement without being a primary/secondary mover. */
  stabilizers?: string[];

  equipment: string;
  difficulty: ExerciseDifficulty;
  movementPattern: string;

  instructions?: string[];
  /** Form/safety cues — how to perform the rep safely and effectively. */
  safetyCues?: string[];
  /** Specific errors to watch for — distinct from safetyCues (what to do vs what goes wrong). */
  commonMistakes?: string[];

  /** Key into lib/exercise-motion/data.ts's EXERCISE_MOTION_LIBRARY, when verified motion data exists. */
  animationId?: string;

  alternatives?: string[];
  regressions?: string[];
  progressions?: string[];

  source: "muscle-fitness" | "wger";
  sourceUrl: string | null;
};

export const LOCAL_EXERCISE_LIBRARY: ExerciseLibraryItem[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "barbell-bench-press",
    name: "Barbell Bench Press",
    description:
      "Compound horizontal press for building chest, shoulder and triceps strength.",
    bodyPart: "Upper Body",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Deltoids", "Triceps"],
    stabilizers: ["Upper Back", "Abdominals"],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Horizontal Push",
    instructions: [
      "Lie on the bench with both feet firmly planted.",
      "Retract your shoulder blades and grip the bar securely.",
      "Lower the bar toward the lower chest under control.",
      "Press upward while maintaining full-body tension.",
    ],
    safetyCues: [
      "Keep your shoulder blades retracted.",
      "Maintain stable leg drive.",
      "Do not bounce the bar off your chest.",
    ],
    commonMistakes: [
      "Bouncing the bar off the chest.",
      "Flaring the elbows out to 90 degrees.",
      "Losing shoulder-blade retraction mid-set.",
    ],
    animationId: "bench-press",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    description:
      "Incline pressing movement that places greater emphasis on the upper chest.",
    bodyPart: "Upper Body",
    primaryMuscle: "Upper Chest",
    secondaryMuscles: ["Front Deltoids", "Triceps"],
    equipment: "Dumbbells",
    difficulty: "intermediate",
    movementPattern: "Incline Push",
    instructions: [
      "Set the bench to a low incline.",
      "Hold the dumbbells beside your upper chest.",
      "Press the dumbbells upward and slightly inward.",
      "Lower them slowly until the chest is stretched.",
    ],
    safetyCues: [
      "Avoid setting the bench too steep.",
      "Keep your wrists stacked over your elbows.",
      "Control the lowering phase.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "machine-chest-press",
    name: "Machine Chest Press",
    description:
      "Stable machine press that allows controlled chest training with reduced balance demands.",
    bodyPart: "Upper Body",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Deltoids", "Triceps"],
    stabilizers: ["Triceps", "Abdominals"],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Horizontal Push",
    instructions: [
      "Adjust the seat so the handles align with the middle chest.",
      "Keep your back against the pad.",
      "Press the handles forward without aggressively locking the elbows.",
      "Return under control.",
    ],
    safetyCues: [
      "Keep your chest lifted.",
      "Avoid shrugging the shoulders.",
      "Use a controlled range of motion.",
    ],
    commonMistakes: [
      "Aggressively locking out the elbows.",
      "Letting the shoulders round forward.",
      "Rushing the eccentric phase.",
    ],
    animationId: "chest-press",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    slug: "cable-fly",
    name: "Cable Fly",
    description:
      "Cable isolation movement for training the chest through horizontal adduction.",
    bodyPart: "Upper Body",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Deltoids"],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Horizontal Adduction",
    instructions: [
      "Stand between two cable pulleys.",
      "Maintain a slight bend in the elbows.",
      "Bring both hands together in front of the chest.",
      "Return slowly into the stretched position.",
    ],
    safetyCues: [
      "Move through the shoulders, not the elbows.",
      "Keep your rib cage controlled.",
      "Do not let the weights pull you backward.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    slug: "barbell-overhead-press",
    name: "Barbell Overhead Press",
    description:
      "Vertical compound press for developing shoulder and triceps strength.",
    bodyPart: "Upper Body",
    primaryMuscle: "Shoulders",
    secondaryMuscles: ["Triceps", "Upper Chest", "Core"],
    stabilizers: ["Abdominals", "Upper Back"],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Vertical Push",
    instructions: [
      "Begin with the bar at upper-chest height.",
      "Brace your core before pressing.",
      "Press the bar vertically overhead.",
      "Finish with the bar stacked over the shoulders.",
    ],
    safetyCues: [
      "Avoid excessive lower-back extension.",
      "Keep the ribs controlled.",
      "Move your head slightly forward at lockout.",
    ],
    commonMistakes: [
      "Overarching the lower back to press past a tight shoulder.",
      "Pressing the bar forward instead of vertically.",
      "Flaring the ribs up at lockout.",
    ],
    animationId: "shoulder-press",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    slug: "cable-lateral-raise",
    name: "Cable Lateral Raise",
    description:
      "Isolation exercise for building the side deltoids with continuous cable tension.",
    bodyPart: "Shoulders",
    primaryMuscle: "Side Deltoids",
    secondaryMuscles: ["Upper Trapezius"],
    stabilizers: ["Trapezius"],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Shoulder Abduction",
    instructions: [
      "Stand beside a low cable pulley.",
      "Hold the handle with the outside arm.",
      "Raise the arm until approximately shoulder height.",
      "Lower the cable slowly.",
    ],
    safetyCues: [
      "Lead with the elbow.",
      "Keep the shoulder away from the ear.",
      "Avoid swinging your torso.",
    ],
    commonMistakes: [
      "Using momentum by swinging the torso.",
      "Shrugging the shoulder up toward the ear.",
      "Raising the arm above shoulder height.",
    ],
    animationId: "lateral-raise",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    slug: "reverse-pec-deck",
    name: "Reverse Pec Deck",
    description:
      "Machine isolation movement for the rear deltoids and upper back.",
    bodyPart: "Shoulders",
    primaryMuscle: "Rear Deltoids",
    secondaryMuscles: ["Rhomboids", "Middle Trapezius"],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Horizontal Abduction",
    instructions: [
      "Sit facing the machine pad.",
      "Grip the handles with the arms near shoulder height.",
      "Drive the arms outward and backward.",
      "Return under control.",
    ],
    safetyCues: [
      "Avoid excessive shrugging.",
      "Keep your chest against the pad.",
      "Pause briefly at peak contraction.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    slug: "lat-pulldown",
    name: "Lat Pulldown",
    description:
      "Vertical pulling exercise for developing the lats, upper back and biceps.",
    bodyPart: "Back",
    primaryMuscle: "Latissimus Dorsi",
    secondaryMuscles: ["Biceps", "Rear Deltoids", "Upper Back"],
    stabilizers: ["Upper Back", "Abdominals"],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Vertical Pull",
    instructions: [
      "Grip the bar slightly wider than shoulder width.",
      "Begin with the arms extended.",
      "Pull the elbows down toward the sides.",
      "Return slowly to the stretched position.",
    ],
    safetyCues: [
      "Drive through the elbows.",
      "Avoid excessive torso movement.",
      "Allow the lats to stretch at the top.",
    ],
    commonMistakes: [
      "Leaning back excessively to use momentum.",
      "Pulling the bar behind the neck.",
      "Not allowing a full stretch at the top.",
    ],
    animationId: "lat-pulldown",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000009",
    slug: "chest-supported-row",
    name: "Chest-Supported Row",
    description:
      "Supported horizontal row for building the upper back without lower-back fatigue.",
    bodyPart: "Back",
    primaryMuscle: "Upper Back",
    secondaryMuscles: ["Latissimus Dorsi", "Rear Deltoids", "Biceps"],
    equipment: "Dumbbells",
    difficulty: "beginner",
    movementPattern: "Horizontal Pull",
    instructions: [
      "Lie chest-down on an inclined bench.",
      "Allow the arms to extend naturally.",
      "Pull the dumbbells toward the lower ribs.",
      "Lower the weights under control.",
    ],
    safetyCues: [
      "Keep your chest against the bench.",
      "Avoid excessive shrugging.",
      "Pause briefly at the top.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000010",
    slug: "seated-cable-row",
    name: "Seated Cable Row",
    description:
      "Cable horizontal pull for training the lats, upper back and elbow flexors.",
    bodyPart: "Back",
    primaryMuscle: "Upper Back",
    secondaryMuscles: ["Latissimus Dorsi", "Biceps", "Rear Deltoids"],
    stabilizers: ["Rear Deltoids", "Abdominals"],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Horizontal Pull",
    instructions: [
      "Sit upright with the feet secured.",
      "Begin with the arms extended.",
      "Pull the handle toward the abdomen.",
      "Return without allowing the torso to collapse.",
    ],
    safetyCues: [
      "Keep the chest tall.",
      "Pull through the elbows.",
      "Avoid leaning too far backward.",
    ],
    commonMistakes: [
      "Rounding the lower back to add range of motion.",
      "Using the arms only without engaging the back.",
      "Leaning too far backward at the finish.",
    ],
    animationId: "seated-cable-row",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000011",
    slug: "barbell-back-squat",
    name: "Barbell Back Squat",
    description:
      "Compound lower-body movement for developing the quadriceps, glutes and trunk.",
    bodyPart: "Lower Body",
    primaryMuscle: "Quadriceps",
    secondaryMuscles: ["Glutes", "Hamstrings", "Core"],
    stabilizers: ["Abdominals", "Lower Back"],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Squat",
    instructions: [
      "Position the bar securely across the upper back.",
      "Brace your torso before descending.",
      "Bend the hips and knees to reach a controlled depth.",
      "Drive through the floor to return to standing.",
    ],
    safetyCues: [
      "Keep the knees tracking over the toes.",
      "Maintain balanced foot pressure.",
      "Brace before every repetition.",
    ],
    commonMistakes: [
      "Letting the knees collapse inward.",
      "Losing a neutral spine at depth.",
      "Rising with the hips before the chest.",
    ],
    animationId: "squat",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000012",
    slug: "leg-press",
    name: "Leg Press",
    description:
      "Machine-based compound exercise for lower-body hypertrophy.",
    bodyPart: "Lower Body",
    primaryMuscle: "Quadriceps",
    secondaryMuscles: ["Glutes", "Hamstrings"],
    stabilizers: ["Abdominals"],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Squat",
    instructions: [
      "Place both feet securely on the platform.",
      "Release the safety mechanism.",
      "Lower the platform to a controlled depth.",
      "Press upward without aggressively locking the knees.",
    ],
    safetyCues: [
      "Keep your lower back against the pad.",
      "Do not allow the knees to collapse inward.",
      "Use a controlled range of motion.",
    ],
    commonMistakes: [
      "Letting the knees cave inward.",
      "Locking the knees out aggressively at the top.",
      "Lowering so far the lower back lifts off the pad.",
    ],
    animationId: "leg-press",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000013",
    slug: "romanian-deadlift",
    name: "Romanian Deadlift",
    description:
      "Hip-hinge exercise for the hamstrings, glutes and posterior chain.",
    bodyPart: "Lower Body",
    primaryMuscle: "Hamstrings",
    secondaryMuscles: ["Glutes", "Erector Spinae", "Forearms"],
    stabilizers: ["Upper Back", "Forearms"],
    equipment: "Barbell",
    difficulty: "intermediate",
    movementPattern: "Hip Hinge",
    instructions: [
      "Hold the bar close to the thighs.",
      "Maintain a slight bend in the knees.",
      "Push the hips backward while keeping the spine neutral.",
      "Extend the hips to return to standing.",
    ],
    safetyCues: [
      "Keep the bar close to your body.",
      "Do not turn the movement into a squat.",
      "Stop when the hamstrings reach a strong stretch.",
    ],
    commonMistakes: [
      "Rounding the lower back during the hinge.",
      "Turning the movement into a squat by bending the knees too much.",
      "Letting the bar drift away from the legs.",
    ],
    animationId: "romanian-deadlift",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000014",
    slug: "seated-leg-curl",
    name: "Seated Leg Curl",
    description:
      "Knee-flexion isolation exercise for developing the hamstrings.",
    bodyPart: "Lower Body",
    primaryMuscle: "Hamstrings",
    secondaryMuscles: ["Gastrocnemius"],
    equipment: "Machine",
    difficulty: "beginner",
    movementPattern: "Knee Flexion",
    instructions: [
      "Adjust the seat so the knee aligns with the machine pivot.",
      "Secure the thigh pad.",
      "Curl the lower leg downward.",
      "Return slowly to the stretched position.",
    ],
    safetyCues: [
      "Keep your hips against the seat.",
      "Avoid using momentum.",
      "Control the stretched position.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000015",
    slug: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    description:
      "Single-leg squat variation for building quadriceps, glutes and stability.",
    bodyPart: "Lower Body",
    primaryMuscle: "Quadriceps",
    secondaryMuscles: ["Glutes", "Hamstrings", "Core"],
    equipment: "Dumbbells",
    difficulty: "intermediate",
    movementPattern: "Single-Leg Squat",
    instructions: [
      "Place the rear foot on a bench.",
      "Position the front foot far enough forward for balance.",
      "Lower the rear knee toward the floor.",
      "Drive through the front foot to stand.",
    ],
    safetyCues: [
      "Keep most of the pressure on the front leg.",
      "Control the descent.",
      "Do not allow the front knee to collapse inward.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
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
    safetyCues: [
      "Avoid bouncing.",
      "Pause at the top.",
      "Use the complete available range.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000017",
    slug: "ez-bar-curl",
    name: "EZ-Bar Curl",
    description:
      "Elbow-flexion exercise for building the biceps and brachialis.",
    bodyPart: "Arms",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Brachialis", "Forearms"],
    stabilizers: ["Forearms"],
    equipment: "EZ Bar",
    difficulty: "beginner",
    movementPattern: "Elbow Flexion",
    instructions: [
      "Hold the EZ bar with an underhand grip.",
      "Keep the upper arms close to the torso.",
      "Curl the bar upward.",
      "Lower the bar under control.",
    ],
    safetyCues: [
      "Avoid swinging your torso.",
      "Keep the elbows stable.",
      "Control the eccentric phase.",
    ],
    commonMistakes: [
      "Swinging the torso to move the weight.",
      "Letting the elbows drift forward.",
      "Not fully extending the elbow at the bottom.",
    ],
    animationId: "biceps-curl",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000018",
    slug: "incline-dumbbell-curl",
    name: "Incline Dumbbell Curl",
    description:
      "Biceps curl variation that trains the elbow flexors from a lengthened position.",
    bodyPart: "Arms",
    primaryMuscle: "Biceps",
    secondaryMuscles: ["Brachialis", "Forearms"],
    equipment: "Dumbbells",
    difficulty: "intermediate",
    movementPattern: "Elbow Flexion",
    instructions: [
      "Lie back on an inclined bench.",
      "Allow the arms to hang naturally.",
      "Curl the dumbbells without moving the upper arms forward.",
      "Lower slowly to full elbow extension.",
    ],
    safetyCues: [
      "Keep the shoulders behind the torso.",
      "Avoid swinging.",
      "Control the bottom position.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
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
    stabilizers: ["Abdominals"],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Elbow Extension",
    instructions: [
      "Hold the attachment with the elbows beside the torso.",
      "Extend the elbows until the arms are straight.",
      "Contract the triceps at the bottom.",
      "Return under control.",
    ],
    safetyCues: [
      "Keep the elbows fixed.",
      "Avoid excessive torso movement.",
      "Fully extend the elbows.",
    ],
    commonMistakes: [
      "Letting the elbows drift away from the torso.",
      "Using body weight/leaning to move the bar.",
      "Not fully extending the elbows at the bottom.",
    ],
    animationId: "triceps-pushdown",
    source: "muscle-fitness",
    sourceUrl: null,
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
    safetyCues: [
      "Keep the upper arms stable.",
      "Avoid excessive back extension.",
      "Control the stretched position.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000021",
    slug: "cable-crunch",
    name: "Cable Crunch",
    description:
      "Weighted spinal-flexion exercise for developing the abdominal muscles.",
    bodyPart: "Core",
    primaryMuscle: "Abdominals",
    secondaryMuscles: ["Obliques"],
    equipment: "Cable",
    difficulty: "beginner",
    movementPattern: "Spinal Flexion",
    instructions: [
      "Kneel while holding the cable near the head.",
      "Keep the hips relatively stable.",
      "Bring the ribs toward the pelvis.",
      "Return slowly without losing abdominal tension.",
    ],
    safetyCues: [
      "Move through the spine rather than the hips.",
      "Keep the cable close to the head.",
      "Exhale during the contraction.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000022",
    slug: "hanging-knee-raise",
    name: "Hanging Knee Raise",
    description:
      "Core exercise combining hip flexion with controlled pelvic movement.",
    bodyPart: "Core",
    primaryMuscle: "Abdominals",
    secondaryMuscles: ["Hip Flexors", "Forearms"],
    equipment: "Pull-Up Bar",
    difficulty: "intermediate",
    movementPattern: "Hip Flexion",
    instructions: [
      "Hang from the bar with the body stable.",
      "Raise the knees toward the torso.",
      "Curl the pelvis slightly upward.",
      "Lower the legs without swinging.",
    ],
    safetyCues: [
      "Avoid using momentum.",
      "Control the lowering phase.",
      "Think about bringing the pelvis toward the ribs.",
    ],
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000023",
    slug: "push-up",
    name: "Push-Up",
    description:
      "Bodyweight horizontal pressing exercise for the chest, shoulders and triceps.",
    bodyPart: "Upper Body",
    primaryMuscle: "Chest",
    secondaryMuscles: ["Front Deltoids", "Triceps", "Abdominals"],
    stabilizers: ["Abdominals", "Lower Back"],
    equipment: "Bodyweight",
    difficulty: "beginner",
    movementPattern: "Horizontal Push",
    instructions: [
      "Start in a high plank with hands slightly wider than shoulder width.",
      "Keep the body in a straight line from head to heels.",
      "Lower the chest toward the floor by bending the elbows.",
      "Press back up to full arm extension without losing the plank line.",
    ],
    safetyCues: [
      "Keep the core braced throughout.",
      "Avoid letting the hips sag or pike up.",
      "Keep the elbows at roughly 45 degrees from the torso.",
    ],
    commonMistakes: [
      "Letting the hips drop below the shoulder-to-heel line.",
      "Flaring the elbows out to 90 degrees.",
      "Only lowering partway instead of a full range of motion.",
    ],
    animationId: "push-up",
    source: "muscle-fitness",
    sourceUrl: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000024",
    slug: "plank",
    name: "Plank",
    description:
      "Isometric core-stability hold maintaining a straight line from head to heels.",
    bodyPart: "Core",
    primaryMuscle: "Abdominals",
    secondaryMuscles: ["Lower Back", "Glutes"],
    stabilizers: ["Shoulders", "Quadriceps"],
    equipment: "Bodyweight",
    difficulty: "beginner",
    movementPattern: "Isometric Hold",
    instructions: [
      "Rest on the forearms and toes with elbows under the shoulders.",
      "Squeeze the glutes and brace the abdominals.",
      "Keep the body in a straight line from head to heels.",
      "Hold the position while breathing steadily.",
    ],
    safetyCues: [
      "Keep the neck neutral, looking at the floor just ahead of the hands.",
      "Avoid holding the breath.",
      "Stop before form breaks down.",
    ],
    commonMistakes: [
      "Letting the hips sag toward the floor.",
      "Piking the hips up to reduce core demand.",
      "Holding the breath instead of breathing steadily.",
    ],
    animationId: "plank",
    source: "muscle-fitness",
    sourceUrl: null,
  },
];
