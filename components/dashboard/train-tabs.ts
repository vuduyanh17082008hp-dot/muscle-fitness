import type { SectionTab } from "@/components/dashboard/section-tabs";

/**
 * The Train domain's contextual tab strip — shared by every page that
 * conceptually belongs under Train (the workouts landing page and
 * Muscle Intelligence) so they never drift into two different tab
 * sets. Muscle Intelligence lives at the sibling route
 * /dashboard/training-intelligence rather than nested under
 * /dashboard/workouts — the canonical route was kept as-is; only its
 * place in the nav changed.
 */
export const TRAIN_TABS: SectionTab[] = [
  { label: "Today", href: "/dashboard/workouts" },
  { label: "Plan", href: "/dashboard/split" },
  { label: "Exercises", href: "/dashboard/workouts/library" },
  { label: "History", href: "/dashboard/workouts/history" },
  { label: "Muscle Intelligence", href: "/dashboard/training-intelligence" },
];
