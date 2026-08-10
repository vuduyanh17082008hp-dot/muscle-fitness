import Link from "next/link";
import {
  Activity,
  Beef,
  Bot,
  CalendarDays,
  Camera,
  ChevronRight,
  Dumbbell,
  Flame,
  Plus,
  Sparkles,
  Utensils,
} from "lucide-react";

import type { DashboardData } from "@/features/dashboard/types";
import { WeightChart } from "@/components/dashboard/weight-chart";

const goalLabels: Record<string, string> = {
  lose_fat: "Fat loss",
  fat_loss: "Fat loss",
  lean_bulk: "Lean bulk",
  gain_muscle: "Muscle gain",
  muscle_gain: "Muscle gain",
  recomposition: "Body recomposition",
  maintenance: "Maintenance",
  performance: "Performance",
};

const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"] as const;
const fullWeekdayLabels = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;

function getDisplayName(
  fullName: string | null,
  email: string | null,
) {
  const clean = fullName?.trim();

  if (clean) {
    const parts = clean.split(/\s+/);
    // Vietnamese display often uses given name last.
    return parts.at(-1) ?? clean;
  }

  return email?.split("@")[0] ?? "Athlete";
}

function getGreeting(timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function clampNonNeg(value: number) {
  return Math.max(0, value);
}

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function MetricCard({
  icon: Icon,
  value,
  label,
  ofLabel,
  progress,
}: {
  icon: typeof Flame;
  value: string;
  label: string;
  ofLabel?: string;
  progress?: number | null;
}) {
  const pct =
    typeof progress === "number"
      ? Math.min(100, Math.max(0, progress))
      : null;

  return (
    <article className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.04]">
      <div className="mb-3 inline-flex size-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-[var(--color-accent-light)]">
        <Icon className="size-4" aria-hidden />
      </div>
      <p className="text-2xl font-semibold tracking-tight text-white md:text-[28px]">
        {value}
      </p>
      <p className="mt-1 text-xs text-zinc-400">{label}</p>
      {ofLabel ? (
        <p className="mt-0.5 text-[11px] text-zinc-600">{ofLabel}</p>
      ) : null}
      {pct !== null ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </article>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Utensils;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-5 text-center transition-colors duration-200 hover:border-[var(--color-accent)]/35 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50"
    >
      <span className="grid size-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-[var(--color-accent-light)] transition-colors group-hover:border-[var(--color-accent)]/30">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="text-xs font-medium text-zinc-200">{label}</span>
    </Link>
  );
}

const mealSlots = [
  { key: "breakfast", label: "Breakfast", hint: "Start your fuel" },
  { key: "lunch", label: "Lunch", hint: "Midday energy" },
  { key: "dinner", label: "Dinner", hint: "Recovery meal" },
  { key: "snacks", label: "Snacks", hint: "Optional top-ups" },
] as const;

export function DashboardOverview({
  data,
}: {
  data: DashboardData;
}) {
  const timezone = data.profile.timezone || "Asia/Singapore";
  const name = getDisplayName(data.profile.fullName, data.userEmail);
  const greeting = getGreeting(timezone);

  const calorieTarget = safeNumber(data.fitness.calorieTarget);
  const proteinTarget = safeNumber(data.fitness.proteinTargetG);
  const caloriesConsumed = data.todayMetrics?.caloriesConsumed ?? 0;
  const proteinConsumed = data.todayMetrics?.proteinConsumedG ?? 0;

  const caloriesLeft =
    calorieTarget === null
      ? null
      : clampNonNeg(calorieTarget - caloriesConsumed);
  const proteinLeft =
    proteinTarget === null
      ? null
      : clampNonNeg(proteinTarget - proteinConsumed);

  const calorieProgress =
    calorieTarget && calorieTarget > 0
      ? (caloriesConsumed / calorieTarget) * 100
      : null;
  const proteinProgress =
    proteinTarget && proteinTarget > 0
      ? (proteinConsumed / proteinTarget) * 100
      : null;

  const todayWorkout = data.todayWorkouts[0] ?? null;
  const workoutDone = Boolean(data.todayMetrics?.workoutCompleted);
  const weeklyAdherence = safeNumber(data.weeklyAdherence);
  const goalLabel = data.fitness.goal
    ? goalLabels[data.fitness.goal] ??
      data.fitness.goal.replaceAll("_", " ")
    : null;

  const coachBody =
    data.coachMessage?.body?.trim() ||
    (proteinLeft !== null && proteinLeft > 0
      ? `You still need about ${Math.round(proteinLeft)}g protein today. Prioritize a high-protein meal before your day ends.`
      : todayWorkout
        ? `Today's focus: ${todayWorkout.title}. Stay disciplined on technique and recovery.`
        : "Stay consistent. Log your nutrition and keep your training plan moving.");

  const today = new Date();
  const todayIndex = today.getDay();

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-white md:text-[32px]">
            {greeting}, {name}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {proteinLeft !== null
              ? `You have ${Math.round(proteinLeft)}g protein remaining today.`
              : goalLabel
                ? `Focus: ${goalLabel}`
                : "Your daily command center."}
          </p>
        </div>
        {!data.profile.onboardingCompleted ? (
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/35 bg-[var(--color-accent-soft)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-light)]"
          >
            Finish onboarding
            <ChevronRight className="size-3.5" />
          </Link>
        ) : null}
      </section>

      {/* Today at a glance */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-200">
          Today at a glance
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            icon={Activity}
            value={
              workoutDone
                ? "Done"
                : todayWorkout
                  ? "Ready"
                  : "Rest"
            }
            label={
              todayWorkout
                ? todayWorkout.title
                : "Workout / activity"
            }
            ofLabel={
              workoutDone
                ? "Session completed"
                : todayWorkout
                  ? "Planned for today"
                  : "No session logged"
            }
            progress={workoutDone ? 100 : todayWorkout ? 35 : 0}
          />
          <MetricCard
            icon={Flame}
            value={
              caloriesLeft === null
                ? "—"
                : String(Math.round(caloriesLeft))
            }
            label="cal left"
            ofLabel={
              calorieTarget === null
                ? "Set a calorie target"
                : `of ${Math.round(calorieTarget)}`
            }
            progress={calorieProgress}
          />
          <MetricCard
            icon={Beef}
            value={
              proteinLeft === null
                ? "—"
                : `${Math.round(proteinLeft)}g`
            }
            label="protein left"
            ofLabel={
              proteinTarget === null
                ? "Set a protein target"
                : `of ${Math.round(proteinTarget)}g`
            }
            progress={proteinProgress}
          />
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-zinc-200">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <QuickAction
            href="/dashboard/nutrition"
            icon={Utensils}
            label="Log Food"
          />
          <QuickAction
            href="/dashboard/workouts"
            icon={Dumbbell}
            label="Log Workout"
          />
          <QuickAction
            href="/ai-coach"
            icon={Bot}
            label="Ask AI Coach"
          />
          <QuickAction
            href="/dashboard/progress"
            icon={Camera}
            label="Check-in"
          />
        </div>
      </section>

      {/* AI Coach card */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#151517] via-[#101011] to-[#0B0B0C]">
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-stretch md:p-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-2 text-[var(--color-accent-light)]">
              <Sparkles className="size-4" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Muscle Fitness AI Coach
              </p>
            </div>
            <p className="text-sm text-zinc-400">
              Today ·{" "}
              <span className="text-zinc-200">
                {todayWorkout
                  ? todayWorkout.focus || todayWorkout.title
                  : "No workout planned"}
              </span>
            </p>
            <p className="max-w-2xl text-[15px] leading-relaxed text-zinc-100">
              {coachBody}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Warm-up
                </p>
                <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                  <li>• 5 min light cardio</li>
                  <li>• Dynamic mobility</li>
                  <li>• Progressive warm-up sets</li>
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Today&apos;s focus
                </p>
                <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                  <li>• Controlled technique</li>
                  <li>• Full range of motion</li>
                  <li>• Adequate rest</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href={
                  todayWorkout
                    ? `/dashboard/workouts`
                    : "/dashboard/workouts/plans/new"
                }
                className="inline-flex items-center rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-[var(--color-accent-light)]"
              >
                {todayWorkout ? "Open workouts" : "Plan workout"}
              </Link>
              <Link
                href="/ai-coach"
                className="inline-flex items-center rounded-full border border-white/[0.1] px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.04]"
              >
                Ask AI Coach
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Nutrition insight */}
      {proteinLeft !== null && proteinLeft > 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-[var(--color-accent)]/25 bg-[var(--color-accent-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-light)]">
              Protein priority
            </p>
            <p className="mt-1 text-sm text-zinc-200">
              You still need {Math.round(proteinLeft)}g protein today.
            </p>
          </div>
          <Link
            href="/ai-coach"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-accent)]/40 px-4 py-2 text-xs font-semibold text-[var(--color-accent-light)] transition-colors hover:bg-[var(--color-accent)]/15"
          >
            Get meal ideas
            <ChevronRight className="size-3.5" />
          </Link>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Meals today */}
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-zinc-200">
              Meals today
            </h2>
            <Link
              href="/dashboard/nutrition"
              className="text-xs font-medium text-[var(--color-accent-light)] hover:underline"
            >
              See all
            </Link>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {mealSlots.map((meal) => (
              <Link
                key={meal.key}
                href="/dashboard/nutrition"
                className="flex items-center gap-3 py-3.5 transition-colors hover:bg-white/[0.02]"
              >
                <span className="grid size-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-zinc-400">
                  <Utensils className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-100">
                    {meal.label}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {meal.hint} · tap to log
                  </span>
                </span>
                <ChevronRight className="size-4 text-zinc-600" />
              </Link>
            ))}
          </div>
          <Link
            href="/dashboard/nutrition"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] py-3 text-sm font-medium text-zinc-100 transition-colors hover:border-[var(--color-accent)]/35 hover:bg-white/[0.05]"
          >
            <Plus className="size-4" />
            Log meal
          </Link>
        </section>

        {/* What can I eat + weekly progress */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <h2 className="text-[15px] font-semibold text-zinc-200">
              What can I eat?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              Get meal ideas based on your remaining calories and
              macros.
            </p>
            <Link
              href="/ai-coach"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-[var(--color-accent-light)]"
            >
              Find a meal
              <ChevronRight className="size-3.5" />
            </Link>
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-zinc-200">
                Weekly progress
              </h2>
              <Link
                href="/dashboard/progress"
                className="text-xs text-[var(--color-accent-light)] hover:underline"
              >
                Details
              </Link>
            </div>
            {data.weightTrend.length > 0 ? (
              <div className="h-44">
                <WeightChart data={data.weightTrend} />
              </div>
            ) : (
              <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-4 text-center">
                <p className="text-sm text-zinc-400">
                  No progress data recorded this week.
                </p>
                <Link
                  href="/dashboard/progress"
                  className="mt-3 text-xs font-semibold text-[var(--color-accent-light)] hover:underline"
                >
                  Add check-in
                </Link>
              </div>
            )}
            <div className="mt-3 flex justify-between px-1 text-[11px] text-zinc-600">
              {weekdayLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Workout schedule */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-zinc-200">
            Workout schedule
          </h2>
          <Link
            href="/dashboard/workouts"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent-light)] hover:underline"
          >
            View plan
            <ChevronRight className="size-3.5" />
          </Link>
        </div>

        <article className="rounded-2xl border border-white/[0.07] bg-[#0B0B0C] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Today&apos;s workout
          </p>
          {todayWorkout ? (
            <>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                {todayWorkout.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                {todayWorkout.focus ||
                  todayWorkout.status.replaceAll("_", " ")}
                {todayWorkout.durationMinutes
                  ? ` · ${todayWorkout.durationMinutes} min`
                  : ""}
              </p>
              <Link
                href="/dashboard/workouts"
                className="mt-4 inline-flex rounded-full bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-[var(--color-accent-light)]"
              >
                {workoutDone ? "View workout" : "Start workout"}
              </Link>
            </>
          ) : (
            <>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Rest day
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                No workout planned today.
              </p>
              <Link
                href="/dashboard/workouts/plans/new"
                className="mt-4 inline-flex rounded-full border border-white/[0.1] px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/[0.04]"
              >
                Plan tomorrow
              </Link>
            </>
          )}
        </article>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {fullWeekdayLabels.map((label, index) => {
            const isToday = index === todayIndex;
            const hasSession =
              isToday && Boolean(todayWorkout);

            return (
              <div
                key={label}
                className={`min-w-[3.25rem] flex-1 rounded-xl border px-2 py-3 text-center transition-colors ${
                  isToday
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                <p className="text-[10px] font-semibold tracking-[0.12em] text-zinc-500">
                  {label}
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    isToday
                      ? "text-[var(--color-accent-light)]"
                      : "text-zinc-400"
                  }`}
                >
                  {isToday
                    ? hasSession
                      ? workoutDone
                        ? "Done"
                        : "Today"
                      : "Rest"
                    : "—"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Weekly adherence */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-zinc-200">
            Weekly adherence
          </h2>
          <CalendarDays className="size-4 text-zinc-600" aria-hidden />
        </div>
        {weeklyAdherence !== null ? (
          <>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)]"
                style={{
                  width: `${Math.min(100, Math.max(0, weeklyAdherence))}%`,
                }}
              />
            </div>
            <p className="mt-3 text-sm text-zinc-300">
              {Math.round(weeklyAdherence)}% weekly adherence
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">
            Complete more sessions this week to unlock adherence
            tracking.
          </p>
        )}
      </section>
    </div>
  );
}
