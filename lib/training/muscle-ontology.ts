import { MUSCLE_DISPLAY_NAME, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Muscle Intelligence Atlas — curated anatomy/education layer.
 *
 * This is deliberately separate from athlete-specific analytics
 * (lib/athlete-state/, lib/training/volume-engine.ts etc.): everything
 * in this file is static, curated reference text — never a number
 * derived from a real user's logged training. One entry per EXISTING
 * `CanonicalMuscle` (see lib/training/muscle-taxonomy.ts) — no new
 * muscles are introduced here, this only adds a richer description
 * layer on top of the taxonomy that already exists.
 */

export type MuscleSource = {
  label: string;
  url: string;
};

/** Small local citation table — a few widely-used, freely-citable anatomy references. Not a bibliography management system. */
export const MUSCLE_SOURCES: Record<string, MuscleSource> = {
  kenhub_muscle_anatomy: {
    label: "Kenhub — Muscle Anatomy Reference",
    url: "https://www.kenhub.com/en/library/anatomy",
  },
  physio_pedia: {
    label: "Physiopedia",
    url: "https://www.physio-pedia.com/",
  },
};

export type MuscleAtlasEntry = {
  id: CanonicalMuscle;
  canonicalMuscle: CanonicalMuscle;
  displayName: string;
  scientificName: string;
  /** English synonyms/informational only — search itself resolves through lib/training/muscle-search.ts, this is not a second copy of that dictionary. */
  commonAliases: string[];
  /** Seeded conservatively from known common terms — not a native-speaker-reviewed dictionary. See lib/training/muscle-search.ts for the search-facing alias map. */
  vietnameseAliases: string[];
  preferredView: "front" | "back";
  depth: "superficial" | "deep";
  /** Reserved for future muscle-group linkage; no canonical muscle currently needs one. */
  parentRegion: CanonicalMuscle | null;
  shortDescription: string;
  basicActions: string[];
  /** Keys into lib/training/muscle-regions.ts's MUSCLE_REGIONS (by muscle + view), not a duplicate geometry table. */
  visualRegionIds: string[];
  sourceIds: string[];
};

const ENTRIES: Record<CanonicalMuscle, MuscleAtlasEntry> = {
  chest: {
    id: "chest",
    canonicalMuscle: "chest",
    displayName: MUSCLE_DISPLAY_NAME.chest,
    scientificName: "Pectoralis Major (sternocostal head)",
    commonAliases: ["pecs", "pectorals"],
    vietnameseAliases: ["ngực", "cơ ngực"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: null,
    shortDescription:
      "A broad fan-shaped muscle across the front of the ribcage that draws the arm across the body.",
    basicActions: ["Horizontal shoulder adduction", "Shoulder flexion", "Internal rotation"],
    visualRegionIds: ["chest-front"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  upper_chest: {
    id: "upper_chest",
    canonicalMuscle: "upper_chest",
    displayName: MUSCLE_DISPLAY_NAME.upper_chest,
    scientificName: "Pectoralis Major (clavicular head)",
    commonAliases: ["upper pecs", "clavicular chest"],
    vietnameseAliases: ["ngực trên"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: "chest",
    shortDescription: "The upper portion of the chest, attaching along the collarbone.",
    basicActions: ["Shoulder flexion", "Horizontal adduction at an incline"],
    visualRegionIds: ["upper_chest-front"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  anterior_deltoid: {
    id: "anterior_deltoid",
    canonicalMuscle: "anterior_deltoid",
    displayName: MUSCLE_DISPLAY_NAME.anterior_deltoid,
    scientificName: "Deltoid (anterior head)",
    commonAliases: ["front delt", "front shoulder"],
    vietnameseAliases: ["vai trước"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The front head of the shoulder cap, driving overhead and forward-pressing motion.",
    basicActions: ["Shoulder flexion", "Internal rotation"],
    visualRegionIds: ["anterior_deltoid-front"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  lateral_deltoid: {
    id: "lateral_deltoid",
    canonicalMuscle: "lateral_deltoid",
    displayName: MUSCLE_DISPLAY_NAME.lateral_deltoid,
    scientificName: "Deltoid (lateral head)",
    commonAliases: ["side delt", "middle delt"],
    vietnameseAliases: ["vai giữa"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The middle head of the shoulder cap, responsible for most of the shoulder's rounded width.",
    basicActions: ["Shoulder abduction"],
    visualRegionIds: ["lateral_deltoid-front", "lateral_deltoid-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  rear_deltoid: {
    id: "rear_deltoid",
    canonicalMuscle: "rear_deltoid",
    displayName: MUSCLE_DISPLAY_NAME.rear_deltoid,
    scientificName: "Deltoid (posterior head)",
    commonAliases: ["rear delt", "posterior delt"],
    vietnameseAliases: ["vai sau"],
    preferredView: "back",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The rear head of the shoulder cap, pulling the arm backward and supporting posture.",
    basicActions: ["Shoulder extension", "External rotation", "Horizontal abduction"],
    visualRegionIds: ["rear_deltoid-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  latissimus_dorsi: {
    id: "latissimus_dorsi",
    canonicalMuscle: "latissimus_dorsi",
    displayName: MUSCLE_DISPLAY_NAME.latissimus_dorsi,
    scientificName: "Latissimus Dorsi",
    commonAliases: ["lats"],
    vietnameseAliases: ["xô", "cơ lưng xô"],
    preferredView: "back",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The large, wing-shaped muscle spanning the mid-to-lower back, driving pulling motion.",
    basicActions: ["Shoulder extension", "Shoulder adduction", "Internal rotation"],
    visualRegionIds: ["latissimus_dorsi-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  upper_back: {
    id: "upper_back",
    canonicalMuscle: "upper_back",
    displayName: MUSCLE_DISPLAY_NAME.upper_back,
    scientificName: "Rhomboids / Mid Trapezius region",
    commonAliases: ["back thickness", "mid back", "rhomboids"],
    vietnameseAliases: ["lưng trên"],
    preferredView: "back",
    depth: "deep",
    parentRegion: null,
    shortDescription: "The muscles between the shoulder blades that pull them together and stabilize posture.",
    basicActions: ["Scapular retraction", "Shoulder extension"],
    visualRegionIds: ["upper_back-back"],
    sourceIds: ["physio_pedia"],
  },
  trapezius: {
    id: "trapezius",
    canonicalMuscle: "trapezius",
    displayName: MUSCLE_DISPLAY_NAME.trapezius,
    scientificName: "Trapezius",
    commonAliases: ["traps"],
    vietnameseAliases: ["cầu vai", "cơ thang"],
    preferredView: "back",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "A large kite-shaped muscle spanning the neck, shoulders and mid-back, controlling shoulder-blade movement.",
    basicActions: ["Scapular elevation", "Scapular retraction", "Scapular depression"],
    visualRegionIds: ["trapezius-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  biceps: {
    id: "biceps",
    canonicalMuscle: "biceps",
    displayName: MUSCLE_DISPLAY_NAME.biceps,
    scientificName: "Biceps Brachii",
    commonAliases: ["bicep"],
    vietnameseAliases: ["tay trước", "cơ tay trước"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The two-headed muscle on the front of the upper arm, bending the elbow.",
    basicActions: ["Elbow flexion", "Forearm supination"],
    visualRegionIds: ["biceps-front"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  triceps: {
    id: "triceps",
    canonicalMuscle: "triceps",
    displayName: MUSCLE_DISPLAY_NAME.triceps,
    scientificName: "Triceps Brachii",
    commonAliases: ["tricep"],
    vietnameseAliases: ["tay sau", "cơ tay sau"],
    preferredView: "back",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The three-headed muscle on the back of the upper arm, straightening the elbow.",
    basicActions: ["Elbow extension"],
    visualRegionIds: ["triceps-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  forearms: {
    id: "forearms",
    canonicalMuscle: "forearms",
    displayName: MUSCLE_DISPLAY_NAME.forearms,
    scientificName: "Forearm flexor/extensor group",
    commonAliases: ["forearm"],
    vietnameseAliases: ["cẳng tay"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The muscle group running from the elbow to the wrist, controlling grip and wrist movement.",
    basicActions: ["Wrist flexion/extension", "Grip"],
    visualRegionIds: ["forearms-front"],
    sourceIds: ["physio_pedia"],
  },
  quadriceps: {
    id: "quadriceps",
    canonicalMuscle: "quadriceps",
    displayName: MUSCLE_DISPLAY_NAME.quadriceps,
    scientificName: "Quadriceps Femoris",
    commonAliases: ["quads"],
    vietnameseAliases: ["đùi trước", "cơ đùi trước"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The four-headed muscle group on the front of the thigh, straightening the knee.",
    basicActions: ["Knee extension", "Hip flexion (rectus femoris)"],
    visualRegionIds: ["quadriceps-front"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  hamstrings: {
    id: "hamstrings",
    canonicalMuscle: "hamstrings",
    displayName: MUSCLE_DISPLAY_NAME.hamstrings,
    scientificName: "Hamstring group (biceps femoris, semitendinosus, semimembranosus)",
    commonAliases: ["hams"],
    vietnameseAliases: ["đùi sau", "cơ đùi sau"],
    preferredView: "back",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The muscle group on the back of the thigh, bending the knee and extending the hip.",
    basicActions: ["Knee flexion", "Hip extension"],
    visualRegionIds: ["hamstrings-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  glutes: {
    id: "glutes",
    canonicalMuscle: "glutes",
    displayName: MUSCLE_DISPLAY_NAME.glutes,
    scientificName: "Gluteus Maximus / Medius / Minimus",
    commonAliases: ["glute"],
    vietnameseAliases: ["mông", "cơ mông"],
    preferredView: "back",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The muscle group forming the buttocks, the primary driver of hip extension.",
    basicActions: ["Hip extension", "Hip abduction (medius/minimus)"],
    visualRegionIds: ["glutes-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  calves: {
    id: "calves",
    canonicalMuscle: "calves",
    displayName: MUSCLE_DISPLAY_NAME.calves,
    scientificName: "Gastrocnemius / Soleus",
    commonAliases: ["calf"],
    vietnameseAliases: ["bắp chân", "cơ bắp chân"],
    preferredView: "back",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The muscle group on the back of the lower leg, pointing the foot downward.",
    basicActions: ["Ankle plantarflexion"],
    visualRegionIds: ["calves-back"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  abdominals: {
    id: "abdominals",
    canonicalMuscle: "abdominals",
    displayName: MUSCLE_DISPLAY_NAME.abdominals,
    scientificName: "Rectus Abdominis / Obliques",
    commonAliases: ["abs", "core"],
    vietnameseAliases: ["bụng", "cơ bụng"],
    preferredView: "front",
    depth: "superficial",
    parentRegion: null,
    shortDescription: "The muscle group across the front and sides of the torso, flexing and rotating the trunk.",
    basicActions: ["Trunk flexion", "Trunk rotation", "Pelvic stabilization"],
    visualRegionIds: ["abdominals-front"],
    sourceIds: ["kenhub_muscle_anatomy"],
  },
  lower_back: {
    id: "lower_back",
    canonicalMuscle: "lower_back",
    displayName: MUSCLE_DISPLAY_NAME.lower_back,
    scientificName: "Erector Spinae",
    commonAliases: ["erectors", "spinal erectors"],
    vietnameseAliases: ["lưng dưới", "cơ lưng dưới"],
    preferredView: "back",
    depth: "deep",
    parentRegion: null,
    shortDescription: "The muscle column running along the spine, extending the back and maintaining posture.",
    basicActions: ["Spinal extension", "Postural stabilization"],
    visualRegionIds: ["lower_back-back"],
    sourceIds: ["physio_pedia"],
  },
};

export const MUSCLE_ATLAS_ENTRIES: Record<CanonicalMuscle, MuscleAtlasEntry> = ENTRIES;

export function getMuscleAtlasEntry(muscle: CanonicalMuscle): MuscleAtlasEntry {
  return ENTRIES[muscle];
}
