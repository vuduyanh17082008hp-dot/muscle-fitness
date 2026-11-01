import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Exercise profiles — the deterministic metadata the Adaptive Workouts recommender
 * and the substitution engine (lib/training/exercise-substitution.ts) reason over.
 *
 * Categorical on purpose: no profile carries a numeric "hypertrophy score". Every
 * field is something a coach could check by watching the exercise performed.
 * Keyed by slug so the original built-ins stay byte-identical in exercise-library.ts.
 */

export type EquipmentTag =
  | "barbell"
  | "dumbbell"
  | "machine"
  | "cable"
  | "smith_machine"
  | "bench"
  | "pull_up_bar"
  | "ez_bar"
  | "preacher_bench"
  | "landmine";

export type ExerciseMechanic = "compound" | "isolation";
export type ExerciseLaterality = "bilateral" | "unilateral";
/** guided = fixed path (machine/Smith); supported = body braced by a bench/pad, free load; free = athlete balances load and body. */
export type ExerciseStability = "guided" | "supported" | "free";
/** Setup + coordination demand, not difficulty or "advancedness". */
export type ExerciseComplexity = "low" | "moderate" | "high";

export type EvidenceCategory = "direct_comparative" | "indirect_biomechanical" | "practical_coaching";

export type EvidenceNote = {
  category: EvidenceCategory;
  summary: string;
  sourceIds: EvidenceSourceId[];
};

export type ExerciseProfile = {
  mechanic: ExerciseMechanic;
  laterality: ExerciseLaterality;
  stability: ExerciseStability;
  complexity: ExerciseComplexity;
  /** Load travels through the spine (bar on the back, heavy hinge, shoulder-pad sleds). */
  axialLoad: boolean;
  /** Everything required; [] = no equipment beyond a floor, wall or step. */
  needs: EquipmentTag[];
  /** Physical station shared with other exercises — "machine occupied" blocks all of them. */
  station?: string;
  jointAction: string;
  progression: string;
  evidence?: EvidenceNote[];
};

/* ---------------------------------------------------------------------------
   Sources — each PMID looked up on PubMed and its abstract read (2026-11-01).
   A summary below states only what that abstract reports.
--------------------------------------------------------------------------- */

export const EVIDENCE_SOURCES = {
  maeo2021_leg_curl: {
    label: "Maeo et al., Med Sci Sports Exerc 2021 — seated vs prone leg curl",
    url: "https://pubmed.ncbi.nlm.nih.gov/33009197/",
    doi: "10.1249/MSS.0000000000002523",
  },
  maeo2022_triceps: {
    label: "Maeo et al., Eur J Sport Sci 2022 — overhead vs neutral-arm triceps extension",
    url: "https://pubmed.ncbi.nlm.nih.gov/35819335/",
    doi: "10.1080/17461391.2022.2100279",
  },
  kinoshita2023_calf: {
    label: "Kinoshita et al., Front Physiol 2023 — standing vs seated calf raise",
    url: "https://pubmed.ncbi.nlm.nih.gov/38156065/",
    doi: "10.3389/fphys.2023.1272106",
  },
  rodriguez2020_incline_emg: {
    label: "Rodríguez-Ridao et al., IJERPH 2020 — bench inclination and EMG",
    url: "https://pubmed.ncbi.nlm.nih.gov/33049982/",
    doi: "10.3390/ijerph17197339",
  },
  haugen2023_machine_free: {
    label: "Haugen et al., BMC Sports Sci Med Rehabil 2023 — free-weight vs machine meta-analysis",
    url: "https://pubmed.ncbi.nlm.nih.gov/37582807/",
    doi: "10.1186/s13102-023-00713-4",
  },
  kobayashi2026_curls: {
    label: "Kobayashi et al., J Sports Sci 2026 — incline vs preacher dumbbell curl",
    url: "https://pubmed.ncbi.nlm.nih.gov/42829982/",
    doi: "10.1080/02640414.2026.2741751",
  },
  varovic2025_muscle_length: {
    label: "Varović et al., Int J Sports Med 2025 — muscle length and regional hypertrophy meta-analysis",
    url: "https://pubmed.ncbi.nlm.nih.gov/40570881/",
    doi: "10.1055/a-2615-4935",
  },
  androulakis2024_technique: {
    label: "Androulakis Korakakis et al., J Funct Morphol Kinesiol 2024 — technique and hypertrophy (narrative review)",
    url: "https://pubmed.ncbi.nlm.nih.gov/38249086/",
    doi: "10.3390/jfmk9010009",
  },
} as const;

export type EvidenceSourceId = keyof typeof EVIDENCE_SOURCES;

const LEG_CURL: EvidenceNote = {
  category: "direct_comparative",
  summary:
    "In a 12-week trial (20 adults, one leg each way), seated leg curls grew the whole hamstrings more than prone (lying) curls: +14% vs +9%.",
  sourceIds: ["maeo2021_leg_curl"],
};
const TRICEPS_OVERHEAD: EvidenceNote = {
  category: "direct_comparative",
  summary:
    "In a 12-week cable trial (21 adults), overhead elbow extensions grew the whole triceps more than the neutral-arm position (+19.9% vs +13.9%), with lower absolute loads.",
  sourceIds: ["maeo2022_triceps"],
};
const CALF_STANDING: EvidenceNote = {
  category: "direct_comparative",
  summary:
    "In 14 untrained adults over 12 weeks, standing (knee-straight) calf raises grew the gastrocnemius far more than seated raises; soleus growth was similar.",
  sourceIds: ["kinoshita2023_calf"],
};
const CALF_KNEE_STRAIGHT: EvidenceNote = {
  category: "indirect_biomechanical",
  summary:
    "Keeps the knee straight like a standing calf raise — the position that out-grew seated raises for the gastrocnemius in one 12-week trial. Not tested directly for this variation.",
  sourceIds: ["kinoshita2023_calf"],
};
const INCLINE_EMG: EvidenceNote = {
  category: "indirect_biomechanical",
  summary:
    "In 30 trained adults, upper-chest EMG peaked at a 30° bench; above 45° the front delts took over. EMG shows activation, not long-term growth.",
  sourceIds: ["rodriguez2020_incline_emg"],
};
const MACHINE_FREE: EvidenceNote = {
  category: "direct_comparative",
  summary:
    "A meta-analysis of studies comparing machine and free-weight training found no difference in muscle growth; strength gains were specific to the equipment trained.",
  sourceIds: ["haugen2023_machine_free"],
};
const CURL_POSITION: EvidenceNote = {
  category: "direct_comparative",
  summary:
    "In 21 untrained adults over 12 weeks, incline curls grew the biceps slightly more and preacher curls grew the brachialis and brachioradialis more; total elbow-flexor growth was similar.",
  sourceIds: ["kobayashi2026_curls"],
};

/** Shown wherever a recommendation leans on the "lengthened position" idea, so it is never oversold. */
export const MUSCLE_LENGTH_CAVEAT: EvidenceNote = {
  category: "indirect_biomechanical",
  summary:
    "A 2025 meta-analysis found training at longer and shorter muscle lengths produced similar regional growth overall — single trials favouring stretch positions are suggestive, not settled.",
  sourceIds: ["varovic2025_muscle_length"],
};
export const TECHNIQUE_BASIS: EvidenceNote = {
  category: "practical_coaching",
  summary:
    "A narrative review recommends a full, controlled range of motion and a 2–8 s repetition; it notes exercise-specific technique rules mostly come from anatomy and biomechanics, not trials.",
  sourceIds: ["androulakis2024_technique"],
};
export { MACHINE_FREE as MACHINE_VS_FREE_WEIGHT };

/* ---------------------------------------------------------------------------
   Profiles
--------------------------------------------------------------------------- */

const PROGRESS = {
  machine: "Add reps across the range first, then move to the next stack increment.",
  dumbbell: "Reach the top of the rep range on every set, then move up to the next dumbbell.",
  barbell: "Once every set reaches the top of the rep range, add a small jump (about 1–2.5 kg).",
  bodyweight: "Progress reps, then slower lowering or more range, then add a little external load.",
  isolation: "Add reps first; increase load only when the last reps still look like the first.",
};

type P = Omit<ExerciseProfile, "progression"> & { progression?: string };
const p = (profile: P, progression: string): ExerciseProfile => ({ ...profile, progression: profile.progression ?? progression });

export const EXERCISE_PROFILES: Record<string, ExerciseProfile> = {
  // ---- Chest / pressing ----
  "barbell-bench-press": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["barbell", "bench"], station: "bench_rack", jointAction: "Horizontal shoulder adduction + elbow extension" }, PROGRESS.barbell),
  "incline-dumbbell-press": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Shoulder flexion/adduction on an incline + elbow extension", evidence: [INCLINE_EMG] }, PROGRESS.dumbbell),
  "machine-chest-press": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "chest_press", jointAction: "Horizontal shoulder adduction + elbow extension", evidence: [MACHINE_FREE] }, PROGRESS.machine),
  "cable-fly": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["cable"], station: "cable_crossover", jointAction: "Horizontal shoulder adduction (elbow angle fixed)" }, PROGRESS.isolation),
  "push-up": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: [], jointAction: "Horizontal shoulder adduction + elbow extension" }, PROGRESS.bodyweight),
  "smith-incline-press": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["smith_machine", "bench"], station: "smith", jointAction: "Shoulder flexion/adduction on an incline + elbow extension", evidence: [INCLINE_EMG] }, PROGRESS.barbell),
  "converging-machine-chest-press": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "converging_press", jointAction: "Horizontal shoulder adduction + elbow extension", evidence: [MACHINE_FREE] }, PROGRESS.machine),
  "seated-cable-fly": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["cable", "bench"], station: "cable_crossover", jointAction: "Horizontal shoulder adduction (elbow angle fixed)" }, PROGRESS.isolation),
  "incline-machine-chest-press": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "incline_press", jointAction: "Shoulder flexion/adduction on an incline + elbow extension", evidence: [INCLINE_EMG, MACHINE_FREE] }, PROGRESS.machine),
  "flat-dumbbell-press": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Horizontal shoulder adduction + elbow extension" }, PROGRESS.dumbbell),
  "incline-push-up": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "low", axialLoad: false, needs: [], jointAction: "Horizontal shoulder adduction + elbow extension" }, "Lower the hand surface over time, then progress to floor push-ups."),

  // ---- Back / pulling ----
  "lat-pulldown": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["cable"], station: "lat_pulldown", jointAction: "Shoulder adduction/extension + elbow flexion" }, PROGRESS.machine),
  "neutral-grip-lat-pulldown": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["cable"], station: "lat_pulldown", jointAction: "Shoulder extension/adduction + elbow flexion" }, PROGRESS.machine),
  "single-arm-cable-pulldown": p({ mechanic: "compound", laterality: "unilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["cable"], jointAction: "Shoulder adduction/extension, one side at a time" }, PROGRESS.machine),
  "assisted-pull-up": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "assisted_pullup", jointAction: "Shoulder adduction/extension + elbow flexion" }, "Reduce the assistance a step at a time as reps reach the top of the range."),
  "pull-up": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["pull_up_bar"], jointAction: "Shoulder adduction/extension + elbow flexion" }, "Build clean bodyweight reps, then add small loads with a belt (weighted pull-up)."),
  "chest-supported-row": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Shoulder extension + scapular retraction + elbow flexion" }, PROGRESS.dumbbell),
  "seated-cable-row": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["cable"], station: "seated_row", jointAction: "Shoulder extension + scapular retraction + elbow flexion" }, PROGRESS.machine),
  "chest-supported-t-bar-row": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["machine"], station: "t_bar", jointAction: "Shoulder extension + scapular retraction + elbow flexion" }, PROGRESS.barbell),
  "chest-supported-machine-row": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "machine_row", jointAction: "Shoulder extension + scapular retraction + elbow flexion", evidence: [MACHINE_FREE] }, PROGRESS.machine),

  // ---- Shoulders ----
  "barbell-overhead-press": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "high", axialLoad: true, needs: ["barbell"], jointAction: "Shoulder flexion/abduction overhead + elbow extension" }, PROGRESS.barbell),
  "seated-dumbbell-overhead-press": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Shoulder flexion/abduction overhead + elbow extension" }, PROGRESS.dumbbell),
  "machine-shoulder-press": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "shoulder_press", jointAction: "Shoulder flexion/abduction overhead + elbow extension", evidence: [MACHINE_FREE] }, PROGRESS.machine),
  "landmine-press": p({ mechanic: "compound", laterality: "unilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["barbell", "landmine"], jointAction: "Angled shoulder flexion + elbow extension, one side at a time" }, PROGRESS.barbell),
  "cable-lateral-raise": p({ mechanic: "isolation", laterality: "unilateral", stability: "free", complexity: "low", axialLoad: false, needs: ["cable"], jointAction: "Shoulder abduction" }, PROGRESS.isolation),
  "machine-lateral-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "lateral_raise", jointAction: "Shoulder abduction" }, PROGRESS.machine),
  "dumbbell-lateral-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "low", axialLoad: false, needs: ["dumbbell"], jointAction: "Shoulder abduction" }, PROGRESS.isolation),
  "reverse-pec-deck": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "pec_deck", jointAction: "Horizontal shoulder abduction" }, PROGRESS.machine),
  "cable-rear-delt-fly": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["cable"], station: "cable_crossover", jointAction: "Horizontal shoulder abduction" }, PROGRESS.isolation),
  "incline-rear-delt-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Horizontal shoulder abduction" }, PROGRESS.isolation),
  "incline-dumbbell-rear-delt-row": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Horizontal shoulder abduction + elbow flexion (elbows wide)" }, PROGRESS.dumbbell),

  // ---- Arms ----
  "ez-bar-curl": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "low", axialLoad: false, needs: ["ez_bar"], jointAction: "Elbow flexion" }, PROGRESS.isolation),
  "incline-dumbbell-curl": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Elbow flexion with the shoulder extended", evidence: [CURL_POSITION, MUSCLE_LENGTH_CAVEAT] }, PROGRESS.isolation),
  "preacher-curl": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["ez_bar", "preacher_bench"], station: "preacher", jointAction: "Elbow flexion with the shoulder flexed", evidence: [CURL_POSITION] }, PROGRESS.isolation),
  "cable-curl": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "low", axialLoad: false, needs: ["cable"], jointAction: "Elbow flexion" }, PROGRESS.isolation),
  "cable-triceps-pushdown": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "low", axialLoad: false, needs: ["cable"], jointAction: "Elbow extension with the arm by the side", evidence: [TRICEPS_OVERHEAD] }, PROGRESS.isolation),
  "overhead-cable-triceps-extension": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["cable"], jointAction: "Elbow extension with the arm overhead", evidence: [TRICEPS_OVERHEAD, MUSCLE_LENGTH_CAVEAT] }, PROGRESS.isolation),
  "single-dumbbell-overhead-extension": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Elbow extension with the arm overhead", evidence: [TRICEPS_OVERHEAD] }, PROGRESS.isolation),
  "cross-body-cable-pushdown": p({ mechanic: "isolation", laterality: "unilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["cable"], jointAction: "Elbow extension across the body, one arm at a time" }, PROGRESS.isolation),

  // ---- Quadriceps ----
  "barbell-back-squat": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "high", axialLoad: true, needs: ["barbell"], station: "squat_rack", jointAction: "Knee extension + hip extension" }, PROGRESS.barbell),
  "leg-press": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "leg_press", jointAction: "Knee extension + hip extension", evidence: [MACHINE_FREE] }, PROGRESS.machine),
  "hack-squat": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: true, needs: ["machine"], station: "hack_squat", jointAction: "Knee extension + hip extension" }, PROGRESS.machine),
  "smith-machine-squat": p({ mechanic: "compound", laterality: "bilateral", stability: "guided", complexity: "moderate", axialLoad: true, needs: ["smith_machine"], station: "smith", jointAction: "Knee extension + hip extension" }, PROGRESS.barbell),
  "leg-extension": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "leg_extension", jointAction: "Knee extension only" }, PROGRESS.machine),
  "bulgarian-split-squat": p({ mechanic: "compound", laterality: "unilateral", stability: "free", complexity: "high", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Single-leg knee extension + hip extension" }, PROGRESS.dumbbell),
  "supported-split-squat": p({ mechanic: "compound", laterality: "unilateral", stability: "supported", complexity: "low", axialLoad: false, needs: [], jointAction: "Single-leg knee extension + hip extension" }, PROGRESS.bodyweight),
  "dumbbell-step-up": p({ mechanic: "compound", laterality: "unilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["dumbbell", "bench"], jointAction: "Single-leg knee extension + hip extension" }, PROGRESS.dumbbell),

  // ---- Hamstrings / glutes ----
  "romanian-deadlift": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "high", axialLoad: true, needs: ["barbell"], jointAction: "Hip extension (hinge) with near-straight knees" }, PROGRESS.barbell),
  "dumbbell-romanian-deadlift": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: true, needs: ["dumbbell"], jointAction: "Hip extension (hinge) with near-straight knees" }, PROGRESS.dumbbell),
  "cable-pull-through": p({ mechanic: "compound", laterality: "bilateral", stability: "free", complexity: "low", axialLoad: false, needs: ["cable"], jointAction: "Hip extension (hinge) with the load pulling from behind" }, PROGRESS.machine),
  "seated-leg-curl": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "seated_leg_curl", jointAction: "Knee flexion with the hip flexed", evidence: [LEG_CURL, MUSCLE_LENGTH_CAVEAT] }, PROGRESS.machine),
  "lying-leg-curl": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "lying_leg_curl", jointAction: "Knee flexion with the hip extended", evidence: [LEG_CURL] }, PROGRESS.machine),
  "standing-single-leg-curl": p({ mechanic: "isolation", laterality: "unilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "standing_leg_curl", jointAction: "Knee flexion with the hip near neutral, one leg at a time" }, PROGRESS.machine),
  "barbell-hip-thrust": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "moderate", axialLoad: false, needs: ["barbell", "bench"], jointAction: "Hip extension, hardest near full extension" }, PROGRESS.barbell),
  "glute-bridge": p({ mechanic: "compound", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: [], jointAction: "Hip extension, hardest near full extension" }, PROGRESS.bodyweight),

  // ---- Calves ----
  "standing-calf-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: true, needs: ["machine"], station: "standing_calf", jointAction: "Ankle plantar flexion with the knee straight", evidence: [CALF_STANDING] }, PROGRESS.machine),
  "single-leg-calf-raise": p({ mechanic: "isolation", laterality: "unilateral", stability: "free", complexity: "low", axialLoad: false, needs: [], jointAction: "Ankle plantar flexion with the knee straight, one leg at a time", evidence: [CALF_KNEE_STRAIGHT] }, PROGRESS.bodyweight),
  "leg-press-calf-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "leg_press", jointAction: "Ankle plantar flexion with the knee straight", evidence: [CALF_KNEE_STRAIGHT] }, PROGRESS.machine),

  // ---- Core ----
  "cable-crunch": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["cable"], jointAction: "Spinal flexion against resistance" }, PROGRESS.isolation),
  "weighted-crunch": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["dumbbell"], jointAction: "Spinal flexion against resistance" }, PROGRESS.isolation),
  "machine-crunch": p({ mechanic: "isolation", laterality: "bilateral", stability: "guided", complexity: "low", axialLoad: false, needs: ["machine"], station: "crunch", jointAction: "Spinal flexion against resistance" }, PROGRESS.machine),
  "hanging-knee-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "moderate", axialLoad: false, needs: ["pull_up_bar"], jointAction: "Hip flexion + posterior pelvic tilt from a hang" }, PROGRESS.bodyweight),
  "hanging-leg-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "high", axialLoad: false, needs: ["pull_up_bar"], jointAction: "Hip flexion + posterior pelvic tilt from a hang (straight legs)" }, PROGRESS.bodyweight),
  "supported-knee-raise": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: ["machine"], station: "captains_chair", jointAction: "Hip flexion + posterior pelvic tilt with the back supported" }, PROGRESS.bodyweight),
  "reverse-crunch": p({ mechanic: "isolation", laterality: "bilateral", stability: "supported", complexity: "low", axialLoad: false, needs: [], jointAction: "Posterior pelvic tilt / lower-trunk flexion" }, PROGRESS.bodyweight),
  plank: p({ mechanic: "isolation", laterality: "bilateral", stability: "free", complexity: "low", axialLoad: false, needs: [], jointAction: "Isometric trunk bracing (anti-extension)" }, "Extend the hold time, then move to harder lever positions."),
};

export function getExerciseProfile(slug: string | undefined | null): ExerciseProfile | null {
  return slug && Object.prototype.hasOwnProperty.call(EXERCISE_PROFILES, slug) ? EXERCISE_PROFILES[slug] : null;
}

/* ---------------------------------------------------------------------------
   Curated alternative matrix (spec §8). Candidate pairings — NOT a claim the
   movements are interchangeable. Every slug is checked against the catalogue,
   and the row's target must be a primary or secondary muscle of each entry
   (lib/training/__tests__/exercise-substitution.test.ts).
--------------------------------------------------------------------------- */

export type AlternativeRow = {
  id: string;
  label: string;
  target: CanonicalMuscle;
  preferred: string;
  alternatives: string[];
};

export const ALTERNATIVE_MATRIX: AlternativeRow[] = [
  { id: "upper-chest", label: "Upper Chest", target: "upper_chest", preferred: "incline-dumbbell-press", alternatives: ["smith-incline-press", "incline-machine-chest-press"] },
  { id: "chest", label: "Chest", target: "chest", preferred: "converging-machine-chest-press", alternatives: ["flat-dumbbell-press", "cable-fly", "seated-cable-fly"] },
  { id: "lats", label: "Lats", target: "latissimus_dorsi", preferred: "neutral-grip-lat-pulldown", alternatives: ["assisted-pull-up", "single-arm-cable-pulldown"] },
  { id: "upper-back", label: "Upper Back", target: "upper_back", preferred: "chest-supported-t-bar-row", alternatives: ["chest-supported-row", "seated-cable-row"] },
  { id: "anterior-delts", label: "Anterior Delts", target: "anterior_deltoid", preferred: "seated-dumbbell-overhead-press", alternatives: ["machine-shoulder-press", "landmine-press"] },
  { id: "lateral-delts", label: "Lateral Delts", target: "lateral_deltoid", preferred: "cable-lateral-raise", alternatives: ["machine-lateral-raise", "dumbbell-lateral-raise"] },
  { id: "rear-delts", label: "Rear Delts", target: "rear_deltoid", preferred: "reverse-pec-deck", alternatives: ["cable-rear-delt-fly", "incline-rear-delt-raise"] },
  { id: "biceps", label: "Biceps", target: "biceps", preferred: "preacher-curl", alternatives: ["incline-dumbbell-curl", "cable-curl"] },
  { id: "triceps", label: "Triceps", target: "triceps", preferred: "overhead-cable-triceps-extension", alternatives: ["single-dumbbell-overhead-extension", "cable-triceps-pushdown"] },
  { id: "quadriceps", label: "Quadriceps", target: "quadriceps", preferred: "hack-squat", alternatives: ["leg-press", "smith-machine-squat"] },
  { id: "quadriceps-isolation", label: "Quadriceps Isolation", target: "quadriceps", preferred: "leg-extension", alternatives: ["supported-split-squat", "dumbbell-step-up"] },
  { id: "hamstring-hinge", label: "Hamstring Hinge", target: "hamstrings", preferred: "romanian-deadlift", alternatives: ["dumbbell-romanian-deadlift", "cable-pull-through"] },
  { id: "hamstring-knee-flexion", label: "Hamstring Knee Flexion", target: "hamstrings", preferred: "seated-leg-curl", alternatives: ["lying-leg-curl", "standing-single-leg-curl"] },
  { id: "glutes", label: "Glutes", target: "glutes", preferred: "barbell-hip-thrust", alternatives: ["glute-bridge", "bulgarian-split-squat"] },
  { id: "calves", label: "Calves", target: "calves", preferred: "standing-calf-raise", alternatives: ["single-leg-calf-raise", "leg-press-calf-raise"] },
  { id: "abdominals", label: "Abdominals", target: "abdominals", preferred: "cable-crunch", alternatives: ["weighted-crunch", "machine-crunch"] },
  { id: "hip-flexion", label: "Hip Flexion / Trunk Control", target: "abdominals", preferred: "hanging-leg-raise", alternatives: ["supported-knee-raise", "reverse-crunch"] },
];

export function matrixRowsFor(slug: string): AlternativeRow[] {
  return ALTERNATIVE_MATRIX.filter((row) => row.preferred === slug || row.alternatives.includes(slug));
}
