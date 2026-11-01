import { BACK_ATLAS, FRONT_ATLAS, type AtlasPiece } from "@/lib/training/anatomy/atlas-geometry";
import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/** Canonical muscles drawn in each view, derived from the geometry (never a second hand-kept list). */
const IN_VIEW = {
  front: new Set(FRONT_ATLAS.flatMap((piece: AtlasPiece) => (piece.muscle ? [piece.muscle] : []))),
  back: new Set(BACK_ATLAS.flatMap((piece: AtlasPiece) => (piece.muscle ? [piece.muscle] : []))),
} as const;

export function musclesInView(view: "front" | "back"): ReadonlySet<CanonicalMuscle> {
  return IN_VIEW[view];
}
