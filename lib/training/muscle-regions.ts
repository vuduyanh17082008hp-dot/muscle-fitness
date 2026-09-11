import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Static layout for the Muscle Map SVG (spec §18-§19).
 *
 * Original, simplified body-outline artwork — not photorealistic
 * anatomy — deliberately kept as basic shapes so it stays original
 * work rather than a copy of copyrighted anatomical illustration.
 * viewBox is 0 0 200 400 for both views.
 */
export type MuscleRegion = {
  muscle: CanonicalMuscle;
  view: "front" | "back";
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  rx?: number;
};

export const MUSCLE_REGIONS: MuscleRegion[] = [
  // ---- FRONT ----
  { muscle: "upper_chest", view: "front", shape: "rect", x: 62, y: 78, width: 76, height: 16, rx: 8 },
  { muscle: "chest", view: "front", shape: "rect", x: 60, y: 95, width: 80, height: 28, rx: 10 },
  { muscle: "anterior_deltoid", view: "front", shape: "ellipse", x: 44, y: 90, width: 20, height: 26 },
  { muscle: "anterior_deltoid", view: "front", shape: "ellipse", x: 136, y: 90, width: 20, height: 26 },
  { muscle: "biceps", view: "front", shape: "rect", x: 38, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "biceps", view: "front", shape: "rect", x: 146, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "forearms", view: "front", shape: "rect", x: 36, y: 163, width: 14, height: 38, rx: 7 },
  { muscle: "forearms", view: "front", shape: "rect", x: 150, y: 163, width: 14, height: 38, rx: 7 },
  { muscle: "abdominals", view: "front", shape: "rect", x: 68, y: 126, width: 64, height: 56, rx: 10 },
  { muscle: "quadriceps", view: "front", shape: "rect", x: 58, y: 208, width: 34, height: 74, rx: 12 },
  { muscle: "quadriceps", view: "front", shape: "rect", x: 108, y: 208, width: 34, height: 74, rx: 12 },
  { muscle: "calves", view: "front", shape: "rect", x: 60, y: 288, width: 28, height: 56, rx: 10 },
  { muscle: "calves", view: "front", shape: "rect", x: 112, y: 288, width: 28, height: 56, rx: 10 },

  // ---- BACK ----
  { muscle: "trapezius", view: "back", shape: "rect", x: 68, y: 60, width: 64, height: 26, rx: 10 },
  { muscle: "rear_deltoid", view: "back", shape: "ellipse", x: 44, y: 88, width: 20, height: 26 },
  { muscle: "rear_deltoid", view: "back", shape: "ellipse", x: 136, y: 88, width: 20, height: 26 },
  { muscle: "latissimus_dorsi", view: "back", shape: "rect", x: 56, y: 96, width: 36, height: 60, rx: 12 },
  { muscle: "latissimus_dorsi", view: "back", shape: "rect", x: 108, y: 96, width: 36, height: 60, rx: 12 },
  { muscle: "upper_back", view: "back", shape: "rect", x: 74, y: 90, width: 52, height: 40, rx: 10 },
  { muscle: "triceps", view: "back", shape: "rect", x: 38, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "triceps", view: "back", shape: "rect", x: 146, y: 120, width: 16, height: 40, rx: 8 },
  { muscle: "lower_back", view: "back", shape: "rect", x: 74, y: 156, width: 52, height: 26, rx: 10 },
  { muscle: "glutes", view: "back", shape: "rect", x: 62, y: 184, width: 76, height: 32, rx: 16 },
  { muscle: "hamstrings", view: "back", shape: "rect", x: 58, y: 218, width: 34, height: 64, rx: 12 },
  { muscle: "hamstrings", view: "back", shape: "rect", x: 108, y: 218, width: 34, height: 64, rx: 12 },
  { muscle: "calves", view: "back", shape: "rect", x: 60, y: 288, width: 28, height: 56, rx: 10 },
  { muscle: "calves", view: "back", shape: "rect", x: 112, y: 288, width: 28, height: 56, rx: 10 },
  { muscle: "lateral_deltoid", view: "back", shape: "ellipse", x: 34, y: 90, width: 12, height: 22 },
  { muscle: "lateral_deltoid", view: "back", shape: "ellipse", x: 154, y: 90, width: 12, height: 22 },
];
