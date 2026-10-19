"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Plus, Utensils, Scale, Dumbbell, HeartPulse } from "lucide-react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";

export function QuickCapture({ className }: { className?: string } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* Universal Floating + Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Quick capture"
        className={cn(
          "group pointer-events-auto relative flex size-12 items-center justify-center rounded-full",
          "border border-white/20 bg-mf-glass-elevated text-white shadow-xl transition",
          "hover:scale-105 hover:bg-mf-glass-surface focus:outline-none focus:ring-2 focus:ring-mf-glass-brand",
          className,
        )}
      >
        <Plus className="size-5" />

        <span
          className={cn(
            "pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg",
            "border border-mf-glass-border bg-mf-glass-elevated px-3 py-1.5 text-xs font-semibold text-mf-glass-text",
            "opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 lg:block",
          )}
        >
          Quick Capture
        </span>
      </button>

      {/* Accessible Radix-backed Bottom Sheet / Modal */}
      <BottomSheet
        open={isOpen}
        onOpenChange={(next) => {
          setIsOpen(next);
          if (!next) triggerRef.current?.focus();
        }}
        title="Quick Capture"
        className="z-[60] sm:max-w-md"
      >
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Link
            href="/dashboard/nutrition"
            onClick={() => setIsOpen(false)}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center transition hover:border-white/15 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-mf-glass-brand"
          >
            <Utensils className="size-5 text-emerald-400" />
            <span className="text-xs font-semibold text-mf-glass-text">Log Meal</span>
          </Link>

          <Link
            href="/dashboard/workouts"
            onClick={() => setIsOpen(false)}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center transition hover:border-white/15 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-mf-glass-brand"
          >
            <Dumbbell className="size-5 text-mf-glass-brand" />
            <span className="text-xs font-semibold text-mf-glass-text">Start Workout</span>
          </Link>

          <Link
            href="/dashboard/recovery"
            onClick={() => setIsOpen(false)}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center transition hover:border-white/15 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-mf-glass-brand"
          >
            <HeartPulse className="size-5 text-mf-glass-dante" />
            <span className="text-xs font-semibold text-mf-glass-text">Check-in</span>
          </Link>

          <Link
            href="/dashboard/progress"
            onClick={() => setIsOpen(false)}
            className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center transition hover:border-white/15 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-mf-glass-brand"
          >
            <Scale className="size-5 text-mf-glass-analytics" />
            <span className="text-xs font-semibold text-mf-glass-text">Log Weight</span>
          </Link>
        </div>
      </BottomSheet>
    </>
  );
}

export default QuickCapture;
