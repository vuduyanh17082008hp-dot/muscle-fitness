import Link from "next/link";
import { ChevronRight, CircleCheck, CircleDashed, Salad, Sparkles } from "lucide-react";

import type { TodaySession } from "@/lib/training/load-today-session";
import type { DailyAction, DailyActionStatus } from "@/lib/daily-plan/types";
import { resolveCanonicalMuscle, MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import { GlassCard, GlassCardHeader, GlassDivider } from "@/components/dashboard/glass/glass-card";
import { cn } from "@/lib/cn";

export type TodaysPlanCardProps = {
  todaySession: TodaySession | null;
  /** Full today plan list from buildTodayPlan() — the workout entry is pulled out for the hero; the rest render as action rows. */
  actions: DailyAction[];
  timeZone: string;
};

function sessionTags(session: TodaySession): string[] {
  const muscles = new Set<string>();

  for (const exercise of session.exercises) {
    if (exercise.isSkipped) continue;
    const canonical = resolveCanonicalMuscle(exercise.primaryMuscle);
    if (canonical) muscles.add(MUSCLE_DISPLAY_NAME[canonical]);
  }

  return Array.from(muscles).slice(0, 3);
}

function formatScheduledTime(scheduledFor: string | null, timeZone: string): string | null {
  if (!scheduledFor) return null;

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(scheduledFor));
  } catch {
    return null;
  }
}

function primaryCta(session: TodaySession): { label: string; href: string } {
  const href = `/dashboard/workouts/session/${session.id}`;

  if (session.sessionState === "completed") {
    return { label: "VIEW WORKOUT", href };
  }

  if (session.sessionState === "in_progress" || session.sessionState === "paused") {
    return { label: "CONTINUE WORKOUT", href };
  }

  return { label: "START WORKOUT", href };
}

const ACTION_ICON: Record<DailyAction["type"], typeof Salad> = {
  workout: Salad,
  nutrition: Salad,
  recovery: Salad,
  checkin: Sparkles,
  activity: Salad,
  calendar: Salad,
};

function ActionStatusGlyph({ status }: { status: DailyActionStatus }) {
  if (status === "completed") {
    return <CircleCheck className="size-4 shrink-0 text-mf-glass-text-muted" aria-hidden="true" />;
  }

  if (status === "active") {
    return <CircleDashed className="size-4 shrink-0 animate-pulse text-mf-glass-brand" aria-hidden="true" />;
  }

  return <CircleDashed className="size-4 shrink-0 text-mf-glass-text-muted" aria-hidden="true" />;
}

function ActionRow({ action }: { action: DailyAction }) {
  const Icon = ACTION_ICON[action.type] ?? Salad;
  const clickable = Boolean(action.actionUrl);

  const row = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl px-1 py-2.5",
        action.status === "skipped" && "opacity-60",
      )}
    >
      <ActionStatusGlyph status={action.status} />

      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-mf-glass-border bg-white/[0.02] text-mf-glass-text-muted">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-mf-glass-text">{action.title}</p>
        {action.subtitle ? (
          <p className="truncate text-xs text-mf-glass-text-muted">{action.subtitle}</p>
        ) : null}
      </div>

      {clickable ? (
        <ChevronRight className="size-3.5 shrink-0 text-mf-glass-text-muted" aria-hidden="true" />
      ) : null}
    </div>
  );

  if (!clickable) return row;

  return (
    <Link
      href={action.actionUrl}
      className="-mx-1 block rounded-xl transition hover:bg-white/[0.03]"
    >
      {row}
    </Link>
  );
}

export function TodaysPlanCard({ todaySession, actions, timeZone }: TodaysPlanCardProps) {
  const workoutAction = actions.find((action) => action.type === "workout");
  const supportingActions = actions.filter((action) => action.type !== "workout");

  if (!todaySession) {
    return (
      <GlassCard data-testid="todays-plan-card">
        <GlassCardHeader title="Today's Plan" />

        <div className="mt-4">
          <p className="text-xl font-bold text-mf-glass-text">Rest Day</p>
          <p className="mt-1 text-sm text-mf-glass-text-muted">
            No training session is scheduled today.
          </p>
        </div>

        {supportingActions.length > 0 ? (
          <>
            <GlassDivider />
            <div className="-mt-1 space-y-0.5">
              {supportingActions.map((action) => (
                <ActionRow key={action.id} action={action} />
              ))}
            </div>
          </>
        ) : null}

        <Link
          href="/dashboard/recovery"
          className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-mf-glass-brand text-sm font-bold uppercase tracking-[0.08em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
        >
          View Recovery
        </Link>
      </GlassCard>
    );
  }

  const tags = sessionTags(todaySession);
  const time = formatScheduledTime(todaySession.scheduledFor, timeZone);
  const cta = primaryCta(todaySession);
  const activeExerciseCount = todaySession.exercises.filter((exercise) => !exercise.isSkipped).length;

  const completionPercent =
    todaySession.sessionState === "completed"
      ? 100
      : todaySession.sessionState === "cancelled"
        ? null
        : todaySession.sessionState === "in_progress" || todaySession.sessionState === "paused"
          ? null
          : 0;

  return (
    <GlassCard data-testid="todays-plan-card">
      <GlassCardHeader title="Today's Plan" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold leading-tight text-mf-glass-text sm:text-[26px]">
            {todaySession.name ?? "Training session"}
          </h2>

          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-mf-glass-border bg-white/[0.02] px-2.5 py-1 text-[11px] font-semibold text-mf-glass-text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          <p className="mt-3 text-sm text-mf-glass-text-muted">
            {[time, todaySession.durationMinutes ? `${todaySession.durationMinutes} min` : null]
              .filter(Boolean)
              .join(" · ") || `${activeExerciseCount} exercises planned`}
          </p>
        </div>

        <div className="relative grid size-16 shrink-0 place-items-center" aria-hidden={completionPercent === null}>
          <svg viewBox="0 0 40 40" className="size-16 -rotate-90">
            <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
            {completionPercent !== null ? (
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="var(--mf-glass-brand)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 16}
                strokeDashoffset={2 * Math.PI * 16 * (1 - completionPercent / 100)}
              />
            ) : null}
          </svg>
          <span className="absolute text-[11px] font-bold text-mf-glass-text">
            {completionPercent !== null ? `${completionPercent}%` : "…"}
          </span>
        </div>
      </div>

      {supportingActions.length > 0 ? (
        <>
          <GlassDivider />
          <div className="-mt-1 space-y-0.5">
            {supportingActions.map((action) => (
              <ActionRow key={action.id} action={action} />
            ))}
          </div>
        </>
      ) : null}

      {workoutAction?.metadata?.adaptiveLabel ? (
        <p className="mt-4 text-xs text-mf-glass-text-muted">
          <span className="font-semibold text-mf-glass-brand">{workoutAction.metadata.adaptiveLabel}</span>
          {workoutAction.metadata.adaptiveDetail ? ` — ${workoutAction.metadata.adaptiveDetail}` : ""}
        </p>
      ) : null}

      <Link
        href={cta.href}
        className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-mf-glass-brand text-sm font-bold uppercase tracking-[0.08em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
      >
        {cta.label}
      </Link>
    </GlassCard>
  );
}
