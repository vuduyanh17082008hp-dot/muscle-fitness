"use client";

import { AnimatedTabs, type AnimatedTabOption } from "@/components/animation/animated-tabs";

/**
 * SegmentedControl — a generic 2-4 option value switcher (e.g.
 * Day/Week/Month, or a unit toggle). Distinct from SectionTabs
 * (components/dashboard/section-tabs.tsx), which is route-based page
 * navigation — this never changes the URL, only a piece of local
 * state the caller owns.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: AnimatedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return <AnimatedTabs options={options} value={value} onChange={onChange} className={className} />;
}
