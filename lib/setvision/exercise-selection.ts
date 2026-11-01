import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library";
import type { SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * What the user says they did, kept apart from what SetVision can measure.
 *
 * Choosing an exercise only settles WHICH movement it is. Whether anything
 * is measured depends on the movement's capability, and how well it is
 * measured still depends on the pose evidence — a choice never upgrades either.
 */

/**
 * SUPPORTED_ANALYSIS: an engine, its video constraints and tests exist (squat).
 * LIMITED_EXPERIMENTAL_ANALYSIS: an engine and synthetic tests exist, but it
 *   counted no reps on the real clips available so far (deadlift).
 * MANUAL_LABEL_ONLY: no movement-specific engine — the video can be reviewed,
 *   nothing is measured, nothing is routed through another lift's counter.
 */
export type AnalysisCapability = "SUPPORTED_ANALYSIS" | "LIMITED_EXPERIMENTAL_ANALYSIS" | "MANUAL_LABEL_ONLY";

/** catalogue = Muscle Fitness exercise catalogue; setvision = SetVision's own movement list (not a catalogue record); custom = typed by the user; auto_suggestion = an Auto-detect suggestion the user confirmed. */
export type ExerciseSource = "catalogue" | "setvision" | "custom" | "auto_suggestion";

export type ExerciseOption = {
  /** Stable key: `catalogue:<slug>` or `setvision:<slug>`. */
  key: string;
  label: string;
  aliases: string[];
  source: "catalogue" | "setvision";
  /** Catalogue uuid when the catalogue has a fixed one; null for slug-only legacy rows and SetVision-list entries. */
  catalogueId: string | null;
  engine: SetVisionExerciseId | null;
  capability: AnalysisCapability;
};

export type SelectedExercise = {
  label: string;
  source: ExerciseSource;
  /** Option key for catalogue/setvision/auto_suggestion picks; null for a custom name. */
  key: string | null;
  catalogueId: string | null;
  engine: SetVisionExerciseId | null;
  capability: AnalysisCapability;
};

/** Persisted identity of a saved analysis (rides in setvision_analyses.per_rep). */
export type SavedExerciseIdentity = {
  key: string;
  label: string;
  source: Exclude<ExerciseSource, "custom">;
  catalogueId: string | null;
};

/**
 * Engines exposed for analysis. bench_press has an elbow-angle config but no
 * real-footage evidence at all, so it is not routed anywhere: MANUAL_LABEL_ONLY.
 */
export const ENGINE_CAPABILITY: Record<SetVisionExerciseId, AnalysisCapability> = {
  squat: "SUPPORTED_ANALYSIS",
  deadlift: "LIMITED_EXPERIMENTAL_ANALYSIS",
  bench_press: "MANUAL_LABEL_ONLY",
};

/** Catalogue slug → engine. Only movements the engine actually models (knee-dominant squat, floor-start hinge). */
const CATALOGUE_ENGINE: Record<string, SetVisionExerciseId> = {
  "barbell-back-squat": "squat",
};

const CATALOGUE_ALIASES: Record<string, string[]> = {
  "barbell-bench-press": ["bench press", "flat bench", "bench"],
  "flat-dumbbell-press": ["dumbbell bench press", "db bench press"],
  "incline-dumbbell-press": ["incline bench press", "incline press"],
  "smith-incline-press": ["incline bench press", "incline press"],
  "barbell-overhead-press": ["overhead press", "ohp", "military press", "shoulder press"],
  "seated-cable-row": ["cable row"],
  "lat-pulldown": ["pulldown", "lat pull down"],
  "barbell-back-squat": ["squat", "back squat"],
  "romanian-deadlift": ["rdl"],
  "dumbbell-romanian-deadlift": ["rdl", "db rdl"],
  "ez-bar-curl": ["biceps curl", "bicep curl", "curl"],
  "cable-curl": ["biceps curl", "bicep curl", "curl"],
  "incline-dumbbell-curl": ["biceps curl", "bicep curl", "curl"],
  "cable-triceps-pushdown": ["triceps pushdown", "tricep pushdown", "pushdown"],
  "bulgarian-split-squat": ["split squat"],
};

/** Movements SetVision lists that the catalogue does not have. Selector entries only — never inserted as catalogue rows. */
const SETVISION_ONLY: Array<Omit<ExerciseOption, "key" | "source" | "catalogueId" | "capability"> & { slug: string }> = [
  { slug: "squat", label: "Squat", aliases: ["bodyweight squat", "air squat", "goblet squat", "paused squat", "front squat"], engine: "squat" },
  { slug: "deadlift", label: "Deadlift", aliases: ["conventional deadlift", "barbell deadlift"], engine: "deadlift" },
  { slug: "incline-bench-press", label: "Incline Bench Press", aliases: ["incline barbell bench press", "incline press"], engine: null },
  { slug: "barbell-row", label: "Barbell Row", aliases: ["bent-over row", "bent over row", "bb row"], engine: null },
  { slug: "biceps-curl", label: "Biceps Curl", aliases: ["dumbbell curl", "bicep curl", "curl"], engine: null },
  { slug: "lunge", label: "Lunge", aliases: ["walking lunge", "forward lunge", "reverse lunge"], engine: null },
];

const capabilityOf = (engine: SetVisionExerciseId | null): AnalysisCapability =>
  engine ? ENGINE_CAPABILITY[engine] : "MANUAL_LABEL_ONLY";

export const EXERCISE_OPTIONS: ExerciseOption[] = [
  ...SETVISION_ONLY.map(({ slug, ...rest }) => ({
    ...rest,
    key: `setvision:${slug}`,
    source: "setvision" as const,
    catalogueId: null,
    capability: capabilityOf(rest.engine),
  })),
  ...EXERCISE_CATALOGUE.flatMap((item) => {
    if (!item.slug) return [];
    const engine = CATALOGUE_ENGINE[item.slug] ?? null;
    return [{
      key: `catalogue:${item.slug}`,
      label: item.name,
      aliases: CATALOGUE_ALIASES[item.slug] ?? [],
      source: "catalogue" as const,
      catalogueId: item.id,
      engine,
      capability: capabilityOf(engine),
    }];
  }),
];

const OPTION_BY_KEY = new Map(EXERCISE_OPTIONS.map((o) => [o.key, o]));

export function findExerciseOption(key: string): ExerciseOption | null {
  return OPTION_BY_KEY.get(key) ?? null;
}

/** The generic SetVision-list option for an engine — what a confirmed Auto-detect suggestion resolves to. */
export function optionForEngine(engine: SetVisionExerciseId): ExerciseOption {
  const key = engine === "bench_press" ? "catalogue:barbell-bench-press" : `setvision:${engine}`;
  return OPTION_BY_KEY.get(key)!;
}

export function selectionFromOption(option: ExerciseOption, source: "catalogue" | "setvision" | "auto_suggestion" = option.source): SelectedExercise {
  return {
    label: option.label,
    source,
    key: option.key,
    catalogueId: option.catalogueId,
    engine: option.engine,
    capability: option.capability,
  };
}

/** Lowercase, accents/diacritics folded, punctuation → spaces, whitespace collapsed. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Options whose name or an alias contains every query word; name matches first. */
export function searchExerciseOptions(query: string, limit = 8): ExerciseOption[] {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const scored: Array<{ option: ExerciseOption; rank: number }> = [];
  for (const option of EXERCISE_OPTIONS) {
    const name = normalizeSearchText(option.label);
    const aliases = option.aliases.map(normalizeSearchText);
    const inName = words.every((w) => name.includes(w));
    const inAlias = aliases.some((a) => words.every((w) => a.includes(w)));
    if (!inName && !inAlias) continue;
    const joined = words.join(" ");
    const rank = name === joined ? 0 : name.startsWith(joined) ? 1 : inName ? 2 : aliases.includes(joined) ? 3 : 4;
    scored.push({ option, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.option.label.localeCompare(b.option.label))
    .slice(0, limit)
    .map((s) => s.option);
}

export const CUSTOM_EXERCISE_MAX_LENGTH = 80;

export type CustomNameResult = { ok: true; label: string } | { ok: false; error: string };

/**
 * A user-typed exercise name. Keeps the user's own text (case, script,
 * accents) and only trims the ends and collapses runs of whitespace.
 * Rendered as React text, never as HTML.
 */
export function validateCustomExerciseName(raw: string): CustomNameResult {
  const label = raw.normalize("NFC").replace(/\s+/g, " ").trim();

  if (!label) return { ok: false, error: "Enter an exercise name." };
  if (/[\p{Cc}\p{Cf}]/u.test(label)) return { ok: false, error: "The name contains characters that can't be shown." };
  if (!/[\p{L}\p{N}]/u.test(label)) return { ok: false, error: "Use at least one letter or number." };
  if ([...label].length > CUSTOM_EXERCISE_MAX_LENGTH) {
    return { ok: false, error: `Keep it to ${CUSTOM_EXERCISE_MAX_LENGTH} characters or fewer.` };
  }

  return { ok: true, label };
}

export function customSelection(label: string): SelectedExercise {
  return { label, source: "custom", key: null, catalogueId: null, engine: null, capability: "MANUAL_LABEL_ONLY" };
}

export const CAPABILITY_TEXT: Record<AnalysisCapability, { badge: string; detail: string }> = {
  SUPPORTED_ANALYSIS: {
    badge: "Automated analysis",
    detail: "Rep count, phase timing, joint range and consistency from pose tracking. Works best filmed side-on with the whole body in frame. Accuracy has not been independently validated.",
  },
  LIMITED_EXPERIMENTAL_ANALYSIS: {
    badge: "Experimental analysis",
    detail: "An experimental hip-angle counter. It has only been checked on synthetic poses and counted no reps on the real deadlift clips tried so far — treat every number as unverified.",
  },
  MANUAL_LABEL_ONLY: {
    badge: "No automated analysis",
    detail: "SetVision has no movement model for this exercise, so it won't count reps or measure tempo, range or technique. You can still review your video here.",
  },
};

export const SOURCE_TEXT: Record<ExerciseSource, string> = {
  catalogue: "From the exercise catalogue",
  setvision: "From SetVision's movement list",
  custom: "Custom name you entered",
  auto_suggestion: "Auto-detect suggestion, confirmed by you",
};
