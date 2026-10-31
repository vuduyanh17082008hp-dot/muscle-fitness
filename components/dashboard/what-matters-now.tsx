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
        className="flex min-h-11 items-center gap-3 rounded-xl border border-mf-glass-border bg-mf-glass-surface px-4 py-3 text-sm text-mf-glass-text-secondary transition hover:border-mf-glass-text"
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
        className="flex min-h-11 items-center gap-3 rounded-xl border border-mf-glass-border bg-mf-glass-surface px-4 py-3 text-sm text-mf-glass-text-secondary transition hover:border-mf-glass-text"
      >
        <span className="size-2 shrink-0 rounded-full bg-amber-400" />
        <span>Today&apos;s workout status couldn&apos;t be loaded — check Training before you start.</span>
      </Link>
    );
  }

  // If no items exist, render a quiet, calm positive confirmation.
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-mf-glass-border bg-mf-glass-surface px-4 py-3 text-sm text-mf-glass-text-secondary">
        <CheckCircle className="size-4 shrink-0 text-emerald-400" />
        <span>Nothing requires urgent attention right now. Plan is on track.</span>
      </div>
    );
  }

  // Display max 3 items
  const visibleItems = items.slice(0, 3);

  return (
    // V4 "priorities" sheet: numbered tiles on the secondary paper, same deterministic items as before.
    <div className="space-y-3 rounded-2xl border border-mf-glass-border bg-mf-glass-bg-deep p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
          What matters now
        </p>
        <p className="text-xs font-bold tabular-nums text-mf-glass-text-muted">{String(visibleItems.length).padStart(2, "0")} today</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleItems.map((item, index) => (
          <Link
            key={item.id}
            href={item.href}
            className="group flex min-h-16 items-center justify-between gap-3 rounded-xl border border-mf-glass-border bg-mf-glass-surface p-3.5 transition hover:border-mf-glass-text"
          >
            <div className="flex items-start gap-2.5">
              <span className="font-heading text-lg font-black leading-none tabular-nums text-mf-glass-text-muted">{index + 1}.</span>
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
                <p className="text-sm font-bold text-mf-glass-text">
                  {item.title}
                </p>
                {item.subtitle ? (
                  <p className="mt-0.5 text-xs text-mf-glass-text-muted">
                    {item.subtitle}
                  </p>
                ) : null}
              </div>
            </div>

            <ChevronRight className="size-4 shrink-0 text-mf-glass-text-muted transition group-hover:translate-x-0.5 group-hover:text-mf-glass-text" />
          </Link>
        ))}
      </div>
    </div>
  );
}
