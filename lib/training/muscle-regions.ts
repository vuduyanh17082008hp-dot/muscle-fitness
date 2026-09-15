import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import { MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";

/**
 * Interactive anatomical region model for the Muscle Map SVG.
 *
 * Original stylized human anatomy — technical fitness-science look,
 * not photorealistic, not a copy of any commercial chart.
 * viewBox is 0 0 200 400 for both front and back.
 *
 * Obliques / adductors / tibialis are folded into parent CanonicalMuscle
 * regions (abdominals / quadriceps / calves) where the taxonomy has no
 * separate id — visually present, interactively selecting the parent.
 */

export type AnatomyView = "front" | "back";

export type MuscleRegionDef = {
  /** Canonical muscle id — shared with analytics / search / detail panel. */
  muscleId: CanonicalMuscle;
  displayName: string;
  view: AnatomyView;
  /** One or more SVG path `d` strings for this region (bilateral = two paths). */
  svgPaths: string[];
  /** Search aliases beyond taxonomy (informational; resolution still via muscle-search). */
  aliases: string[];
  trainingCategory: "push" | "pull" | "legs" | "core" | "arms" | "shoulders";
};

/** @deprecated Prefer MuscleRegionDef — kept for MuscleMapClient shape branch compat during transition. */
export type MuscleRegion =
  | {
      muscle: CanonicalMuscle;
      view: AnatomyView;
      shape: "rect" | "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
    }
  | {
      muscle: CanonicalMuscle;
      view: AnatomyView;
      shape: "path";
      d: string;
    };

function def(
  muscleId: CanonicalMuscle,
  view: AnatomyView,
  svgPaths: string[],
  trainingCategory: MuscleRegionDef["trainingCategory"],
  aliases: string[] = [],
): MuscleRegionDef {
  return {
    muscleId,
    displayName: MUSCLE_DISPLAY_NAME[muscleId],
    view,
    svgPaths,
    aliases,
    trainingCategory,
  };
}

/**
 * Front + back body silhouettes — subtle underlay so muscle regions
 * read as a human figure even when idle / unselected.
 */
export const BODY_SILHOUETTE: Record<AnatomyView, string> = {
  front: [
    // Head
    "M100 14 C112 14 120 24 120 36 C120 48 112 56 100 56 C88 56 80 48 80 36 C80 24 88 14 100 14 Z",
    // Neck
    "M92 54 L108 54 L110 68 L90 68 Z",
    // Torso + arms + legs outline (single continuous athletic silhouette)
    "M90 68",
    "C72 70 52 78 42 92",
    "C34 104 30 120 28 138",
    "C26 158 24 178 22 198",
    "C20 210 18 218 24 220",
    "C30 222 34 214 36 204",
    "C38 186 40 168 44 152",
    "L48 168",
    "C50 186 52 204 56 218",
    "C60 232 58 248 62 262",
    "C66 278 70 292 74 308",
    "C78 326 80 344 82 360",
    "C84 372 88 378 94 378",
    "L94 368",
    "C92 350 90 332 88 316",
    "C86 300 84 284 82 270",
    "C80 256 82 244 86 232",
    "C90 218 94 206 96 194",
    "L100 194",
    "L104 194",
    "C106 206 110 218 114 232",
    "C118 244 120 256 118 270",
    "C116 284 114 300 112 316",
    "C110 332 108 350 106 368",
    "L106 378",
    "C112 378 116 372 118 360",
    "C120 344 122 326 126 308",
    "C130 292 134 278 138 262",
    "C142 248 140 232 144 218",
    "C148 204 150 186 152 168",
    "L156 152",
    "C160 168 162 186 164 204",
    "C166 214 170 222 176 220",
    "C182 218 180 210 178 198",
    "C176 178 174 158 172 138",
    "C170 120 166 104 158 92",
    "C148 78 128 70 110 68",
    "Z",
  ].join(" "),
  back: [
    "M100 14 C112 14 120 24 120 36 C120 48 112 56 100 56 C88 56 80 48 80 36 C80 24 88 14 100 14 Z",
    "M92 54 L108 54 L110 68 L90 68 Z",
    "M90 68",
    "C72 70 52 78 42 92",
    "C34 104 30 120 28 138",
    "C26 158 24 178 22 198",
    "C20 210 18 218 24 220",
    "C30 222 34 214 36 204",
    "C38 186 40 168 44 152",
    "L48 168",
    "C50 186 52 204 56 218",
    "C60 232 58 248 62 262",
    "C66 278 70 292 74 308",
    "C78 326 80 344 82 360",
    "C84 372 88 378 94 378",
    "L94 368",
    "C92 350 90 332 88 316",
    "C86 300 84 284 82 270",
    "C80 256 82 244 86 232",
    "C90 218 94 206 96 194",
    "L100 194",
    "L104 194",
    "C106 206 110 218 114 232",
    "C118 244 120 256 118 270",
    "C116 284 114 300 112 316",
    "C110 332 108 350 106 368",
    "L106 378",
    "C112 378 116 372 118 360",
    "C120 344 122 326 126 308",
    "C130 292 134 278 138 262",
    "C142 248 140 232 144 218",
    "C148 204 150 186 152 168",
    "L156 152",
    "C160 168 162 186 164 204",
    "C166 214 170 222 176 220",
    "C182 218 180 210 178 198",
    "C176 178 174 158 172 138",
    "C170 120 166 104 158 92",
    "C148 78 128 70 110 68",
    "Z",
  ].join(" "),
};

/**
 * Anatomically recognizable muscle regions.
 * Paths are original hand-authored silhouettes tuned for a dark
 * industrial fitness UI — organic contours, believable proportions.
 */
export const MUSCLE_REGION_DEFS: MuscleRegionDef[] = [
  // ─── FRONT ───────────────────────────────────────────────
  def(
    "upper_chest",
    "front",
    [
      "M68 78 C78 72 90 70 100 74 C110 70 122 72 132 78 C136 84 134 92 128 96 C118 92 108 90 100 92 C92 90 82 92 72 96 C66 92 64 84 68 78 Z",
    ],
    "push",
    ["clavicular", "upper pecs"],
  ),
  def(
    "chest",
    "front",
    [
      "M64 94 C58 100 56 114 60 126 C66 140 80 146 96 134 C99 130 100 120 100 112 C100 120 101 130 104 134 C120 146 134 140 140 126 C144 114 142 100 136 94 C124 88 110 90 100 98 C90 90 76 88 64 94 Z",
    ],
    "push",
    ["pecs", "pectorals"],
  ),
  def(
    "anterior_deltoid",
    "front",
    [
      "M48 84 C40 88 36 98 38 110 C40 120 46 126 54 124 C60 118 62 106 60 96 C58 88 54 84 48 84 Z",
      "M152 84 C160 88 164 98 162 110 C160 120 154 126 146 124 C140 118 138 106 140 96 C142 88 146 84 152 84 Z",
    ],
    "shoulders",
    ["front delt", "front delts"],
  ),
  def(
    "lateral_deltoid",
    "front",
    [
      "M36 90 C28 94 26 106 30 116 C34 124 42 126 46 120 C48 112 46 100 42 94 C40 90 38 90 36 90 Z",
      "M164 90 C172 94 174 106 170 116 C166 124 158 126 154 120 C152 112 154 100 158 94 C160 90 162 90 164 90 Z",
    ],
    "shoulders",
    ["side delt", "side delts"],
  ),
  def(
    "biceps",
    "front",
    [
      "M40 118 C34 122 32 136 34 150 C36 160 42 164 48 158 C52 148 52 132 48 122 C46 118 42 116 40 118 Z",
      "M160 118 C166 122 168 136 166 150 C164 160 158 164 152 158 C148 148 148 132 152 122 C154 118 158 116 160 118 Z",
    ],
    "arms",
    ["bis", "guns"],
  ),
  def(
    "forearms",
    "front",
    [
      "M34 156 C28 162 26 178 28 194 C30 206 36 210 42 204 C46 192 46 174 42 162 C40 156 36 154 34 156 Z",
      "M166 156 C172 162 174 178 172 194 C170 206 164 210 158 204 C154 192 154 174 158 162 C160 156 164 154 166 156 Z",
    ],
    "arms",
    ["forearm", "wrist flexors"],
  ),
  def(
    "abdominals",
    "front",
    [
      // Rectus abdominis + oblique wings (obliques select abdominals)
      "M78 128 C72 132 68 148 70 164 C72 178 78 188 88 190 C94 188 98 182 100 174 C102 182 106 188 112 190 C122 188 128 178 130 164 C132 148 128 132 122 128 C112 124 104 126 100 132 C96 126 88 124 78 128 Z",
      // Left oblique accent
      "M68 134 C62 140 60 156 64 170 C68 180 74 184 78 178 C76 162 74 146 72 136 C70 132 68 132 68 134 Z",
      // Right oblique accent
      "M132 134 C138 140 140 156 136 170 C132 180 126 184 122 178 C124 162 126 146 128 136 C130 132 132 132 132 134 Z",
    ],
    "core",
    ["abs", "core", "obliques", "six pack"],
  ),
  def(
    "quadriceps",
    "front",
    [
      // Left quad + medial adductor contour
      "M62 198 C56 210 54 236 56 262 C58 280 64 288 74 284 C82 278 88 270 92 258 C94 240 92 220 90 206 C84 198 72 194 62 198 Z M78 210 C74 222 72 242 74 258 C78 266 84 264 86 254 C86 238 84 222 82 212 C80 208 78 208 78 210 Z",
      // Right quad + medial adductor contour
      "M138 198 C144 210 146 236 144 262 C142 280 136 288 126 284 C118 278 112 270 108 258 C106 240 108 220 110 206 C116 198 128 194 138 198 Z M122 210 C126 222 128 242 126 258 C122 266 116 264 114 254 C114 238 116 222 118 212 C120 208 122 208 122 210 Z",
    ],
    "legs",
    ["quads", "adductors", "thigh"],
  ),
  def(
    "calves",
    "front",
    [
      // Anterior lower leg / tibialis-forward silhouette
      "M70 292 C66 304 64 324 66 344 C68 358 74 364 82 360 C88 352 90 336 88 320 C86 306 82 296 78 292 C76 290 72 290 70 292 Z",
      "M130 292 C134 304 136 324 134 344 C132 358 126 364 118 360 C112 352 110 336 112 320 C114 306 118 296 122 292 C124 290 128 290 130 292 Z",
    ],
    "legs",
    ["tibialis", "shins", "lower leg"],
  ),

  // ─── BACK ────────────────────────────────────────────────
  def(
    "trapezius",
    "back",
    [
      "M100 58 L138 78 C134 88 122 96 100 100 C78 96 66 88 62 78 Z M86 96 C90 108 94 118 100 122 C106 118 110 108 114 96 C108 98 100 100 92 98 Z",
    ],
    "pull",
    ["traps", "cầu vai"],
  ),
  def(
    "rear_deltoid",
    "back",
    [
      "M48 86 C40 90 36 100 38 112 C40 122 46 128 54 126 C60 120 62 108 60 98 C58 90 54 86 48 86 Z",
      "M152 86 C160 90 164 100 162 112 C160 122 154 128 146 126 C140 120 138 108 140 98 C142 90 146 86 152 86 Z",
    ],
    "shoulders",
    ["rear delt", "rear delts", "posterior delt"],
  ),
  def(
    "lateral_deltoid",
    "back",
    [
      "M34 92 C26 96 24 108 28 118 C32 126 40 128 44 122 C46 114 44 102 40 96 C38 92 36 92 34 92 Z",
      "M166 92 C174 96 176 108 172 118 C168 126 160 128 156 122 C154 114 156 102 160 96 C162 92 164 92 166 92 Z",
    ],
    "shoulders",
    ["side delt"],
  ),
  def(
    "upper_back",
    "back",
    [
      "M78 98 C74 108 74 124 78 136 C84 144 94 146 100 140 C106 146 116 144 122 136 C126 124 126 108 122 98 C114 94 106 96 100 102 C94 96 86 94 78 98 Z",
    ],
    "pull",
    ["mid back", "rhomboids", "back thickness"],
  ),
  def(
    "latissimus_dorsi",
    "back",
    [
      "M56 100 C48 118 48 146 58 164 C68 156 82 148 94 144 C92 126 88 110 84 98 C74 96 64 96 56 100 Z",
      "M144 100 C152 118 152 146 142 164 C132 156 118 148 106 144 C108 126 112 110 116 98 C126 96 136 96 144 100 Z",
    ],
    "pull",
    ["lats", "xô", "back width"],
  ),
  def(
    "triceps",
    "back",
    [
      "M40 118 C34 122 32 136 34 152 C36 162 42 166 48 160 C52 150 52 134 48 124 C46 118 42 116 40 118 Z",
      "M160 118 C166 122 168 136 166 152 C164 162 158 166 152 160 C148 150 148 134 152 124 C154 118 158 116 160 118 Z",
    ],
    "arms",
    ["tris"],
  ),
  def(
    "lower_back",
    "back",
    [
      "M82 148 C78 156 78 170 84 178 C90 184 96 184 100 180 C104 184 110 184 116 178 C122 170 122 156 118 148 C110 144 104 146 100 152 C96 146 90 144 82 148 Z",
    ],
    "core",
    ["spinal erectors", "erectors", "lumbar"],
  ),
  def(
    "glutes",
    "back",
    [
      "M64 182 C58 192 58 210 68 218 C78 224 92 224 100 216 C108 224 122 224 132 218 C142 210 142 192 136 182 C122 174 110 172 100 174 C90 172 78 174 64 182 Z",
    ],
    "legs",
    ["glute", "gluteus"],
  ),
  def(
    "hamstrings",
    "back",
    [
      "M62 222 C56 236 54 262 58 280 C62 290 72 292 82 286 C90 278 94 266 94 252 C94 238 92 226 88 220 C80 216 68 216 62 222 Z",
      "M138 222 C144 236 146 262 142 280 C138 290 128 292 118 286 C110 278 106 266 106 252 C106 238 108 226 112 220 C120 216 132 216 138 222 Z",
    ],
    "legs",
    ["hams", "posterior chain"],
  ),
  def(
    "calves",
    "back",
    [
      "M68 292 C62 306 60 328 64 348 C68 360 76 364 84 358 C90 348 92 330 88 314 C86 302 80 294 74 292 C72 290 70 290 68 292 Z",
      "M132 292 C138 306 140 328 136 348 C132 360 124 364 116 358 C110 348 108 330 112 314 C114 302 120 294 126 292 C128 290 130 290 132 292 Z",
    ],
    "legs",
    ["gastroc", "soleus"],
  ),
];

/**
 * Flattened path list for renderers that need one SVG element per path
 * while preserving muscle identity for interaction.
 */
export type FlatMusclePath = {
  muscle: CanonicalMuscle;
  view: AnatomyView;
  d: string;
  pathIndex: number;
};

export function flattenMuscleRegions(view?: AnatomyView): FlatMusclePath[] {
  const defs = view ? MUSCLE_REGION_DEFS.filter((r) => r.view === view) : MUSCLE_REGION_DEFS;
  const out: FlatMusclePath[] = [];
  for (const region of defs) {
    region.svgPaths.forEach((d, pathIndex) => {
      out.push({ muscle: region.muscleId, view: region.view, d, pathIndex });
    });
  }
  return out;
}

/**
 * Legacy MUSCLE_REGIONS shape — derived from defs so older call sites
 * that still branch on shape:"path" keep working.
 */
export const MUSCLE_REGIONS: MuscleRegion[] = flattenMuscleRegions().map((path) => ({
  muscle: path.muscle,
  view: path.view,
  shape: "path" as const,
  d: path.d,
}));
