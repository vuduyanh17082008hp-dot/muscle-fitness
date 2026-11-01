import type { ExerciseDifficulty, ExerciseLibraryItem } from "@/lib/workouts/exercise-library";

/**
 * Muscle Intelligence 2.0 / Adaptive Workouts 2.0 — hypertrophy catalogue additions.
 *
 * Built-ins here get the same deterministic-uuid identity as the original 24
 * (10000000-0000-4000-8000-0000000000NN) and are seeded by
 * supabase/migrations/20261101120000_hypertrophy_catalogue.sql, which inserts
 * only — it never re-keys an existing row, so no historical record changes id.
 *
 * Every entry is a candidate, not a ranking: the per-exercise profile that drives
 * recommendations lives in lib/workouts/exercise-profiles.ts.
 */

type Draft = {
  n: number;
  slug: string;
  name: string;
  description: string;
  bodyPart: string;
  primary: string;
  secondary: string[];
  equipment: string;
  difficulty: ExerciseDifficulty;
  pattern: string;
  instructions: string[];
  safety: string[];
};

function builtIn(d: Draft): ExerciseLibraryItem {
  return {
    id: `10000000-0000-4000-8000-${String(d.n).padStart(12, "0")}`,
    slug: d.slug,
    name: d.name,
    description: d.description,
    bodyPart: d.bodyPart,
    primaryMuscle: d.primary,
    secondaryMuscles: d.secondary,
    equipment: d.equipment,
    difficulty: d.difficulty,
    movementPattern: d.pattern,
    instructions: d.instructions,
    safetyCues: d.safety,
    source: "muscle-fitness",
    sourceUrl: null,
  };
}

export const CATALOGUE_ADDITIONS: ExerciseLibraryItem[] = [
  // ---- Chest ----
  builtIn({
    n: 25, slug: "smith-incline-press", name: "Smith Machine Incline Press",
    description: "Incline press on a fixed bar path, emphasising the upper chest with low balance demand.",
    bodyPart: "Upper Body", primary: "Upper Chest", secondary: ["Front Deltoids", "Triceps"],
    equipment: "Smith Machine", difficulty: "beginner", pattern: "Incline Push",
    instructions: ["Set a bench at a low incline under the bar.", "Unrack with hands just outside shoulder width.", "Lower the bar under control to the upper chest.", "Press back up along the fixed path."],
    safety: ["Set the safety stops before you start.", "Keep the shoulder blades set against the bench."],
  }),
  builtIn({
    n: 26, slug: "converging-machine-chest-press", name: "Converging Machine Chest Press",
    description: "Machine press whose handles move inward as you press, training the chest with a guided path.",
    bodyPart: "Upper Body", primary: "Chest", secondary: ["Front Deltoids", "Triceps"],
    equipment: "Machine", difficulty: "beginner", pattern: "Horizontal Push",
    instructions: ["Adjust the seat so the handles line up with mid-chest.", "Keep the upper back against the pad.", "Press forward and slightly together.", "Return slowly until the chest is stretched."],
    safety: ["Keep the wrists straight.", "Stop the lowering where the shoulders still feel stable."],
  }),
  builtIn({
    n: 27, slug: "seated-cable-fly", name: "Seated Cable Fly",
    description: "Chest fly from a seat or bench between two cable stacks — isolation with the torso supported.",
    bodyPart: "Upper Body", primary: "Chest", secondary: ["Front Deltoids"],
    equipment: "Cable", difficulty: "beginner", pattern: "Horizontal Adduction",
    instructions: ["Sit between the cable stacks with handles at chest height.", "Keep a slight, fixed bend in the elbows.", "Bring the hands together in an arc.", "Open back out under control."],
    safety: ["Keep the elbow angle fixed — this is not a press.", "Use a stretch you can control, not a forced one."],
  }),
  builtIn({
    n: 28, slug: "incline-machine-chest-press", name: "Incline Machine Chest Press",
    description: "Guided incline press that emphasises the upper chest with minimal setup.",
    bodyPart: "Upper Body", primary: "Upper Chest", secondary: ["Front Deltoids", "Triceps"],
    equipment: "Machine", difficulty: "beginner", pattern: "Incline Push",
    instructions: ["Set the seat so the handles start near the upper chest.", "Keep the back on the pad.", "Press up and forward.", "Return slowly."],
    safety: ["Avoid shrugging the shoulders toward the ears.", "Control the return."],
  }),
  builtIn({
    n: 29, slug: "flat-dumbbell-press", name: "Flat Dumbbell Press",
    description: "Free-weight chest press on a flat bench; each arm works independently.",
    bodyPart: "Upper Body", primary: "Chest", secondary: ["Front Deltoids", "Triceps"],
    equipment: "Dumbbells", difficulty: "intermediate", pattern: "Horizontal Push",
    instructions: ["Kick the dumbbells up to the chest as you lie back.", "Plant the feet and set the shoulder blades.", "Lower until the chest is stretched.", "Press up, finishing with the dumbbells over the chest."],
    safety: ["Learn to set the dumbbells down safely before using heavier loads.", "Keep the wrists stacked over the elbows."],
  }),
  builtIn({
    n: 30, slug: "incline-push-up", name: "Incline Push-Up",
    description: "Push-up with the hands on a bench or box — a scalable bodyweight chest press.",
    bodyPart: "Upper Body", primary: "Chest", secondary: ["Front Deltoids", "Triceps"],
    equipment: "Bodyweight", difficulty: "beginner", pattern: "Horizontal Push",
    instructions: ["Place the hands on a stable bench slightly wider than the shoulders.", "Walk the feet back into a straight line.", "Lower the chest to the bench edge.", "Press back up."],
    safety: ["Use a bench or box that cannot slide.", "Keep the hips in line with the shoulders."],
  }),

  // ---- Back ----
  builtIn({
    n: 31, slug: "neutral-grip-lat-pulldown", name: "Neutral-Grip Lat Pulldown",
    description: "Lat pulldown with a parallel (palms-facing) handle — a stable, adjustable vertical pull.",
    bodyPart: "Upper Body", primary: "Latissimus Dorsi", secondary: ["Biceps", "Upper Back", "Rear Deltoids"],
    equipment: "Cable", difficulty: "beginner", pattern: "Vertical Pull",
    instructions: ["Secure the thighs under the pad.", "Grip the neutral handle with palms facing each other.", "Pull the handle to the upper chest, elbows driving down.", "Let the arms extend fully overhead under control."],
    safety: ["Avoid leaning far back to move the weight.", "Keep the neck neutral."],
  }),
  builtIn({
    n: 32, slug: "single-arm-cable-pulldown", name: "Single-Arm Cable Pulldown",
    description: "One-arm pulldown that lets the lat work through a long range on each side.",
    bodyPart: "Upper Body", primary: "Latissimus Dorsi", secondary: ["Biceps", "Upper Back"],
    equipment: "Cable", difficulty: "intermediate", pattern: "Vertical Pull",
    instructions: ["Set a cable high and kneel or sit facing it.", "Reach up with one arm, letting the lat stretch.", "Pull the elbow down toward the hip.", "Return to a full reach."],
    safety: ["Keep the torso still — don't twist to finish the rep.", "Match the reps on both sides."],
  }),
  builtIn({
    n: 33, slug: "assisted-pull-up", name: "Assisted Pull-Up",
    description: "Pull-up on a counterweight machine, letting you train the movement below full bodyweight.",
    bodyPart: "Upper Body", primary: "Latissimus Dorsi", secondary: ["Biceps", "Upper Back"],
    equipment: "Machine", difficulty: "beginner", pattern: "Vertical Pull",
    instructions: ["Choose an assistance setting and kneel or stand on the platform.", "Grip the handles just outside shoulder width.", "Pull until the chin clears the handles.", "Lower to a full hang under control."],
    safety: ["More assistance = easier; adjust before the set, not during.", "Step off the platform carefully."],
  }),
  builtIn({
    n: 34, slug: "chest-supported-t-bar-row", name: "Chest-Supported T-Bar Row",
    description: "Row with the chest on a pad, training the upper back without a lower-back hold.",
    bodyPart: "Upper Body", primary: "Upper Back", secondary: ["Latissimus Dorsi", "Rear Deltoids", "Biceps"],
    equipment: "Machine", difficulty: "intermediate", pattern: "Horizontal Pull",
    instructions: ["Lie chest-down on the pad with feet on the platform.", "Grip the handles with arms extended.", "Row the elbows back, squeezing the shoulder blades.", "Lower until the arms are straight."],
    safety: ["Keep the chest on the pad throughout.", "Avoid jerking the weight up."],
  }),
  builtIn({
    n: 35, slug: "chest-supported-machine-row", name: "Chest-Supported Machine Row",
    description: "Seated machine row with chest support — low setup demand for upper-back training.",
    bodyPart: "Upper Body", primary: "Upper Back", secondary: ["Latissimus Dorsi", "Rear Deltoids", "Biceps"],
    equipment: "Machine", difficulty: "beginner", pattern: "Horizontal Pull",
    instructions: ["Set the seat so the handles are at mid-chest height.", "Keep the chest against the pad.", "Row back until the elbows pass the torso.", "Return slowly to full reach."],
    safety: ["Don't let the shoulders roll forward at full reach.", "Keep the neck relaxed."],
  }),

  // ---- Shoulders ----
  builtIn({
    n: 36, slug: "seated-dumbbell-overhead-press", name: "Seated Dumbbell Overhead Press",
    description: "Overhead press from a supported seat; trains the front deltoids and triceps.",
    bodyPart: "Upper Body", primary: "Front Deltoids", secondary: ["Side Deltoids", "Triceps", "Upper Chest"],
    equipment: "Dumbbells", difficulty: "intermediate", pattern: "Vertical Push",
    instructions: ["Set a bench nearly upright and sit with the back supported.", "Start with the dumbbells at shoulder height.", "Press overhead without locking out hard.", "Lower back to the shoulders under control."],
    safety: ["Keep the lower back against the pad.", "Pick a load you can lower with control."],
  }),
  builtIn({
    n: 37, slug: "machine-shoulder-press", name: "Machine Shoulder Press",
    description: "Guided overhead press with back support and minimal setup.",
    bodyPart: "Upper Body", primary: "Front Deltoids", secondary: ["Side Deltoids", "Triceps"],
    equipment: "Machine", difficulty: "beginner", pattern: "Vertical Push",
    instructions: ["Adjust the seat so the handles start at shoulder height.", "Keep the back on the pad.", "Press up until the arms are nearly straight.", "Lower slowly."],
    safety: ["Avoid arching away from the back pad.", "Keep the wrists straight."],
  }),
  builtIn({
    n: 38, slug: "landmine-press", name: "Landmine Press",
    description: "Angled single-arm press with a barbell anchored at one end — a shoulder-friendly pressing arc for many lifters.",
    bodyPart: "Upper Body", primary: "Front Deltoids", secondary: ["Upper Chest", "Triceps", "Core"],
    equipment: "Barbell", difficulty: "intermediate", pattern: "Angled Push",
    instructions: ["Anchor one end of a barbell in a landmine or corner.", "Hold the other end at shoulder height in one hand.", "Press up and forward along the bar's arc.", "Lower to the shoulder under control."],
    safety: ["Brace the trunk so you don't twist.", "Keep the anchor secure before loading."],
  }),
  builtIn({
    n: 39, slug: "machine-lateral-raise", name: "Machine Lateral Raise",
    description: "Guided lateral raise that keeps resistance on the side deltoids with little setup or balance demand.",
    bodyPart: "Upper Body", primary: "Side Deltoids", secondary: ["Upper Trapezius"],
    equipment: "Machine", difficulty: "beginner", pattern: "Shoulder Abduction",
    instructions: ["Line the shoulder joint up with the machine's pivot.", "Rest the forearms or hands on the pads.", "Raise the arms out to about shoulder height.", "Lower under control."],
    safety: ["Don't shrug to move the weight.", "Keep the torso still."],
  }),
  builtIn({
    n: 40, slug: "incline-dumbbell-rear-delt-row", name: "Incline Dumbbell Rear Delt Row",
    description: "Chest-supported row with the elbows flared wide, biasing the rear deltoids.",
    bodyPart: "Upper Body", primary: "Rear Deltoids", secondary: ["Upper Back", "Middle Trapezius"],
    equipment: "Dumbbells", difficulty: "intermediate", pattern: "Horizontal Pull (wide)",
    instructions: ["Lie chest-down on a low-incline bench.", "Hold light dumbbells with arms hanging.", "Row out to the sides with elbows wide.", "Lower slowly."],
    safety: ["Use light loads — this is a small muscle.", "Keep the chest on the bench."],
  }),
  builtIn({
    n: 41, slug: "cable-rear-delt-fly", name: "Cable Rear Delt Fly",
    description: "Reverse fly between two cables, keeping tension on the rear deltoids through the whole arc.",
    bodyPart: "Upper Body", primary: "Rear Deltoids", secondary: ["Upper Back"],
    equipment: "Cable", difficulty: "intermediate", pattern: "Horizontal Abduction",
    instructions: ["Set two cables at shoulder height and cross the handles.", "Hold with arms extended in front.", "Sweep the arms out and back.", "Return under control."],
    safety: ["Keep a slight, fixed elbow bend.", "Avoid leaning back to move the weight."],
  }),
  builtIn({
    n: 42, slug: "incline-rear-delt-raise", name: "Incline Rear Delt Raise",
    description: "Chest-supported reverse fly with dumbbells — the bench removes the need to hold a hinge.",
    bodyPart: "Upper Body", primary: "Rear Deltoids", secondary: ["Upper Back"],
    equipment: "Dumbbells", difficulty: "beginner", pattern: "Horizontal Abduction",
    instructions: ["Lie chest-down on an incline bench.", "Hold light dumbbells below the shoulders.", "Raise the arms out to the sides.", "Lower slowly."],
    safety: ["Use light loads.", "Keep the neck neutral."],
  }),

  // ---- Arms ----
  builtIn({
    n: 43, slug: "preacher-curl", name: "Preacher Curl",
    description: "Curl with the upper arm braced on a preacher pad, training the elbow flexors with the shoulder flexed.",
    bodyPart: "Upper Body", primary: "Biceps", secondary: ["Brachialis", "Forearms"],
    equipment: "EZ Bar", difficulty: "beginner", pattern: "Elbow Flexion",
    instructions: ["Set the pad so the armpits rest near its top.", "Hold the bar or dumbbells with arms almost straight.", "Curl up without lifting the elbows.", "Lower slowly to near full extension."],
    safety: ["Don't drop into the bottom — control the stretch.", "Keep the upper arms on the pad."],
  }),
  builtIn({
    n: 44, slug: "cable-curl", name: "Cable Curl",
    description: "Standing curl from a low cable — simple setup and smooth resistance.",
    bodyPart: "Upper Body", primary: "Biceps", secondary: ["Brachialis", "Forearms"],
    equipment: "Cable", difficulty: "beginner", pattern: "Elbow Flexion",
    instructions: ["Attach a bar or rope to a low pulley.", "Stand tall with elbows by your sides.", "Curl the handle up.", "Lower to full extension."],
    safety: ["Keep the elbows still.", "Avoid swinging the torso."],
  }),
  builtIn({
    n: 45, slug: "single-dumbbell-overhead-extension", name: "Single-Dumbbell Overhead Triceps Extension",
    description: "Overhead elbow extension holding one dumbbell — trains the triceps with the arm overhead.",
    bodyPart: "Upper Body", primary: "Triceps", secondary: [],
    equipment: "Dumbbells", difficulty: "beginner", pattern: "Elbow Extension",
    instructions: ["Sit tall on a bench with back support.", "Hold one dumbbell overhead with both hands.", "Lower it behind the head by bending the elbows.", "Extend back overhead."],
    safety: ["Grip the dumbbell securely by the plate.", "Keep the elbows pointing roughly forward."],
  }),
  builtIn({
    n: 46, slug: "cross-body-cable-pushdown", name: "Cross-Body Cable Pushdown",
    description: "Single-arm cable triceps extension across the body from a high pulley.",
    bodyPart: "Upper Body", primary: "Triceps", secondary: [],
    equipment: "Cable", difficulty: "intermediate", pattern: "Elbow Extension",
    instructions: ["Set a cable high and hold the cable (no handle or a single grip) with the opposite hand.", "Start with the elbow bent across the body.", "Extend the arm down and out.", "Return under control."],
    safety: ["Keep the shoulder still — the elbow does the work.", "Train both sides equally."],
  }),

  // ---- Quadriceps ----
  builtIn({
    n: 47, slug: "hack-squat", name: "Hack Squat",
    description: "Machine squat on a fixed sled with back support — knee-dominant quad training without balancing a bar.",
    bodyPart: "Lower Body", primary: "Quadriceps", secondary: ["Glutes"],
    equipment: "Machine", difficulty: "beginner", pattern: "Squat",
    instructions: ["Stand on the platform with the back and shoulders on the pads.", "Release the safety handles.", "Squat down as deep as you can control.", "Drive back up through the whole foot."],
    safety: ["Re-engage the safeties before stepping out.", "Keep the lower back on the pad."],
  }),
  builtIn({
    n: 48, slug: "smith-machine-squat", name: "Smith Machine Squat",
    description: "Squat on a fixed bar path; foot position changes how much the quads are emphasised.",
    bodyPart: "Lower Body", primary: "Quadriceps", secondary: ["Glutes", "Hamstrings"],
    equipment: "Smith Machine", difficulty: "intermediate", pattern: "Squat",
    instructions: ["Set the bar at upper-chest height and step under it.", "Place the feet slightly in front of the bar.", "Unrack and squat down under control.", "Stand back up and re-rack."],
    safety: ["Set the safety stops at the bottom of your range.", "The bar's axial load still runs through the spine."],
  }),
  builtIn({
    n: 49, slug: "supported-split-squat", name: "Supported Split Squat",
    description: "Split squat holding a rack or bench for balance, so the working leg can focus on the movement.",
    bodyPart: "Lower Body", primary: "Quadriceps", secondary: ["Glutes"],
    equipment: "Bodyweight", difficulty: "beginner", pattern: "Single-Leg Squat",
    instructions: ["Stand in a long split stance next to a support.", "Hold the support lightly with one hand.", "Lower the back knee toward the floor.", "Drive up through the front foot."],
    safety: ["Use the support for balance, not to pull yourself up.", "Add a dumbbell only once the pattern is steady."],
  }),
  builtIn({
    n: 50, slug: "dumbbell-step-up", name: "Dumbbell Step-Up",
    description: "Step onto a box or bench — single-leg quad and glute work with very little equipment.",
    bodyPart: "Lower Body", primary: "Quadriceps", secondary: ["Glutes"],
    equipment: "Dumbbells", difficulty: "beginner", pattern: "Single-Leg Squat",
    instructions: ["Stand facing a stable box at about knee height.", "Place one whole foot on the box.", "Step up by driving through that foot.", "Step down under control."],
    safety: ["Use a box that cannot slide or tip.", "Push mainly with the top leg, not the trailing foot."],
  }),

  // ---- Hamstrings ----
  builtIn({
    n: 51, slug: "dumbbell-romanian-deadlift", name: "Dumbbell Romanian Deadlift",
    description: "Hip hinge with dumbbells — the same hinge pattern as the barbell RDL with easier setup.",
    bodyPart: "Lower Body", primary: "Hamstrings", secondary: ["Glutes", "Lower Back", "Forearms"],
    equipment: "Dumbbells", difficulty: "beginner", pattern: "Hip Hinge",
    instructions: ["Stand holding dumbbells in front of the thighs.", "Push the hips back with a soft knee bend.", "Lower until you feel a strong hamstring stretch.", "Drive the hips forward to stand."],
    safety: ["Keep the back neutral throughout.", "Stop the descent where your back position changes."],
  }),
  builtIn({
    n: 52, slug: "cable-pull-through", name: "Cable Pull-Through",
    description: "Hip hinge pulling a low cable between the legs — glute-biased, with little spinal load.",
    bodyPart: "Lower Body", primary: "Glutes", secondary: ["Hamstrings"],
    equipment: "Cable", difficulty: "beginner", pattern: "Hip Hinge",
    instructions: ["Face away from a low pulley holding a rope between the legs.", "Hinge back, letting the rope travel through.", "Drive the hips forward to stand tall.", "Return under control."],
    safety: ["Keep the arms long — the hips do the work.", "Don't lean back at the top."],
  }),
  builtIn({
    n: 53, slug: "lying-leg-curl", name: "Lying Leg Curl",
    description: "Prone knee-flexion machine for the hamstrings.",
    bodyPart: "Lower Body", primary: "Hamstrings", secondary: ["Gastrocnemius"],
    equipment: "Machine", difficulty: "beginner", pattern: "Knee Flexion",
    instructions: ["Lie face-down with the pad just above the heels.", "Hold the handles and keep the hips down.", "Curl the heels toward the glutes.", "Lower slowly."],
    safety: ["Keep the hips on the bench.", "Control the lowering phase."],
  }),
  builtIn({
    n: 54, slug: "standing-single-leg-curl", name: "Standing Single-Leg Curl",
    description: "One-leg knee-flexion machine performed standing.",
    bodyPart: "Lower Body", primary: "Hamstrings", secondary: ["Gastrocnemius"],
    equipment: "Machine", difficulty: "beginner", pattern: "Knee Flexion",
    instructions: ["Stand with the pad behind the working ankle.", "Hold the handles for balance.", "Curl the heel up.", "Lower slowly."],
    safety: ["Keep the hips square.", "Train both legs with the same reps."],
  }),

  // ---- Glutes ----
  builtIn({
    n: 55, slug: "barbell-hip-thrust", name: "Barbell Hip Thrust",
    description: "Loaded hip extension with the upper back on a bench — glutes work hardest near full hip extension.",
    bodyPart: "Lower Body", primary: "Glutes", secondary: ["Hamstrings"],
    equipment: "Barbell", difficulty: "intermediate", pattern: "Hip Extension",
    instructions: ["Sit with the upper back against a bench and a padded bar over the hips.", "Plant the feet about hip-width.", "Drive the hips up until the torso is level.", "Lower under control."],
    safety: ["Use a bar pad.", "Keep the ribs down at the top — don't over-arch."],
  }),
  builtIn({
    n: 56, slug: "glute-bridge", name: "Glute Bridge",
    description: "Hip extension from the floor — the simplest version of the hip-thrust pattern.",
    bodyPart: "Lower Body", primary: "Glutes", secondary: ["Hamstrings"],
    equipment: "Bodyweight", difficulty: "beginner", pattern: "Hip Extension",
    instructions: ["Lie on your back with knees bent and feet flat.", "Brace the trunk.", "Drive the hips up until the body is straight from knees to shoulders.", "Lower slowly."],
    safety: ["Push through the heels.", "Avoid arching the lower back at the top."],
  }),

  // ---- Calves ----
  builtIn({
    n: 57, slug: "single-leg-calf-raise", name: "Single-Leg Calf Raise",
    description: "Standing calf raise on one leg off a step — needs only a step and something to hold.",
    bodyPart: "Lower Body", primary: "Calves", secondary: [],
    equipment: "Bodyweight", difficulty: "beginner", pattern: "Plantar Flexion",
    instructions: ["Stand on one foot on a step edge, holding a support.", "Lower the heel below the step.", "Rise as high as you can.", "Pause, then lower slowly."],
    safety: ["Hold a support for balance.", "Use the full range before adding load."],
  }),
  builtIn({
    n: 58, slug: "leg-press-calf-raise", name: "Leg-Press Calf Raise",
    description: "Calf raise performed on a leg-press sled with the knees straight.",
    bodyPart: "Lower Body", primary: "Calves", secondary: [],
    equipment: "Machine", difficulty: "beginner", pattern: "Plantar Flexion",
    instructions: ["Sit in the leg press with the balls of the feet on the platform edge.", "Keep the knees straight but not locked.", "Push the platform with the toes.", "Lower until the calves stretch."],
    safety: ["Keep the safety handles engaged where the machine has them.", "Don't let the feet slip off the edge."],
  }),

  // ---- Abdominals ----
  builtIn({
    n: 59, slug: "weighted-crunch", name: "Weighted Crunch",
    description: "Floor crunch holding a plate or dumbbell to add resistance.",
    bodyPart: "Core", primary: "Abdominals", secondary: ["Obliques"],
    equipment: "Dumbbells", difficulty: "beginner", pattern: "Spinal Flexion",
    instructions: ["Lie on your back with knees bent.", "Hold the weight on the chest.", "Curl the ribcage toward the pelvis.", "Lower slowly."],
    safety: ["Don't pull on the neck.", "Move through the trunk, not the hips."],
  }),
  builtIn({
    n: 60, slug: "machine-crunch", name: "Machine Crunch",
    description: "Seated crunch machine with a guided path and adjustable load.",
    bodyPart: "Core", primary: "Abdominals", secondary: ["Obliques"],
    equipment: "Machine", difficulty: "beginner", pattern: "Spinal Flexion",
    instructions: ["Adjust the seat and hold the handles.", "Curl the trunk forward against the resistance.", "Pause at the bottom.", "Return under control."],
    safety: ["Flex the spine — don't just fold at the hips.", "Avoid yanking the handles."],
  }),
  builtIn({
    n: 61, slug: "hanging-leg-raise", name: "Hanging Leg Raise",
    description: "Straight-leg raise from a hang — hip flexion plus posterior pelvic tilt; demands grip and trunk control.",
    bodyPart: "Core", primary: "Abdominals", secondary: ["Hip Flexors", "Forearms"],
    equipment: "Pull-Up Bar", difficulty: "advanced", pattern: "Hip Flexion",
    instructions: ["Hang from a bar with a firm grip.", "Brace and stop any swing.", "Raise the legs, curling the pelvis up at the top.", "Lower slowly without swinging."],
    safety: ["Master the knee raise first.", "Stop when grip or swing takes over."],
  }),
  builtIn({
    n: 62, slug: "supported-knee-raise", name: "Supported Knee Raise",
    description: "Knee raise on a back-supported station (captain's chair) — the hanging pattern without the grip demand.",
    bodyPart: "Core", primary: "Abdominals", secondary: ["Hip Flexors"],
    equipment: "Machine", difficulty: "beginner", pattern: "Hip Flexion",
    instructions: ["Rest the forearms on the pads with the back on the pad.", "Let the legs hang.", "Raise the knees, tilting the pelvis up.", "Lower slowly."],
    safety: ["Keep the back on the pad.", "Avoid swinging the legs."],
  }),
  builtIn({
    n: 63, slug: "reverse-crunch", name: "Reverse Crunch",
    description: "Floor exercise curling the pelvis toward the ribs — no equipment needed.",
    bodyPart: "Core", primary: "Abdominals", secondary: ["Hip Flexors"],
    equipment: "Bodyweight", difficulty: "beginner", pattern: "Spinal Flexion",
    instructions: ["Lie on your back with hips and knees bent to 90°.", "Brace and press the lower back down.", "Curl the hips off the floor toward the ribs.", "Lower slowly."],
    safety: ["Move slowly — momentum takes the work away.", "Keep the head down."],
  }),
];

/**
 * Exercises that already exist in every environment from the 2026-08-04 workout-system
 * seed, with environment-specific random uuids. They are part of the recommendation
 * catalogue but NOT given a fixed id here: re-keying them would repoint historical
 * records. Callers resolve their real id by slug (public rows only).
 */
export const LEGACY_SEEDED_EXERCISES: ExerciseLibraryItem[] = [
  {
    id: null, slug: "leg-extension", name: "Leg Extension",
    description: "Seated knee-extension machine — isolates the quadriceps.",
    bodyPart: "Lower Body", primaryMuscle: "Quadriceps", secondaryMuscles: [],
    equipment: "Machine", difficulty: "beginner", movementPattern: "Knee Extension",
    instructions: ["Line the knee joint up with the machine's pivot.", "Set the pad just above the ankles.", "Extend the knees fully.", "Lower under control."],
    safetyCues: ["Control the lowering — don't let the stack drop.", "Hold the handles to keep the hips down."],
    source: "muscle-fitness", sourceUrl: null,
  },
  {
    id: null, slug: "dumbbell-lateral-raise", name: "Dumbbell Lateral Raise",
    description: "Free-weight lateral raise for the side deltoids.",
    bodyPart: "Upper Body", primaryMuscle: "Side Deltoids", secondaryMuscles: ["Upper Trapezius"],
    equipment: "Dumbbells", difficulty: "beginner", movementPattern: "Shoulder Abduction",
    instructions: ["Stand holding light dumbbells at your sides.", "Raise the arms out to about shoulder height.", "Lead with the elbows.", "Lower slowly."],
    safetyCues: ["Use light loads — momentum takes the work off the delts.", "Don't shrug."],
    source: "muscle-fitness", sourceUrl: null,
  },
  {
    id: null, slug: "pull-up", name: "Pull-Up",
    description: "Bodyweight vertical pull; add load with a belt once bodyweight reps are solid (weighted pull-up).",
    bodyPart: "Upper Body", primaryMuscle: "Latissimus Dorsi", secondaryMuscles: ["Biceps", "Upper Back"],
    equipment: "Pull-Up Bar", difficulty: "intermediate", movementPattern: "Vertical Pull",
    instructions: ["Hang with hands just outside shoulder width.", "Pull until the chin clears the bar.", "Lower to a full hang.", "Add load only when your bodyweight reps are consistent."],
    safetyCues: ["Avoid kipping.", "Control the lowering."],
    source: "muscle-fitness", sourceUrl: null,
  },
];
