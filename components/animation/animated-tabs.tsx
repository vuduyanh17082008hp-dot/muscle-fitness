"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * AnimatedTabs — a sliding-pill tab/segment indicator shared by
 * SegmentedControl (components/ui/segmented-control.tsx) and any
 * future tab-style switcher. Uses a shared layoutId so the highlight
 * glides between options instead of popping — one indicator, not a
 * per-tab background transition.
 */
export type AnimatedTabOption<T extends string> = {
  value: T;
  label: string;
};

export function AnimatedTabs<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  className,
}: {
  options: AnimatedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Unique per instance when multiple AnimatedTabs render simultaneously — defaults to a shared id, which is fine for a single instance per page. */
  layoutId?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const sharedLayoutId = layoutId ?? "mf-animated-tabs";

  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors duration-200",
              active ? "text-black" : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {active ? (
              <motion.span
                layoutId={sharedLayoutId}
                className="absolute inset-0 rounded-full bg-amber-400"
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 35 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
