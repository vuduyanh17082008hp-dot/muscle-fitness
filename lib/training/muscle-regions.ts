import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Static layout for the Muscle Map SVG (spec §18-§19).
 *
 * Original, simplified body-outline artwork — not photorealistic
 * anatomy — deliberately kept as basic shapes so it stays original
 * work rather than a copy of copyrighted anatomical illustration.
 * viewBox is 0 0 200 400 for both views.
 */
export type MuscleRegion =
  | {
      muscle: CanonicalMuscle;
      view: "front" | "back";
      shape: "rect" | "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
    }
  | {
      muscle: CanonicalMuscle;
      view: "front" | "back";
      shape: "path";
      /**
       * Hand-authored bezier-curve silhouette on the same 0 0 200 400
       * viewBox — original work, deliberately organic rather than
       * anatomically photorealistic (see file header). Time-boxed to
       * the largest/most recognizable muscle groups this pass; every
       * other muscle keeps its rect/ellipse placeholder above.
       */
      d: string;
    };

export const MUSCLE_REGIONS: MuscleRegion[] = [
  // ---- FRONT ----
  { muscle: "upper_chest", view: "front", shape: "rect", x: 62, y: 78, width: 76, height: 16, rx: 8 },
  {
    muscle: "chest",
    view: "front",
    shape: "path",
    d: "M64 96 C60 100 58 112 62 122 C68 132 82 136 96 124 C99 121 100 112 100 106 C100 112 101 121 104 124 C118 136 132 132 138 122 C142 112 140 100 136 96 C124 90 108 92 100 100 C92 92 76 90 64 96 Z",
  },
  { muscle: "anterior_deltoid", view: "front", shape: "ellipse", x: 44, y: 90, width: 20, height: 26 },
  { muscle: "anterior_deltoid", view: "front", shape: "ellipse", x: 136, y: 90, width: 20, height: 26 },
  { muscle: "biceps", view: "front", shape: "rect", x: 38, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "biceps", view: "front", shape: "rect", x: 146, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "forearms", view: "front", shape: "rect", x: 36, y: 163, width: 14, height: 38, rx: 7 },
  { muscle: "forearms", view: "front", shape: "rect", x: 150, y: 163, width: 14, height: 38, rx: 7 },
  { muscle: "abdominals", view: "front", shape: "rect", x: 68, y: 126, width: 64, height: 56, rx: 10 },
  {
    muscle: "quadriceps",
    view: "front",
    shape: "path",
    d: "M58 210 C56 232 55 256 58 276 C60 288 68 284 75 280 C80 277 84 278 92 282 C90 258 91 232 88 210 C80 205 66 205 58 210 Z",
  },
  {
    muscle: "quadriceps",
    view: "front",
    shape: "path",
    d: "M142 210 C144 232 145 256 142 276 C140 288 132 284 125 280 C120 277 116 278 108 282 C110 258 109 232 112 210 C120 205 134 205 142 210 Z",
  },
  { muscle: "calves", view: "front", shape: "rect", x: 60, y: 288, width: 28, height: 56, rx: 10 },
  { muscle: "calves", view: "front", shape: "rect", x: 112, y: 288, width: 28, height: 56, rx: 10 },

  // ---- BACK ----
  {
    muscle: "trapezius",
    view: "back",
    shape: "path",
    d: "M100 56 L134 76 C130 84 120 92 100 96 C80 92 70 84 66 76 Z",
  },
  { muscle: "rear_deltoid", view: "back", shape: "ellipse", x: 44, y: 88, width: 20, height: 26 },
  { muscle: "rear_deltoid", view: "back", shape: "ellipse", x: 136, y: 88, width: 20, height: 26 },
  {
    muscle: "latissimus_dorsi",
    view: "back",
    shape: "path",
    d: "M58 96 C52 116 52 142 62 156 C70 148 82 142 92 140 C90 122 88 106 84 94 C76 92 66 92 58 96 Z",
  },
  {
    muscle: "latissimus_dorsi",
    view: "back",
    shape: "path",
    d: "M142 96 C148 116 148 142 138 156 C130 148 118 142 108 140 C110 122 112 106 116 94 C124 92 134 92 142 96 Z",
  },
  { muscle: "upper_back", view: "back", shape: "rect", x: 74, y: 90, width: 52, height: 40, rx: 10 },
  { muscle: "triceps", view: "back", shape: "rect", x: 38, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "triceps", view: "back", shape: "rect", x: 146, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "lower_back", view: "back", shape: "rect", x: 74, y: 156, width: 52, height: 26, rx: 10 },
  {
    muscle: "glutes",
    view: "back",
    shape: "path",
    d: "M62 186 C58 196 58 210 66 216 C76 222 92 222 100 216 C108 222 124 222 134 216 C142 210 142 196 138 186 C124 178 112 176 100 178 C88 176 76 178 62 186 Z",
  },
  {
    muscle: "hamstrings",
    view: "back",
    shape: "path",
    d: "M58 220 C56 242 57 264 62 280 C70 284 80 282 90 278 C90 258 89 236 88 220 C80 216 66 216 58 220 Z",
  },
  {
    muscle: "hamstrings",
    view: "back",
    shape: "path",
    d: "M142 220 C144 242 143 264 138 280 C130 284 120 282 110 278 C110 258 111 236 112 220 C120 216 134 216 142 220 Z",
  },
  { muscle: "calves", view: "back", shape: "rect", x: 60, y: 288, width: 28, height: 56, rx: 10 },
  { muscle: "calves", view: "back", shape: "rect", x: 112, y: 288, width: 28, height: 56, rx: 10 },
  { muscle: "lateral_deltoid", view: "back", shape: "ellipse", x: 34, y: 90, width: 12, height: 22 },
  { muscle: "lateral_deltoid", view: "back", shape: "ellipse", x: 154, y: 90, width: 12, height: 22 },
];
