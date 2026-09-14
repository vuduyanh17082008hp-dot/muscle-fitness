import Link from "next/link";
import { CalendarCheck, Dumbbell, Utensils } from "lucide-react";

import type { RecentActivityEntry } from "@/lib/dashboard/recent-activity";
import { GlassCard, GlassCardHeader } from "@/components/dashboard/glass/glass-card";

const CATEGORY_ICON = {
  workout: Dumbbell,
  checkin: CalendarCheck,
  nutrition: Utensils,
} as const;

function formatRelative(sortKey: string, now: Date): string {
  const date = sortKey.length === 10 ? new Date(`${sortKey}T12:00:00.000Z`) : new Date(sortKey);
  const diffDays = Math.round((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

export function RecentActivityCard({ entries, now = new Date() }: { entries: RecentActivityEntry[]; now?: Date }) {
  return (
    <GlassCard data-testid="recent-activity-card">
      <GlassCardHeader title="Recent Activity" />

      {entries.length === 0 ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-mf-glass-text-muted">No activity yet.</p>
          <Link
            href="/dashboard/workouts"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-mf-glass-brand px-4 text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            Start Today&apos;s Plan
          </Link>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {entries.slice(0, 3).map((entry) => {
            const Icon = CATEGORY_ICON[entry.category];

            return (
              <li
                key={entry.id}
                className="flex flex-col gap-2 rounded-xl border border-mf-glass-border bg-white/[0.015] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-mf-glass-border bg-white/[0.02] text-mf-glass-text-muted">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="text-[11px] text-mf-glass-text-muted">{formatRelative(entry.sortKey, now)}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-mf-glass-text">{entry.title}</p>
                  <p className="truncate text-xs text-mf-glass-text-muted">{entry.subtitle}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
