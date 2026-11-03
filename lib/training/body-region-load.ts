import type { ExerciseLibraryItem } from "@/lib/workouts/exercise-library";
import { EXERCISE_PROFILES, type ExerciseProfile } from "@/lib/workouts/exercise-profiles";

/**
 * Which body regions an exercise LOADS, from its curated setup — never from its name and never as a safety claim.
 *
 *   loads   — the region carries the effort or the body's weight in this movement (standing, gripping the load, pressing…)
 *   contact — the region is braced, padded or touching, but is not what carries the load (feet planted for a bench press,
 *             the leg-extension pad at the ankle, the bar resting on the back for a squat)
 *   none    — the setup puts no load on that region
 *
 * "none" means only that: the setup does not load the area. It is NOT "safe", and nothing here says an exercise won't
 * hurt — the caller has to present it as "doesn't put weight through your foot", with the uncertainty spelled out.
 *
 * Inputs are the curated profile (exercise-profiles.ts) and the catalogue movement pattern, plus the one fact neither
 * records: the athlete's body position (STANCE below), something a coach can check by watching the exercise.
 * ponytail: categorical rules over that metadata; upgrade path is a coach-reviewed per-exercise region table.
 */

export type BodyRegion = "foot_ankle" | "knee" | "hip" | "lower_back" | "shoulder" | "elbow" | "wrist_hand";
export type RegionLoad = "loads" | "contact" | "none";

export const BODY_REGION_LABEL: Record<BodyRegion, { en: string; vi: string }> = {
  foot_ankle: { en: "foot/ankle", vi: "bàn chân/cổ chân" },
  knee: { en: "knee", vi: "gối" },
  hip: { en: "hip", vi: "hông" },
  lower_back: { en: "lower back", vi: "lưng dưới" },
  shoulder: { en: "shoulder", vi: "vai" },
  elbow: { en: "elbow", vi: "khuỷu tay" },
  wrist_hand: { en: "wrist/hand", vi: "cổ tay/bàn tay" },
};

/** Context-working-set injury sites → the region the exercise metadata can speak to. Unmapped sites return null. */
const SITE_REGION: Record<string, BodyRegion> = {
  foot: "foot_ankle",
  ankle: "foot_ankle",
  knee: "knee",
  hip: "hip",
  "lower back": "lower_back",
  back: "lower_back",
  shoulder: "shoulder",
  elbow: "elbow",
  wrist: "wrist_hand",
};

export function regionForSite(site: string): BodyRegion | null {
  return SITE_REGION[site] ?? null;
}

type Stance = "standing" | "seated" | "lying" | "kneeling" | "hanging" | "plank";

/** Body position per profiled slug. Every profile must appear (lib/training/__tests__/body-region-load.test.ts). */
const STANCE: Record<Stance, string[]> = {
  standing: [
    "cable-fly", "single-arm-cable-pulldown", "chest-supported-t-bar-row", "barbell-overhead-press", "landmine-press",
    "cable-lateral-raise", "dumbbell-lateral-raise", "cable-rear-delt-fly", "ez-bar-curl", "cable-curl",
    "cable-triceps-pushdown", "overhead-cable-triceps-extension", "cross-body-cable-pushdown", "barbell-back-squat",
    "hack-squat", "smith-machine-squat", "bulgarian-split-squat", "supported-split-squat", "dumbbell-step-up",
    "romanian-deadlift", "dumbbell-romanian-deadlift", "cable-pull-through", "standing-single-leg-curl",
    "standing-calf-raise", "single-leg-calf-raise",
  ],
  seated: [
    "machine-chest-press", "converging-machine-chest-press", "seated-cable-fly", "incline-machine-chest-press",
    "lat-pulldown", "neutral-grip-lat-pulldown", "seated-cable-row", "chest-supported-machine-row",
    "seated-dumbbell-overhead-press", "machine-shoulder-press", "machine-lateral-raise", "reverse-pec-deck",
    "incline-dumbbell-curl", "preacher-curl", "single-dumbbell-overhead-extension", "leg-press", "leg-extension",
    "seated-leg-curl", "leg-press-calf-raise", "machine-crunch",
  ],
  lying: [
    "barbell-bench-press", "incline-dumbbell-press", "smith-incline-press", "flat-dumbbell-press", "chest-supported-row",
    "incline-rear-delt-raise", "incline-dumbbell-rear-delt-row", "lying-leg-curl", "barbell-hip-thrust", "glute-bridge",
    "weighted-crunch", "reverse-crunch",
  ],
  kneeling: ["assisted-pull-up", "cable-crunch"],
  hanging: ["pull-up", "hanging-knee-raise", "hanging-leg-raise", "supported-knee-raise"],
  plank: ["push-up", "incline-push-up", "plank"],
};

/** Feet push hard against a platform or the floor (the leg press platform, the floor in a hip thrust). */
const FOOT_DRIVE = new Set(["leg-press", "leg-press-calf-raise", "barbell-hip-thrust", "glute-bridge"]);
/** Feet planted as a brace while something else does the work (leg drive on a bench, chest on an incline bench). */
const FOOT_BRACE = new Set([
  "barbell-bench-press", "incline-dumbbell-press", "smith-incline-press", "flat-dumbbell-press", "seated-cable-row",
  "chest-supported-row", "incline-rear-delt-raise", "incline-dumbbell-rear-delt-row",
]);
/** A roller pad rests at the ankle / lower shin. */
const ANKLE_PAD = new Set(["leg-extension", "seated-leg-curl", "lying-leg-curl", "standing-single-leg-curl"]);
/** The bar rests on the upper back; the hands only steady it. */
const BAR_ON_BACK = new Set(["barbell-back-squat", "smith-machine-squat"]);
/** Core work where the hands hold the load in place rather than move it. */
const HANDS_HOLD_ONLY = new Set(["cable-crunch", "weighted-crunch"]);

const STANCE_BY_SLUG = new Map<string, Stance>(
  (Object.entries(STANCE) as Array<[Stance, string[]]>).flatMap(([stance, slugs]) => slugs.map((slug) => [slug, stance] as const)),
);

export function stanceOf(slug: string | null | undefined): Stance | null {
  return slug ? STANCE_BY_SLUG.get(slug) ?? null : null;
}

const UPPER_PATTERNS = new Set([
  "horizontal push", "incline push", "horizontal adduction", "vertical push", "shoulder abduction",
  "horizontal abduction", "vertical pull", "horizontal pull", "angled push", "horizontal pull (wide)",
]);
const ARM_PATTERNS = new Set(["elbow flexion", "elbow extension"]);
const KNEE_PATTERNS = new Set(["squat", "single-leg squat", "knee extension", "knee flexion"]);
const HIP_PATTERNS = new Set(["squat", "single-leg squat", "hip hinge", "hip extension", "hip flexion"]);
const HAND_LOAD = new Set(["barbell", "dumbbell", "ez_bar", "cable", "landmine", "pull_up_bar"]);

export type RegionVerdict = { load: RegionLoad; basis: string; basisVi: string };

/** Vietnamese for every basis below (lib/training/__tests__/body-region-load.test.ts checks none is missing). */
export const BASIS_VI: Record<string, string> = {
  "a pad rests at the ankle": "có đệm tì ở cổ chân",
  "the arms hold a weight or your body still": "tay giữ tạ hoặc giữ cơ thể",
  "the arms press overhead": "tay đẩy qua đầu",
  "the arms work overhead": "tay làm việc trên đầu",
  "the elbow bends or straightens under load": "khuỷu tay gập/duỗi khi chịu tải",
  "the elbow doesn't hold the load": "khuỷu tay không giữ tải",
  "the elbow works in the press or pull": "khuỷu tay tham gia đẩy hoặc kéo",
  "the hands don't hold the load": "tay không cầm tải",
  "the hands grip and hold the load": "tay nắm và giữ tải",
  "the hands hold a bar on your back": "tay giữ thanh tạ trên lưng",
  "the hands steady the weight": "tay chỉ giữ thăng bằng tạ",
  "the hip bends and extends under load": "hông gập/duỗi khi chịu tải",
  "the hip doesn't work against the load": "hông không chống lại tải",
  "the hips hold you upright": "hông giữ người thẳng",
  "the knee bends and straightens under load": "gối gập/duỗi khi chịu tải",
  "the knee doesn't work against the load": "gối không chống lại tải",
  "the knee holds a bent position while the hip works": "gối giữ tư thế gập khi hông làm việc",
  "the load travels through the spine": "tải đi qua cột sống",
  "the lower back holds or bends under load": "lưng dưới giữ hoặc gập khi chịu tải",
  "the movement is done through the ankle and the ball of the foot": "động tác thực hiện qua cổ chân và mũi bàn chân",
  "the shoulder doesn't hold the load": "vai không giữ tải",
  "the shoulder moves or holds the load": "vai di chuyển hoặc giữ tải",
  "the shoulder steadies a weight held in the hands": "vai giữ vững tạ cầm trên tay",
  "the spine isn't loaded": "cột sống không chịu tải",
  "the tops of your feet rest on the floor": "mu bàn chân tì xuống sàn",
  "you balance on your toes": "bạn giữ thăng bằng trên mũi chân",
  "you kneel on the knees": "bạn quỳ trên gối",
  "you stand holding the weight": "bạn đứng và cầm tạ",
  "you stand on your feet and they carry the load": "bạn đứng và bàn chân chịu tải",
  "you stand with straight knees": "bạn đứng thẳng gối",
  "your feet push the platform or floor": "bàn chân đẩy bàn đạp hoặc sàn",
  "your feet stay planted as a brace": "bàn chân đặt cố định để làm điểm tựa",
  "your weight rests on the hands or forearms": "trọng lượng dồn lên tay hoặc cẳng tay",
  "your feet hang free": "bàn chân treo tự do",
  "your feet don't carry the load": "bàn chân không chịu tải",
};

/** null = the exercise has no curated profile or stance, so its loading is UNKNOWN (never assumed clear). */
export function regionLoad(item: ExerciseLibraryItem, region: BodyRegion): RegionVerdict | null {
  const slug = item.slug ?? "";
  const profile: ExerciseProfile | undefined = EXERCISE_PROFILES[slug];
  const stance = stanceOf(slug);
  if (!profile || !stance) return null;
  const pattern = item.movementPattern.trim().toLowerCase();
  const handsLoaded = profile.needs.some((tag) => HAND_LOAD.has(tag)) && !BAR_ON_BACK.has(slug) && !HANDS_HOLD_ONLY.has(slug);
  const overhead = /overhead/i.test(profile.jointAction) || pattern === "vertical push";
  const v = (load: RegionLoad, basis: string): RegionVerdict => ({ load, basis, basisVi: BASIS_VI[basis] ?? basis });

  switch (region) {
    case "foot_ankle":
      if (pattern === "plantar flexion") return v("loads", "the movement is done through the ankle and the ball of the foot");
      if (stance === "standing") return v("loads", "you stand on your feet and they carry the load");
      if (stance === "plank") return v("loads", "you balance on your toes");
      if (FOOT_DRIVE.has(slug)) return v("loads", "your feet push the platform or floor");
      if (ANKLE_PAD.has(slug)) return v("contact", "a pad rests at the ankle");
      if (FOOT_BRACE.has(slug)) return v("contact", "your feet stay planted as a brace");
      if (stance === "kneeling") return v("contact", "the tops of your feet rest on the floor");
      return v("none", stance === "hanging" ? "your feet hang free" : "your feet don't carry the load");
    case "knee":
      if (KNEE_PATTERNS.has(pattern)) return v("loads", "the knee bends and straightens under load");
      if (pattern === "hip hinge" || pattern === "hip extension") return v("contact", "the knee holds a bent position while the hip works");
      if (pattern === "plantar flexion" && stance === "standing") return v("contact", "you stand with straight knees");
      if (stance === "kneeling") return v("contact", "you kneel on the knees");
      return v("none", "the knee doesn't work against the load");
    case "hip":
      if (HIP_PATTERNS.has(pattern)) return v("loads", "the hip bends and extends under load");
      if (stance === "standing") return v("contact", "the hips hold you upright");
      return v("none", "the hip doesn't work against the load");
    case "lower_back":
      if (profile.axialLoad) return v("loads", "the load travels through the spine");
      if (pattern === "hip hinge" || pattern === "spinal flexion") return v("loads", "the lower back holds or bends under load");
      if (stance === "standing" && handsLoaded) return v("contact", "you stand holding the weight");
      return v("none", "the spine isn't loaded");
    case "shoulder":
      if (UPPER_PATTERNS.has(pattern) || stance === "hanging" || stance === "plank") return v("loads", overhead ? "the arms press overhead" : "the shoulder moves or holds the load");
      if (overhead) return v("loads", "the arms work overhead");
      if (BAR_ON_BACK.has(slug)) return v("contact", "the hands hold a bar on your back");
      if (ARM_PATTERNS.has(pattern) || handsLoaded) return v("contact", "the shoulder steadies a weight held in the hands");
      return v("none", "the shoulder doesn't hold the load");
    case "elbow":
      if (ARM_PATTERNS.has(pattern)) return v("loads", "the elbow bends or straightens under load");
      if (UPPER_PATTERNS.has(pattern) || stance === "hanging") return v("loads", "the elbow works in the press or pull");
      if (stance === "plank" || handsLoaded) return v("contact", "the arms hold a weight or your body still");
      return v("none", "the elbow doesn't hold the load");
    case "wrist_hand":
      if (stance === "plank") return v("loads", "your weight rests on the hands or forearms");
      if (handsLoaded || UPPER_PATTERNS.has(pattern) || ARM_PATTERNS.has(pattern)) return v("loads", "the hands grip and hold the load");
      if (BAR_ON_BACK.has(slug) || HANDS_HOLD_ONLY.has(slug)) return v("contact", "the hands steady the weight");
      return v("none", "the hands don't hold the load");
  }
}
