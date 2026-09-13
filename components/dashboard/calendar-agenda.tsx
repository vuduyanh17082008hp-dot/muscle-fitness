import Link from "next/link";
import { CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";

import type { CalendarDay } from "@/lib/daily-plan/load-calendar-range";
import type { DailyAction } from "@/lib/daily-plan/types";

function StatusIcon({ status }: { status: DailyAction["status"] }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-4 text-emerald-400" aria-hidden="true" />;
  }
  if (status === "active") {
    return <CircleDot className="size-4 text-amber-400" aria-hidden="true" />;
  }
  if (status === "skipped") {
    return <XCircle className="size-4 text-zinc-600" aria-hidden="true" />;
  }
  return <Circle className="size-4 text-zinc-600" aria-hidden="true" />;
}

function formatDayLabel(dateKey: string, isToday: boolean): string {
  if (isToday) return "Today";

  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(scheduledAt: string | null): string | null {
  if (!scheduledAt) return null;
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function CalendarAgenda({ days }: { days: CalendarDay[] }) {
  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section
          key={day.date}
          className={`rounded-2xl border p-5 ${
            day.isToday
              ? "border-amber-400/30 bg-amber-400/[0.04]"
              : "border-white/10 bg-mf-surface"
          }`}
        >
          <h3
            className={`text-xs font-black uppercase tracking-[0.2em] ${
              day.isToday ? "text-amber-300" : "text-zinc-500"
            }`}
          >
            {formatDayLabel(day.date, day.isToday)}
          </h3>

          {day.actions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">Nothing scheduled.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {day.actions.map((action) => {
                const time = formatTime(action.scheduledAt);

                return (
                  <Link
                    key={action.id}
                    href={action.actionUrl}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <StatusIcon status={action.status} />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {action.title}
                      </span>
                      {(time || action.subtitle) && (
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">
                          {[time, action.subtitle].filter(Boolean).join(" • ")}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
