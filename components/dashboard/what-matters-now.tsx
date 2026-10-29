import Link from "next/link";
import { CheckCircle, ChevronRight } from "lucide-react";

export type WhatMattersItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  urgency?: "high" | "normal" | "low";
};

export type WhatMattersNowProps = {
  items: WhatMattersItem[];
  /** trainingHold(dailyDecision): while it holds training, an empty list is never confirmed as "on track". */
  hold?: "recovery" | "unverified" | null;
  /** Today's session/plan read failed (classifyTodaySession → "unknown"): status is unknown, never "on track". */
  statusUnknown?: boolean;
};

export function WhatMattersNow({ items, hold = null, statusUnknown = false }: WhatMattersNowProps) {
  if (items.length === 0 && hold) {
    return (
      <Link
        href="/dashboard/recovery"
        className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-mf-glass-text-muted transition hover:border-white/20"
      >
        <span className="size-2 shrink-0 rounded-full bg-amber-400" />
        <span>
          {hold === "recovery"
            ? "Recovery first today — your check-in flagged pain or illness."
            : "Today's pain/illness check-in couldn't be confirmed — check Recovery before training."}
        </span>
      </Link>
    );
  }

  // QA-06: when today's workout status couldn't be read, "on track" is unknown — never claim it next to an error.
  if (items.length === 0 && statusUnknown) {
    return (
      <Link
        href="/dashboard/workouts"
        className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-mf-glass-text-muted transition hover:border-white/20"
      >
        <span className="size-2 shrink-0 rounded-full bg-amber-400" />
        <span>Today&apos;s workout status couldn&apos;t be loaded — check Training before you start.</span>
      </Link>
    );
  }

  // If no items exist, render a quiet, calm positive confirmation.
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-mf-glass-text-muted">
        <CheckCircle className="size-4 shrink-0 text-emerald-400" />
        <span>Nothing requires urgent attention right now. Plan is on track.</span>
      </div>
    );
  }

  // Display max 3 items
  const visibleItems = items.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold uppercase tracking-wider text-mf-glass-text-muted">
          What matters now
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-mf-glass-surface p-3.5 transition hover:border-white/20 hover:bg-mf-glass-elevated"
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 size-2 shrink-0 rounded-full ${
                  item.urgency === "high"
                    ? "bg-amber-400"
                    : item.urgency === "low"
                    ? "bg-zinc-500"
                    : "bg-mf-glass-brand"
                }`}
              />
              <div>
                <p className="text-xs font-bold text-mf-glass-text group-hover:text-white">
                  {item.title}
                </p>
                {item.subtitle ? (
                  <p className="mt-0.5 text-xs text-mf-glass-text-muted">
                    {item.subtitle}
                  </p>
                ) : null}
              </div>
            </div>

            <ChevronRight className="size-3.5 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
          </Link>
        ))}
      </div>
    </div>
  );
}
