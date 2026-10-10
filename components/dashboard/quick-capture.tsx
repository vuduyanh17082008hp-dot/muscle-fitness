"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Utensils, Scale, Dumbbell, HeartPulse, X } from "lucide-react";

export function QuickCapture() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Universal Floating + Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Quick capture"
        className="fixed bottom-6 right-6 z-30 flex size-12 items-center justify-center rounded-full border border-white/20 bg-mf-glass-elevated text-white shadow-xl transition hover:scale-105 hover:bg-mf-glass-surface focus:outline-none focus:ring-2 focus:ring-mf-glass-brand"
      >
        <Plus className="size-5" />
      </button>

      {/* Modal / Backdrop */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4 sm:items-center">
          <div
            role="dialog"
            aria-label="Quick capture menu"
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-mf-glass-surface p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <p className="text-sm font-bold text-mf-glass-text">Quick Capture</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid size-7 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Link
                href="/dashboard/nutrition"
                onClick={() => setIsOpen(false)}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-center transition hover:border-white/15 hover:bg-white/[0.05]"
              >
                <Utensils className="size-5 text-emerald-400" />
                <span className="text-xs font-semibold text-mf-glass-text">Log Meal</span>
              </Link>

              <Link
                href="/dashboard/workouts"
                onClick={() => setIsOpen(false)}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-center transition hover:border-white/15 hover:bg-white/[0.05]"
              >
                <Dumbbell className="size-5 text-mf-glass-brand" />
                <span className="text-xs font-semibold text-mf-glass-text">Start Workout</span>
              </Link>

              <Link
                href="/dashboard/recovery"
                onClick={() => setIsOpen(false)}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-center transition hover:border-white/15 hover:bg-white/[0.05]"
              >
                <HeartPulse className="size-5 text-mf-glass-dante" />
                <span className="text-xs font-semibold text-mf-glass-text">Check-in</span>
              </Link>

              <Link
                href="/dashboard/progress"
                onClick={() => setIsOpen(false)}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-center transition hover:border-white/15 hover:bg-white/[0.05]"
              >
                <Scale className="size-5 text-mf-glass-analytics" />
                <span className="text-xs font-semibold text-mf-glass-text">Log Weight</span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
