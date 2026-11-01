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
 * ANALYSIS_VERIFIED: an engine whose rep counts were checked against several
 *   real clips of this movement, with regression tests (free squat only).
 * ANALYSIS_EXPERIMENTAL: a movement-family engine with synthetic tests and at
 *   most a few real or rendered clips — every number is unverified.
 * MANUAL_REVIEW_SUPPORTED: no engine for this movement — the video can be
 *   reviewed, reps marked by hand, notes kept and the review saved; nothing is
 *   measured and nothing is routed through another movement's counter.
 *
 * (UNSUPPORTED_INPUT is not an exercise capability: it is what an analysis
 * reports when a particular clip can't be analysed — see
 * SetVisionAnalysis.abstainReason.)
 */
export type AnalysisCapability = "ANALYSIS_VERIFIED" | "ANALYSIS_EXPERIMENTAL" | "MANUAL_REVIEW_SUPPORTED";

/** catalogue = Muscle Fitness exercise catalogue; setvision = SetVision's own movement list (not a catalogue record); custom = typed by the user; auto_suggestion = an Auto-detect suggestion the user confirmed. */
export type ExerciseSource = "catalogue" | "setvision" | "custom" | "auto_suggestion";

export type ExerciseCategory = "Legs" | "Hinge & glutes" | "Chest & press" | "Shoulders" | "Back & pull" | "Arms" | "Core";

export const CATEGORY_ORDER: ExerciseCategory[] = ["Legs", "Hinge & glutes", "Chest & press", "Shoulders", "Back & pull", "Arms", "Core"];

export type ExerciseOption = {
  /** Stable key: `catalogue:<slug>` or `setvision:<slug>`. */
  key: string;
  label: string;
  aliases: string[];
  source: "catalogue" | "setvision";
  /** Catalogue uuid when the catalogue has a fixed one; null for slug-only legacy rows and SetVision-list entries. */
  catalogueId: string | null;
  category: ExerciseCategory;
  engine: SetVisionExerciseId | null;
  capability: AnalysisCapability;
  /** Why there is no engine (manual-review exercises only). */
  manualReason: string | null;
};

export type SelectedExercise = {
  label: string;
  source: ExerciseSource;
  /** Option key for catalogue/setvision/auto_suggestion picks; null for a custom name. */
  key: string | null;
  catalogueId: string | null;
  engine: SetVisionExerciseId | null;
  capability: AnalysisCapability;
  manualReason: string | null;
};

/** Persisted identity of a saved analysis or review (rides in setvision_analyses.per_rep). */
export type SavedExerciseIdentity = {
  /** Null for a custom name. */
  key: string | null;
  label: string;
  source: ExerciseSource;
  catalogueId: string | null;
};

/** Default capability of each engine; an option may only lower it (e.g. hack squat on the squat engine). */
export const ENGINE_CAPABILITY: Record<SetVisionExerciseId, AnalysisCapability> = {
  squat: "ANALYSIS_VERIFIED",
  deadlift: "ANALYSIS_EXPERIMENTAL",
  bench_press: "ANALYSIS_EXPERIMENTAL",
  vertical_press: "ANALYSIS_EXPERIMENTAL",
  vertical_pull: "ANALYSIS_EXPERIMENTAL",
  horizontal_pull: "ANALYSIS_EXPERIMENTAL",
  elbow_flexion: "ANALYSIS_EXPERIMENTAL",
  triceps_pushdown: "ANALYSIS_EXPERIMENTAL",
  overhead_triceps_extension: "ANALYSIS_EXPERIMENTAL",
  lateral_raise: "ANALYSIS_EXPERIMENTAL",
};

/** Why a movement has no engine — one sentence each, shown to the user and in the coverage matrix. */
const NO_ENGINE = {
  fly: "The arms sweep across the body (shoulder horizontal adduction/abduction), which a single 2D camera does not see as a clean joint angle.",
  splitStance: "A split stance needs the front leg tracked on its own; the squat engine mixes both legs and its thresholds do not fit a split squat.",
  calf: "The pose model has no heel or toe points, so ankle plantar flexion cannot be measured.",
  legCurl: "The machine pad hides the lower leg in most camera angles, and no knee-flexion engine has been checked on real footage.",
  legPress: "No leg-press engine yet: the reclined sled and changing camera angles in the only real clip available did not give a reliable knee-angle cycle.",
  legExtension: "No seated knee-extension engine has been built or checked; squat thresholds do not apply to it.",
  stepUp: "The working leg and body height change through the rep; no step-up engine has been built.",
  hipThrust: "No hip-extension engine has been built or checked on real footage (the bench and bar hide the hips in most angles).",
  spinal: "The pose model has no spine points, so trunk flexion cannot be separated from hip movement.",
  hipFlexion: "No hip-flexion (leg raise) engine has been built or checked on real footage.",
  isometric: "A hold has no reps to count, and timing a hold is not implemented.",
  landmine: "An angled one-arm press fits neither the overhead nor the horizontal press position, and no engine has been checked for it.",
} as const;

type CatalogueEntry = {
  category: ExerciseCategory;
  engine?: SetVisionExerciseId;
  /** Lower than the engine default when this variant was not part of the engine's evidence. */
  capability?: AnalysisCapability;
  manualReason?: string;
  aliases?: string[];
};

/**
 * Every catalogue slug's movement family, checked by hand against the
 * movement — never by name similarity. A test fails if the catalogue gains
 * an exercise that is not listed here.
 */
export const CATALOGUE_COVERAGE: Record<string, CatalogueEntry> = {
  "barbell-bench-press": { category: "Chest & press", engine: "bench_press", aliases: ["bench press", "flat bench", "bench"] },
  "incline-dumbbell-press": { category: "Chest & press", engine: "bench_press", aliases: ["incline bench press", "incline press"] },
  "machine-chest-press": { category: "Chest & press", engine: "bench_press", aliases: ["chest press"] },
  "cable-fly": { category: "Chest & press", manualReason: NO_ENGINE.fly, aliases: ["chest fly"] },
  "barbell-overhead-press": { category: "Shoulders", engine: "vertical_press", aliases: ["overhead press", "ohp", "military press", "shoulder press"] },
  "cable-lateral-raise": { category: "Shoulders", engine: "lateral_raise", aliases: ["lateral raise", "side raise"] },
  "reverse-pec-deck": { category: "Shoulders", manualReason: NO_ENGINE.fly, aliases: ["rear delt fly", "rear-delt fly"] },
  "lat-pulldown": { category: "Back & pull", engine: "vertical_pull", aliases: ["pulldown", "lat pull down", "close-grip lat pulldown", "wide-grip lat pulldown"] },
  "chest-supported-row": { category: "Back & pull", engine: "horizontal_pull", aliases: ["row", "dumbbell row"] },
  "seated-cable-row": { category: "Back & pull", engine: "horizontal_pull", aliases: ["cable row", "row"] },
  "barbell-back-squat": { category: "Legs", engine: "squat", aliases: ["squat", "back squat"] },
  "leg-press": { category: "Legs", manualReason: NO_ENGINE.legPress },
  "romanian-deadlift": { category: "Hinge & glutes", engine: "deadlift", aliases: ["rdl"] },
  "seated-leg-curl": { category: "Legs", manualReason: NO_ENGINE.legCurl, aliases: ["leg curl", "hamstring curl"] },
  "bulgarian-split-squat": { category: "Legs", manualReason: NO_ENGINE.splitStance, aliases: ["split squat"] },
  "standing-calf-raise": { category: "Legs", manualReason: NO_ENGINE.calf, aliases: ["calf raise"] },
  "ez-bar-curl": { category: "Arms", engine: "elbow_flexion", aliases: ["biceps curl", "bicep curl", "curl"] },
  "incline-dumbbell-curl": { category: "Arms", engine: "elbow_flexion", aliases: ["biceps curl", "bicep curl", "curl"] },
  "cable-triceps-pushdown": { category: "Arms", engine: "triceps_pushdown", aliases: ["triceps pushdown", "tricep pushdown", "pushdown"] },
  "overhead-cable-triceps-extension": { category: "Arms", engine: "overhead_triceps_extension", aliases: ["overhead triceps extension", "overhead tricep extension"] },
  "cable-crunch": { category: "Core", manualReason: NO_ENGINE.spinal, aliases: ["crunch"] },
  "hanging-knee-raise": { category: "Core", manualReason: NO_ENGINE.hipFlexion, aliases: ["knee raise"] },
  "push-up": { category: "Chest & press", engine: "bench_press", aliases: ["pushup", "press-up"] },
  plank: { category: "Core", manualReason: NO_ENGINE.isometric },
  "smith-incline-press": { category: "Chest & press", engine: "bench_press", aliases: ["incline bench press", "incline press"] },
  "converging-machine-chest-press": { category: "Chest & press", engine: "bench_press", aliases: ["chest press"] },
  "seated-cable-fly": { category: "Chest & press", manualReason: NO_ENGINE.fly, aliases: ["chest fly"] },
  "incline-machine-chest-press": { category: "Chest & press", engine: "bench_press", aliases: ["incline press"] },
  "flat-dumbbell-press": { category: "Chest & press", engine: "bench_press", aliases: ["dumbbell bench press", "db bench press"] },
  "incline-push-up": { category: "Chest & press", engine: "bench_press", aliases: ["incline pushup"] },
  "neutral-grip-lat-pulldown": { category: "Back & pull", engine: "vertical_pull", aliases: ["close-grip lat pulldown", "pulldown"] },
  "single-arm-cable-pulldown": { category: "Back & pull", engine: "vertical_pull", aliases: ["one-arm pulldown", "pulldown"] },
  "assisted-pull-up": { category: "Back & pull", engine: "vertical_pull", aliases: ["assisted chin-up", "pull up"] },
  "chest-supported-t-bar-row": { category: "Back & pull", engine: "horizontal_pull", aliases: ["t-bar row", "row"] },
  "chest-supported-machine-row": { category: "Back & pull", engine: "horizontal_pull", aliases: ["machine row", "row"] },
  "seated-dumbbell-overhead-press": { category: "Shoulders", engine: "vertical_press", aliases: ["dumbbell shoulder press", "shoulder press"] },
  "machine-shoulder-press": { category: "Shoulders", engine: "vertical_press", aliases: ["shoulder press"] },
  "landmine-press": { category: "Shoulders", manualReason: NO_ENGINE.landmine },
  "machine-lateral-raise": { category: "Shoulders", engine: "lateral_raise", aliases: ["lateral raise"] },
  "incline-dumbbell-rear-delt-row": { category: "Shoulders", engine: "horizontal_pull", aliases: ["rear delt row"] },
  "cable-rear-delt-fly": { category: "Shoulders", manualReason: NO_ENGINE.fly, aliases: ["rear delt fly", "rear-delt fly"] },
  "incline-rear-delt-raise": { category: "Shoulders", manualReason: NO_ENGINE.fly, aliases: ["rear delt fly", "rear-delt raise"] },
  "preacher-curl": { category: "Arms", engine: "elbow_flexion", aliases: ["biceps curl", "curl"] },
  "cable-curl": { category: "Arms", engine: "elbow_flexion", aliases: ["biceps curl", "bicep curl", "curl"] },
  "single-dumbbell-overhead-extension": { category: "Arms", engine: "overhead_triceps_extension", aliases: ["overhead triceps extension", "overhead tricep extension"] },
  "cross-body-cable-pushdown": { category: "Arms", engine: "triceps_pushdown", aliases: ["triceps pushdown", "pushdown"] },
  "hack-squat": { category: "Legs", engine: "squat", capability: "ANALYSIS_EXPERIMENTAL", aliases: ["squat"] },
  "smith-machine-squat": { category: "Legs", engine: "squat", capability: "ANALYSIS_EXPERIMENTAL", aliases: ["squat", "smith squat"] },
  "supported-split-squat": { category: "Legs", manualReason: NO_ENGINE.splitStance, aliases: ["split squat"] },
  "dumbbell-step-up": { category: "Legs", manualReason: NO_ENGINE.stepUp, aliases: ["step up"] },
  "dumbbell-romanian-deadlift": { category: "Hinge & glutes", engine: "deadlift", aliases: ["rdl", "db rdl"] },
  "cable-pull-through": { category: "Hinge & glutes", engine: "deadlift", aliases: ["pull through", "hip hinge"] },
  "lying-leg-curl": { category: "Legs", manualReason: NO_ENGINE.legCurl, aliases: ["leg curl", "hamstring curl"] },
  "standing-single-leg-curl": { category: "Legs", manualReason: NO_ENGINE.legCurl, aliases: ["leg curl"] },
  "barbell-hip-thrust": { category: "Hinge & glutes", manualReason: NO_ENGINE.hipThrust, aliases: ["hip thrust"] },
  "glute-bridge": { category: "Hinge & glutes", manualReason: NO_ENGINE.hipThrust, aliases: ["bridge"] },
  "single-leg-calf-raise": { category: "Legs", manualReason: NO_ENGINE.calf, aliases: ["calf raise"] },
  "leg-press-calf-raise": { category: "Legs", manualReason: NO_ENGINE.calf, aliases: ["calf raise"] },
  "weighted-crunch": { category: "Core", manualReason: NO_ENGINE.spinal, aliases: ["crunch"] },
  "machine-crunch": { category: "Core", manualReason: NO_ENGINE.spinal, aliases: ["crunch"] },
  "hanging-leg-raise": { category: "Core", manualReason: NO_ENGINE.hipFlexion, aliases: ["leg raise"] },
  "supported-knee-raise": { category: "Core", manualReason: NO_ENGINE.hipFlexion, aliases: ["captain's chair", "knee raise"] },
  "reverse-crunch": { category: "Core", manualReason: NO_ENGINE.spinal, aliases: ["crunch"] },
  "leg-extension": { category: "Legs", manualReason: NO_ENGINE.legExtension, aliases: ["quad extension"] },
  "dumbbell-lateral-raise": { category: "Shoulders", engine: "lateral_raise", aliases: ["lateral raise", "side raise"] },
  "pull-up": { category: "Back & pull", engine: "vertical_pull", aliases: ["pullup", "chin-up", "chin up"] },
};

/** Movements SetVision lists that the catalogue does not have. Selector entries only — never inserted as catalogue rows. */
const SETVISION_ONLY: Array<{ slug: string; label: string; aliases: string[]; category: ExerciseCategory; engine?: SetVisionExerciseId; manualReason?: string }> = [
  { slug: "squat", label: "Squat", aliases: ["bodyweight squat", "air squat", "goblet squat", "paused squat", "front squat"], category: "Legs", engine: "squat" },
  { slug: "deadlift", label: "Deadlift", aliases: ["conventional deadlift", "barbell deadlift"], category: "Hinge & glutes", engine: "deadlift" },
  { slug: "incline-bench-press", label: "Incline Bench Press", aliases: ["incline barbell bench press", "incline press"], category: "Chest & press", engine: "bench_press" },
  { slug: "barbell-row", label: "Barbell Row", aliases: ["bent-over row", "bent over row", "bb row"], category: "Back & pull", engine: "horizontal_pull" },
  { slug: "dumbbell-row", label: "Dumbbell Row", aliases: ["one-arm dumbbell row", "db row"], category: "Back & pull", engine: "horizontal_pull" },
  { slug: "biceps-curl", label: "Biceps Curl", aliases: ["dumbbell curl", "bicep curl", "hammer curl", "curl"], category: "Arms", engine: "elbow_flexion" },
  { slug: "lunge", label: "Lunge", aliases: ["walking lunge", "forward lunge", "reverse lunge"], category: "Legs", manualReason: NO_ENGINE.splitStance },
];

export const EXERCISE_OPTIONS: ExerciseOption[] = [
  ...SETVISION_ONLY.map(({ slug, engine, manualReason, ...rest }) => ({
    ...rest,
    key: `setvision:${slug}`,
    source: "setvision" as const,
    catalogueId: null,
    engine: engine ?? null,
    capability: engine ? ENGINE_CAPABILITY[engine] : ("MANUAL_REVIEW_SUPPORTED" as const),
    manualReason: manualReason ?? null,
  })),
  ...EXERCISE_CATALOGUE.flatMap((item) => {
    const entry = item.slug ? CATALOGUE_COVERAGE[item.slug] : undefined;
    if (!item.slug || !entry) return [];
    const engine = entry.engine ?? null;
    return [{
      key: `catalogue:${item.slug}`,
      label: item.name,
      aliases: entry.aliases ?? [],
      source: "catalogue" as const,
      catalogueId: item.id,
      category: entry.category,
      engine,
      capability: engine ? (entry.capability ?? ENGINE_CAPABILITY[engine]) : ("MANUAL_REVIEW_SUPPORTED" as const),
      manualReason: engine ? null : (entry.manualReason ?? null),
    }];
  }),
];

const OPTION_BY_KEY = new Map(EXERCISE_OPTIONS.map((o) => [o.key, o]));

export function findExerciseOption(key: string): ExerciseOption | null {
  return OPTION_BY_KEY.get(key) ?? null;
}

/** The option a confirmed Auto-detect suggestion of this engine resolves to. */
const SUGGESTION_OPTION: Record<SetVisionExerciseId, string> = {
  squat: "setvision:squat",
  deadlift: "setvision:deadlift",
  bench_press: "catalogue:barbell-bench-press",
  vertical_press: "catalogue:barbell-overhead-press",
  vertical_pull: "catalogue:lat-pulldown",
  horizontal_pull: "setvision:barbell-row",
  elbow_flexion: "setvision:biceps-curl",
  triceps_pushdown: "catalogue:cable-triceps-pushdown",
  overhead_triceps_extension: "catalogue:overhead-cable-triceps-extension",
  lateral_raise: "catalogue:dumbbell-lateral-raise",
};

export function optionForEngine(engine: SetVisionExerciseId): ExerciseOption {
  return OPTION_BY_KEY.get(SUGGESTION_OPTION[engine])!;
}

export function selectionFromOption(option: ExerciseOption, source: "catalogue" | "setvision" | "auto_suggestion" = option.source): SelectedExercise {
  return {
    label: option.label,
    source,
    key: option.key,
    catalogueId: option.catalogueId,
    engine: option.engine,
    capability: option.capability,
    manualReason: option.manualReason,
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
 * Rendered as React text, never as HTML. The server re-runs this on save.
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
  return {
    label,
    source: "custom",
    key: null,
    catalogueId: null,
    engine: null,
    capability: "MANUAL_REVIEW_SUPPORTED",
    manualReason: "It is a custom exercise, so SetVision has no movement model for it.",
  };
}

export const CAPABILITY_TEXT: Record<AnalysisCapability, { badge: string; detail: string }> = {
  ANALYSIS_VERIFIED: {
    badge: "Automated analysis",
    detail: "Rep count, phase timing, joint range and consistency from pose tracking. Rep counts were checked against several real squat clips (bodyweight, goblet and kettlebell; side and front views) — not independently validated. Works best filmed side-on with the whole body in frame.",
  },
  ANALYSIS_EXPERIMENTAL: {
    badge: "Experimental analysis",
    detail: "An experimental movement-family counter, checked only on synthetic poses and a handful of real or rendered clips. Treat every number as unverified, and correct the reps below if they are wrong.",
  },
  MANUAL_REVIEW_SUPPORTED: {
    badge: "Manual review",
    detail: "SetVision won't count reps or measure tempo, range or technique for this exercise. You can still review the video, mark reps yourself, add notes and save the review.",
  },
};

export const SOURCE_TEXT: Record<ExerciseSource, string> = {
  catalogue: "From the exercise catalogue",
  setvision: "From SetVision's movement list",
  custom: "Custom name you entered",
  auto_suggestion: "Auto-detect suggestion, confirmed by you",
};
