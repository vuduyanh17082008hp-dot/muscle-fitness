import type { SectionTab } from "@/components/dashboard/section-tabs"

/** Today is the logging screen; planning and macro targets live on their own route. */
export const NUTRITION_TABS: SectionTab[] = [
  { label: "Today", href: "/dashboard/nutrition#today" },
  { label: "Coach", href: "/dashboard/nutrition#coach" },
  { label: "Plan & targets", href: "/dashboard/nutrition/plan" },
  { label: "Insights", href: "/dashboard/ai-coach" },
]
