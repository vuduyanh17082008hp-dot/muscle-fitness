import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";

/**
 * Anatomical sub-regions — educational/display detail nested under an
 * existing `CanonicalMuscle`, per the Atlas's Anatomy tab.
 *
 * DELIBERATELY has no analytics/volume/exposure field of any kind.
 * Every real analytic (effective sets, change, recommendation) is
 * modeled at the whole-muscle level only (lib/training/volume-engine.ts
 * etc.) — there is no per-sub-region data anywhere in the app, and
 * there must never be an invented one. Making that impossible to
 * represent in this type (rather than just a UI convention someone
 * could forget) is the point.
 *
 * Only seeded where a genuinely distinct sub-region concept exists on
 * top of the current taxonomy:
 *  - trapezius (upper/middle/lower) — one CanonicalMuscle, three
 *    commonly-named parts.
 *  - chest (clavicular/sternocostal) — "upper_chest" is already its
 *    own CanonicalMuscle for the clavicular head, so only the
 *    sternocostal (main/lower chest) sub-region is added here to
 *    avoid a confusing double-representation of the same anatomy.
 *
 * Deltoid heads (anterior/lateral/posterior) are NOT repeated here —
 * they already exist as three separate CanonicalMuscle values
 * (anterior_deltoid/lateral_deltoid/rear_deltoid), each with its own
 * real analytics. Adding a "sub-region" layer under them would just
 * duplicate that split at a lower fidelity, not add anything.
 */
export type MuscleSubRegion = {
  id: string;
  parentMuscle: CanonicalMuscle;
  displayName: string;
  shortDescription: string;
  visualRegionIds: string[];
};

export const MUSCLE_SUB_REGIONS: MuscleSubRegion[] = [
  {
    id: "trapezius_upper",
    parentMuscle: "trapezius",
    displayName: "Upper Trapezius",
    shortDescription: "Elevates the shoulder blades — the portion most felt in shrugging movements.",
    visualRegionIds: ["trapezius-back"],
  },
  {
    id: "trapezius_middle",
    parentMuscle: "trapezius",
    displayName: "Middle Trapezius",
    shortDescription: "Retracts the shoulder blades — active in rowing movements.",
    visualRegionIds: ["trapezius-back"],
  },
  {
    id: "trapezius_lower",
    parentMuscle: "trapezius",
    displayName: "Lower Trapezius",
    shortDescription: "Depresses and stabilizes the shoulder blades from below.",
    visualRegionIds: ["trapezius-back"],
  },
  {
    id: "chest_sternocostal",
    parentMuscle: "chest",
    displayName: "Sternocostal Chest",
    shortDescription: "The larger, lower portion of the chest attaching to the sternum and ribs.",
    visualRegionIds: ["chest-front"],
  },
];

export function getSubRegionsFor(muscle: CanonicalMuscle): MuscleSubRegion[] {
  return MUSCLE_SUB_REGIONS.filter((region) => region.parentMuscle === muscle);
}
