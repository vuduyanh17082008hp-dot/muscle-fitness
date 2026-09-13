import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDot,
  Dumbbell,
  HeartPulse,
  Utensils,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import type { DailyAction, DailyActionType } from "@/lib/daily-plan/types";

const TYPE_ICON: Record<DailyActionType, LucideIcon> = {
  workout: Dumbbell,
  nutrition: Utensils,
  recovery: HeartPulse,
  checkin: HeartPulse,
  activity: CalendarClock,
  calendar: CalendarClock,
};

const ADAPTIVE_LABEL_ACCENT: Record<string, string> = {
  "Adjusted session": "text-amber-300",
  "Progression available": "text-emerald-300",
  "Normal session": "text-zinc-500",
};

function StatusIcon({ status }: { status: DailyAction["status"] }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-5 text-emerald-400" aria-hidden="true" />;
  }
  if (status === "active") {
    return <CircleDot className="size-5 text-amber-400" aria-hidden="true" />;
  }
  if (status === "skipped") {
    return <XCircle className="size-5 text-zinc-600" aria-hidden="true" />;
  }
  return <Circle className="size-5 text-zinc-600" aria-hidden="true" />;
}

function formatScheduledTime(scheduledAt: string | null): string | null {
  if (!scheduledAt) return null;

  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function TodayPlanItem({ action }: { action: DailyAction }) {
  const Icon = TYPE_ICON[action.type];
  const time = formatScheduledTime(action.scheduledAt);
  const isDone = action.status === "completed" || action.status === "skipped";

  const adaptiveLabel =
    typeof action.metadata?.adaptiveLabel === "string" ? action.metadata.adaptiveLabel : null;
  const adaptiveDetail =
    typeof action.metadata?.adaptiveDetail === "string" ? action.metadata.adaptiveDetail : null;

  return (
    <Link
      href={action.actionUrl}
      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.05]"
    >
      <StatusIcon status={action.status} />

      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-mf-surface text-zinc-400 group-hover:text-white">
        <Icon className="size-4.5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-semibold ${
            isDone ? "text-zinc-500 line-through decoration-zinc-700" : "text-white"
          }`}
        >
          {action.title}
        </span>

        <span className="mt-0.5 block truncate text-xs text-zinc-500">
          {[time, action.subtitle].filter(Boolean).join(" • ") || " "}
        </span>

        {adaptiveLabel ? (
          <span className="mt-1 block truncate text-xs">
            <span className={`font-bold ${ADAPTIVE_LABEL_ACCENT[adaptiveLabel] ?? "text-zinc-400"}`}>
              {adaptiveLabel}
            </span>
            {adaptiveDetail ? <span className="text-zinc-600"> — {adaptiveDetail}</span> : null}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function TodayPlanSection({
  actions,
  buildPlanHref = "/dashboard/workouts/plans/new",
}: {
  actions: DailyAction[];
  buildPlanHref?: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
        Today&apos;s plan
      </h2>

      {actions.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={CalendarClock}
            title="Nothing scheduled yet"
            description="Create or generate your training plan to organize your day."
            href={buildPlanHref}
            action="Build a plan"
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2.5">
          {actions.map((action) => (
            <TodayPlanItem key={action.id} action={action} />
          ))}
        </div>
      )}
    </section>
  );
}
