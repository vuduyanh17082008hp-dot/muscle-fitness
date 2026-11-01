import { MUSCLE_DISPLAY_NAME, resolveCanonicalMuscle, resolveCanonicalMuscles, type CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { EXERCISE_CATALOGUE, type ExerciseLibraryItem } from "@/lib/workouts/exercise-library";
import {
  EXERCISE_PROFILES,
  MACHINE_VS_FREE_WEIGHT,
  matrixRowsFor,
  type EquipmentTag,
  type EvidenceNote,
  type ExerciseComplexity,
  type ExerciseProfile,
} from "@/lib/workouts/exercise-profiles";

/**
 * Adaptive Workouts 2.0 — deterministic exercise substitution.
 *
 * Order of reasoning (spec §13): safety context first, then hard eligibility
 * (equipment / occupied station), then fit (target, movement, complexity vs. the
 * athlete's stated experience, preferences, familiarity). There is no numeric
 * score anywhere: candidates are sorted by an explicit tuple of categorical
 * checks, and every label shown to the athlete is derived from profile fields a
 * coach could verify. Pure and synchronous — runs on the server and the client.
 */

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type SubstitutionReason =
  | "machine_occupied"
  | "equipment_unavailable"
  | "discomfort"
  | "unfamiliar"
  | "preference"
  | "more_options";

export type EquipmentConstraint = "no_cable" | "no_smith" | "no_machines" | "dumbbells_only" | "home_gym";

export type SubstitutionPreference =
  | "similar_movement"
  | "different_movement"
  | "less_equipment"
  | "more_stable"
  | "easier_setup"
  | "prefer_machine"
  | "prefer_free_weights"
  | "limited_space";

export type AlternativeCategory =
  | "close"
  | "different_movement"
  | "limited_equipment"
  | "lower_complexity"
  | "higher_complexity";

export type SubstitutionRequest = {
  current: ExerciseLibraryItem;
  /** Defaults to the current exercise's primary muscle. */
  target?: CanonicalMuscle;
  reasons?: SubstitutionReason[];
  constraints?: EquipmentConstraint[];
  preferences?: SubstitutionPreference[];
  /** Self-reported only (fitness_profiles.experience or the athlete's in-sheet choice). Never inferred. */
  experience?: ExperienceLevel | null;
  /** Slugs the athlete has completed working sets of (any session). */
  familiarSlugs?: ReadonlySet<string>;
  /** Active pain/illness training hold from the daily decision. */
  hold?: boolean;
  catalogue?: ExerciseLibraryItem[];
};

export type Alternative = {
  item: ExerciseLibraryItem;
  profile: ExerciseProfile;
  category: AlternativeCategory;
  /** Same movement family and mechanic as the current exercise. */
  similarMovement: boolean;
  /** The target is only a secondary mover for this exercise. */
  targetIsSecondary: boolean;
  curated: boolean;
  familiar: boolean;
  why: string;
  differences: string[];
  loading: string;
  experienceNote: string | null;
  evidence: EvidenceNote[];
};

export type ExcludedAlternative = { item: ExerciseLibraryItem; reason: string };

export type SubstitutionResult = {
  target: CanonicalMuscle | null;
  alternatives: Alternative[];
  notRecommended: ExcludedAlternative[];
  notes: string[];
  /** False under a training hold: alternatives are reference only, never an action. */
  canApply: boolean;
};

const EXPERIENCE_LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced"];

export function parseExperience(value: string | null | undefined): ExperienceLevel | null {
  const normalized = value?.trim().toLowerCase();
  return EXPERIENCE_LEVELS.find((level) => level === normalized) ?? null;
}

const COMPLEXITY_RANK: Record<ExerciseComplexity, number> = { low: 0, moderate: 1, high: 2 };
const STABILITY_RANK = { guided: 0, supported: 1, free: 2 } as const;

const MOVEMENT_FAMILY: Record<string, string> = {
  "horizontal push": "press",
  "incline push": "press",
  "vertical push": "overhead_press",
  "angled push": "overhead_press",
  "horizontal adduction": "fly",
  "vertical pull": "vertical_pull",
  "horizontal pull": "row",
  "horizontal pull (wide)": "row",
  "horizontal abduction": "rear_fly",
  "shoulder abduction": "lateral_raise",
  squat: "squat",
  "single-leg squat": "squat",
  "knee extension": "knee_extension",
  "hip hinge": "hinge",
  "knee flexion": "knee_flexion",
  "hip extension": "hip_extension",
  "plantar flexion": "calf_raise",
  "elbow flexion": "curl",
  "elbow extension": "triceps_extension",
  "spinal flexion": "trunk_flexion",
  "hip flexion": "hip_flexion",
  "isometric hold": "isometric",
};

const familyOf = (item: ExerciseLibraryItem) => MOVEMENT_FAMILY[item.movementPattern.trim().toLowerCase()] ?? item.movementPattern;

const LIMITED_EQUIPMENT: EquipmentTag[] = ["dumbbell", "bench"];
const HOME_GYM: EquipmentTag[] = ["dumbbell", "bench", "barbell", "ez_bar", "pull_up_bar", "landmine"];

const EQUIPMENT_LABEL: Record<EquipmentTag, string> = {
  barbell: "barbell",
  dumbbell: "dumbbells",
  machine: "machine",
  cable: "cable station",
  smith_machine: "Smith machine",
  bench: "bench",
  pull_up_bar: "pull-up bar",
  ez_bar: "EZ bar",
  preacher_bench: "preacher bench",
  landmine: "landmine",
};

export const CONSTRAINT_LABEL: Record<EquipmentConstraint, string> = {
  no_cable: "No cable machine",
  no_smith: "No Smith machine",
  no_machines: "No machines",
  dumbbells_only: "Dumbbells only",
  home_gym: "Home gym",
};

function excludedBy(
  profile: ExerciseProfile,
  constraints: EquipmentConstraint[],
): string | null {
  const needs = profile.needs;
  const missing = (tags: EquipmentTag[]) => needs.filter((tag) => tags.includes(tag));
  const outside = (allowed: EquipmentTag[]) => needs.filter((tag) => !allowed.includes(tag));

  for (const constraint of constraints) {
    let hit: EquipmentTag[] = [];
    if (constraint === "no_cable") hit = missing(["cable"]);
    if (constraint === "no_smith") hit = missing(["smith_machine"]);
    if (constraint === "no_machines") hit = missing(["machine", "smith_machine", "cable"]);
    if (constraint === "dumbbells_only") hit = outside(LIMITED_EQUIPMENT);
    if (constraint === "home_gym") hit = outside(HOME_GYM);
    if (hit.length > 0) {
      return `Needs a ${hit.map((tag) => EQUIPMENT_LABEL[tag]).join(" and ")} — you said: ${CONSTRAINT_LABEL[constraint].toLowerCase()}.`;
    }
  }
  return null;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function equipmentPhrase(profile: ExerciseProfile): string {
  return profile.needs.length === 0 ? "no equipment" : joinList(profile.needs.map((tag) => EQUIPMENT_LABEL[tag]));
}

function differencesBetween(current: ExerciseLibraryItem, a: ExerciseProfile, candidate: ExerciseLibraryItem, b: ExerciseProfile): string[] {
  const out: string[] = [];
  if (a.mechanic !== b.mechanic) {
    out.push(
      b.mechanic === "isolation"
        ? `Single-joint: it trains the target muscle but not the multi-joint effect of ${current.name}.`
        : `Multi-joint: more muscles share the work than in ${current.name}.`,
    );
  }
  if (a.jointAction !== b.jointAction) out.push(`Joint action: ${b.jointAction.toLowerCase()} (vs ${a.jointAction.toLowerCase()}).`);
  if (a.laterality !== b.laterality) {
    out.push(b.laterality === "unilateral" ? "One side at a time — more balance demand, lower load per side." : "Both sides together — loads aren't comparable to a one-side lift.");
  }
  if (a.axialLoad !== b.axialLoad) out.push(b.axialLoad ? "Loads the spine (axial load)." : "Takes load off the spine compared with the original.");
  if (a.stability !== b.stability) {
    out.push(
      b.stability === "guided"
        ? "Fixed, guided path — less balance and setup to manage."
        : b.stability === "supported"
          ? "Body braced on a bench or pad, but the load moves freely."
          : "Free-moving — you control balance and path.",
    );
  }
  if (a.needs.join() !== b.needs.join()) out.push(`Uses ${equipmentPhrase(b)}.`);
  void candidate;
  return out;
}

function loadingGuidance(current: ExerciseLibraryItem, a: ExerciseProfile, b: ExerciseProfile): string {
  if (b.needs.length === 0) return `Start with bodyweight and log it as a new exercise — the ${current.name} load doesn't apply.`;
  const sameKit = a.needs.join() === b.needs.join() && a.laterality === b.laterality && a.mechanic === b.mechanic;
  if (sameKit) return `Loads may be similar but won't match exactly — start a little lighter than your ${current.name} weight and adjust after the first set.`;
  const perSide = b.laterality === "unilateral" && a.laterality === "bilateral" ? " Per-side loads will be much lower." : "";
  return `Don't carry over the ${current.name} weight — the equipment and leverage differ. Pick a load you can control for the planned reps with 2–3 reps in reserve, then log it fresh.${perSide}`;
}

function experienceNote(
  experience: ExperienceLevel | null,
  candidate: ExerciseProfile,
  familiar: boolean,
): { note: string | null; penalty: number } {
  const rank = COMPLEXITY_RANK[candidate.complexity];
  if (rank < 2) return { note: null, penalty: 0 };
  if (familiar) return { note: "You've logged this before.", penalty: 0 };
  if (experience === "advanced") {
    return { note: "New to you — your training level doesn't make an unfamiliar lift familiar. Start light and learn the pattern.", penalty: 1 };
  }
  if (experience === "intermediate") {
    return { note: "Higher setup and coordination demand — start light if it's new to you.", penalty: 1 };
  }
  return {
    note:
      experience === "beginner"
        ? "Higher setup and coordination demand — worth learning with guidance once simpler versions feel solid."
        : "Higher setup and coordination demand. Set your experience level to tailor this.",
    penalty: 2,
  };
}

function primaryMuscles(item: ExerciseLibraryItem): CanonicalMuscle[] {
  return resolveCanonicalMuscles([item.primaryMuscle]);
}

export function findAlternatives(request: SubstitutionRequest): SubstitutionResult {
  const catalogue = request.catalogue ?? EXERCISE_CATALOGUE;
  const reasons = request.reasons ?? [];
  const constraints = request.constraints ?? [];
  const preferences = new Set(request.preferences ?? []);
  const familiarSlugs = request.familiarSlugs ?? new Set<string>();
  const experience = request.experience ?? null;
  const current = request.current;
  const currentProfile = EXERCISE_PROFILES[current.slug ?? ""] ?? null;
  const target = request.target ?? resolveCanonicalMuscle(current.primaryMuscle);

  const notes: string[] = [];
  if (request.hold) {
    notes.push(
      "Training is on hold today (pain or illness reported). Alternatives are shown for reference only — swapping an exercise doesn't lift the hold.",
    );
  }
  if (reasons.includes("discomfort")) {
    notes.push(
      "An alternative isn't a diagnosis or a guaranteed pain-free option. If an exercise hurts, stop it and record how you feel in Recovery. More stable, lower-spinal-load options are listed first.",
    );
  }
  if (experience === null) {
    notes.push("Your experience level isn't set, so accessible options come first. Choose a level to tailor the list.");
  }

  if (!currentProfile || !target) {
    return {
      target,
      alternatives: [],
      notRecommended: [],
      notes: [...notes, "This exercise has no movement profile yet, so alternatives can't be matched reliably."],
      canApply: false,
    };
  }

  const curatedSlugs = new Set(
    matrixRowsFor(current.slug ?? "").flatMap((row) => [row.preferred, ...row.alternatives]),
  );
  const occupied = reasons.includes("machine_occupied");
  const wantsStable = preferences.has("more_stable") || reasons.includes("discomfort");
  const wantsEasy = preferences.has("easier_setup") || reasons.includes("unfamiliar");

  const included: Array<{ alt: Alternative; key: Array<number | string> }> = [];
  const excluded: Array<{ entry: ExcludedAlternative; curated: boolean }> = [];

  for (const item of catalogue) {
    if (!item.slug || item.slug === current.slug) continue;
    const profile = EXERCISE_PROFILES[item.slug];
    if (!profile) continue;

    const primaries = primaryMuscles(item);
    const secondaries = resolveCanonicalMuscles(item.secondaryMuscles);
    const curated = curatedSlugs.has(item.slug);
    const targetIsPrimary = primaries.includes(target);
    const targetIsSecondary = !targetIsPrimary && secondaries.includes(target);
    // Secondary-only candidates qualify only through a curated pairing (e.g. split squat for glutes).
    if (!targetIsPrimary && !(targetIsSecondary && curated)) continue;

    if (occupied) {
      // Same named station, or — when the current lift has none — the same non-dumbbell kit (cable stack, bench, bar).
      const sameStation = Boolean(profile.station) && profile.station === currentProfile.station;
      const sharedKit = currentProfile.station
        ? []
        : profile.needs.filter((tag) => tag !== "dumbbell" && currentProfile.needs.includes(tag));
      if (sameStation || sharedKit.length > 0) {
        const what = sameStation ? `${current.name} station` : sharedKit.map((tag) => EQUIPMENT_LABEL[tag]).join(" and ");
        excluded.push({ entry: { item, reason: `Uses the same ${what} that's taken.` }, curated });
        continue;
      }
    }
    const blocked = excludedBy(profile, constraints);
    if (blocked) {
      excluded.push({ entry: { item, reason: blocked }, curated });
      continue;
    }

    const similarMovement = familyOf(item) === familyOf(current) && profile.mechanic === currentProfile.mechanic;
    const familiar = familiarSlugs.has(item.slug);
    const complexityDelta = COMPLEXITY_RANK[profile.complexity] - COMPLEXITY_RANK[currentProfile.complexity];
    const limitedKit = profile.needs.every((tag) => LIMITED_EQUIPMENT.includes(tag));
    const equipmentContext = constraints.length > 0 || preferences.has("less_equipment") || preferences.has("limited_space");

    let category: AlternativeCategory;
    if (similarMovement && !targetIsSecondary) category = "close";
    else if (limitedKit && equipmentContext) category = "limited_equipment";
    else if (complexityDelta < 0 && (wantsEasy || experience !== "advanced")) category = "lower_complexity";
    else if (complexityDelta > 0 && experience === "advanced") category = "higher_complexity";
    else category = "different_movement";

    const targetName = MUSCLE_DISPLAY_NAME[target].toLowerCase();
    const whyParts: string[] = [];
    if (targetIsSecondary) {
      whyParts.push(
        `${item.name} mainly trains the ${joinList(primaries.map((m) => MUSCLE_DISPLAY_NAME[m].toLowerCase()))}; the ${targetName} work as a secondary mover, so it's a different emphasis rather than a replacement.`,
      );
    } else if (similarMovement) {
      whyParts.push(`${item.name} trains the ${targetName} with a similar movement (${profile.jointAction.toLowerCase()}).`);
    } else {
      whyParts.push(
        `${item.name} trains the ${targetName} through a different movement — ${profile.jointAction.toLowerCase()} — so it isn't mechanically equivalent to ${current.name}.`,
      );
    }
    if (occupied) whyParts.push("It doesn't need the station you're waiting on.");
    if (wantsStable && profile.stability !== "free") {
      whyParts.push(profile.stability === "guided" ? "The guided path adds external stability." : "The bench or pad supports your body.");
    }
    if (equipmentContext && limitedKit) {
      whyParts.push(profile.needs.length === 0 ? "Needs no equipment." : `Needs only ${equipmentPhrase(profile)}.`);
    }
    if (complexityDelta < 0) whyParts.push("Setup and coordination are simpler.");

    const xp = experienceNote(experience, profile, familiar);
    const machineSwitch =
      (profile.stability === "guided") !== (currentProfile.stability === "guided") ? [MACHINE_VS_FREE_WEIGHT] : [];
    const evidence = [...(profile.evidence ?? []), ...machineSwitch].filter(
      (note, index, all) => all.findIndex((other) => other.summary === note.summary) === index,
    );

    const prefMatches =
      (preferences.has("prefer_machine") && profile.stability === "guided" ? 1 : 0) +
      (preferences.has("prefer_free_weights") && profile.stability !== "guided" && profile.needs.some((t) => t === "dumbbell" || t === "barbell" || t === "ez_bar") ? 1 : 0) +
      (preferences.has("less_equipment") && limitedKit ? 1 : 0) +
      (preferences.has("limited_space") && limitedKit ? 1 : 0) +
      (wantsStable && profile.stability !== "free" ? 1 : 0) +
      (wantsEasy && profile.complexity === "low" ? 1 : 0);

    const relation = targetIsSecondary ? 2 : similarMovement ? 0 : 1;
    const relationRank = preferences.has("different_movement") && relation < 2 ? 1 - relation : relation;
    const cautious = experience === null || experience === "beginner" || wantsEasy;

    included.push({
      alt: {
        item,
        profile,
        category,
        similarMovement,
        targetIsSecondary,
        curated,
        familiar,
        why: whyParts.join(" "),
        differences: differencesBetween(current, currentProfile, item, profile),
        loading: loadingGuidance(current, currentProfile, profile),
        experienceNote: xp.note,
        evidence,
      },
      // Explicit, ordered checks — read left to right. No weighted score.
      key: [
        xp.penalty,
        wantsStable ? STABILITY_RANK[profile.stability] + (profile.axialLoad ? 1 : 0) : 0,
        -prefMatches,
        relationRank,
        curated ? 0 : 1,
        familiar ? 0 : 1,
        cautious ? COMPLEXITY_RANK[profile.complexity] : 0,
        item.name,
      ],
    });
  }

  included.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      if (a.key[i] === b.key[i]) continue;
      return a.key[i] < b.key[i] ? -1 : 1;
    }
    return 0;
  });
  excluded.sort((a, b) => Number(b.curated) - Number(a.curated) || a.entry.item.name.localeCompare(b.entry.item.name));

  return {
    target,
    alternatives: included.map((entry) => entry.alt),
    notRecommended: excluded.slice(0, 4).map((entry) => entry.entry),
    notes,
    canApply: !request.hold,
  };
}

export function findCatalogueExercise(
  key: { slug?: string | null; name?: string | null },
  catalogue: ExerciseLibraryItem[] = EXERCISE_CATALOGUE,
): ExerciseLibraryItem | null {
  if (key.slug) {
    const bySlug = catalogue.find((item) => item.slug === key.slug);
    if (bySlug) return bySlug;
  }
  const name = key.name?.trim().toLowerCase();
  return name ? catalogue.find((item) => item.name.toLowerCase() === name) ?? null : null;
}

export const CATEGORY_LABEL: Record<AlternativeCategory, string> = {
  close: "Close alternative",
  different_movement: "Different movement, same target",
  limited_equipment: "Limited-equipment option",
  lower_complexity: "Lower-complexity option",
  higher_complexity: "Higher-complexity option",
};

export const EVIDENCE_LABEL = {
  direct_comparative: "Direct comparative evidence",
  indirect_biomechanical: "Indirect biomechanical evidence",
  practical_coaching: "Practical coaching rationale",
} as const;
