import Link from 'next/link'

import {
  Activity,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleGauge,
  Dumbbell,
  Droplets,
  Flame,
  Footprints,
  MessageSquareText,
  Scale,
  Sparkles,
  Target,
  Utensils,
} from 'lucide-react'

import type { DashboardData } from '@/features/dashboard/types'

import { EmptyState } from './empty-state'
import { MetricCard } from './metric-card'
import { WeightChart } from './weight-chart'

const goalLabels: Record<
  string,
  string
> = {
  lose_fat: 'Fat loss',
  fat_loss: 'Fat loss',

  lean_bulk: 'Lean bulk',

  gain_muscle:
    'Muscle gain',

  muscle_gain:
    'Muscle gain',

  recomposition:
    'Body recomposition',

  maintenance:
    'Maintenance',

  performance:
    'Performance',
}

function getFirstName(
  fullName: string | null,
  email: string | null,
) {
  const cleanName =
    fullName?.trim()

  if (cleanName) {
    const parts =
      cleanName.split(/\s+/)

    return (
      parts.at(-1) ??
      cleanName
    )
  }

  return (
    email?.split('@')[0] ??
    'Athlete'
  )
}

function getGreeting(
  timezone: string,
) {
  const hour = Number(
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      },
    ).format(new Date()),
  )

  if (hour < 12) {
    return 'Good morning'
  }

  if (hour < 18) {
    return 'Good afternoon'
  }

  return 'Good evening'
}

function formatDashboardDate(
  timezone: string,
) {
  return new Intl.DateTimeFormat(
    'en-SG',
    {
      timeZone: timezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    },
  ).format(new Date())
}

function formatTime(
  value: string | null,
) {
  if (!value) {
    return 'Flexible time'
  }

  const [
    hour = '00',
    minute = '00',
  ] = value.split(':')

  return `${hour}:${minute}`
}

function scoreLabel(
  score: number,
) {
  if (score >= 85) {
    return 'Ready to perform'
  }

  if (score >= 70) {
    return 'Good readiness'
  }

  if (score >= 50) {
    return 'Train with control'
  }

  return 'Prioritise recovery'
}

export function DashboardOverview({
  data,
}: {
  data: DashboardData
}) {
  const metrics =
    data.todayMetrics

  const firstName =
    getFirstName(
      data.profile.fullName,
      data.userEmail,
    )

  const goal =
    data.fitness.goal
      ? goalLabels[
          data.fitness.goal
        ] ??
        data.fitness.goal.replaceAll(
          '_',
          ' ',
        )
      : 'Goal not set'

  const calorieTarget =
    data.fitness.calorieTarget

  const caloriesConsumed =
    metrics?.caloriesConsumed ??
    null

  const caloriesRemaining =
    calorieTarget !== null &&
    caloriesConsumed !== null
      ? Math.max(
          0,
          calorieTarget -
            caloriesConsumed,
        )
      : null

  const recoveryScore =
    metrics?.recoveryScore ??
    null

  const weeklyAdherence =
    data.weeklyAdherence

  const currentWeight =
    data.weightTrend.at(-1)
      ?.weightKg ??
    data.fitness.currentWeightKg

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.13),transparent_34%),linear-gradient(135deg,#12151a,#0d0f12)] p-5 shadow-[0_25px_90px_rgba(0,0,0,0.32)] sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full border border-amber-300/10" />

        <div className="pointer-events-none absolute -right-4 -top-10 size-44 rounded-full border border-amber-300/[0.07]" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
              <span>
                {formatDashboardDate(
                  data.profile.timezone,
                )}
              </span>

              <span className="size-1 rounded-full bg-zinc-700" />

              <span className="text-amber-300">
                {goal}
              </span>
            </div>

            <h1 className="max-w-3xl text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
              {getGreeting(
                data.profile.timezone,
              )}
              , {firstName}.
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
              Your targets, logs and progress below are loaded from your private Supabase account—not from sample dashboard values.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard/today"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-amber-200"
            >
              <Activity className="size-4" />
              Log today
            </Link>

            <Link
              href="/ai-coach"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
            >
              <Sparkles className="size-4 text-violet-300" />
              Ask AI Coach
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Calories consumed"
          value={caloriesConsumed}
          target={calorieTarget}
          unit="kcal"
          icon={Flame}
          href="/dashboard/nutrition"
          secondary={
            caloriesRemaining === null
              ? undefined
              : caloriesRemaining > 0
                ? `${Math.round(
                    caloriesRemaining,
                  )} kcal remaining`
                : 'Daily target reached'
          }
        />

        <MetricCard
          title="Protein progress"
          value={
            metrics?.proteinConsumedG ??
            null
          }
          target={
            data.fitness.proteinTargetG
          }
          unit="g"
          icon={Utensils}
          href="/dashboard/nutrition"
          fractionDigits={1}
        />

        <MetricCard
          title="Water"
          value={
            metrics?.waterMl ??
            null
          }
          target={
            data.fitness.waterTargetMl
          }
          unit="ml"
          icon={Droplets}
          href="/dashboard/today"
        />

        <MetricCard
          title="Steps"
          value={
            metrics?.steps ??
            null
          }
          target={
            data.fitness.stepTarget
          }
          unit="steps"
          icon={Footprints}
          href="/dashboard/today"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-3xl border border-white/10 bg-[#101216] p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
                Today&apos;s workout
              </p>

              <h2 className="mt-1 text-xl font-black text-white">
                Training execution
              </h2>
            </div>

            <Link
              href="/dashboard/workouts"
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.05]"
            >
              Open workouts
            </Link>
          </div>

          {data.todayWorkouts.length >
          0 ? (
            <div className="space-y-3">
              {data.todayWorkouts.map(
                (workout) => (
                  <div
                    key={workout.id}
                    className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4 sm:flex-row sm:items-center"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                      <Dumbbell className="size-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-white">
                        {workout.title}
                      </h3>

                      <p className="mt-1 text-xs text-zinc-500">
                        {workout.focus ??
                          'General training'}{' '}
                        ·{' '}
                        {formatTime(
                          workout.startTime,
                        )}
                        {workout.durationMinutes
                          ? ` · ${Math.round(
                              workout.durationMinutes,
                            )} min`
                          : ''}
                      </p>
                    </div>

                    <span
                      className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                        workout.status ===
                        'completed'
                          ? 'bg-emerald-400/10 text-emerald-300'
                          : 'bg-white/[0.05] text-zinc-400'
                      }`}
                    >
                      {workout.status.replaceAll(
                        '_',
                        ' ',
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No workout scheduled today"
              description="This card will populate from workout_sessions when Project 09 creates your training plan."
              href="/dashboard/workouts"
              action="Open workouts"
            />
          )}
        </article>

        <article className="rounded-3xl border border-white/10 bg-[#101216] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
                Recovery score
              </p>

              <h2 className="mt-1 text-xl font-black text-white">
                Readiness
              </h2>
            </div>

            <span className="grid size-11 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <CircleGauge className="size-5" />
            </span>
          </div>

          {recoveryScore !== null ? (
            <div className="mt-8">
              <div className="flex items-end gap-2">
                <strong className="text-6xl font-black tracking-[-0.07em] text-white">
                  {Math.round(
                    recoveryScore,
                  )}
                </strong>

                <span className="pb-2 text-sm font-bold text-zinc-600">
                  /100
                </span>
              </div>

              <p className="mt-3 text-sm font-bold text-cyan-200">
                {scoreLabel(
                  recoveryScore,
                )}
              </p>

              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Calculated from today&apos;s sleep, energy, soreness and stress log.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="Recovery data is empty"
              description="Log sleep, energy, soreness and stress to calculate your score."
              href="/dashboard/today"
              action="Complete today's log"
            />
          )}
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <article className="rounded-3xl border border-white/10 bg-[#101216] p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
                Weight trend
              </p>

              <div className="mt-1 flex items-end gap-3">
                <h2 className="text-xl font-black text-white">
                  Last 12 entries
                </h2>

                {currentWeight !== null ? (
                  <span className="pb-0.5 text-sm font-bold text-amber-300">
                    {currentWeight.toFixed(
                      1,
                    )}{' '}
                    kg
                  </span>
                ) : null}
              </div>
            </div>

            <Link
              href="/dashboard/progress"
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.05]"
            >
              View progress
            </Link>
          </div>

          {data.weightTrend.length >=
          2 ? (
            <WeightChart
              data={data.weightTrend}
            />
          ) : (
            <EmptyState
              icon={Scale}
              title="More weight entries needed"
              description="Log at least two dates to display a real trend line."
              href="/dashboard/today"
              action="Log body weight"
            />
          )}
        </article>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <article className="rounded-3xl border border-white/10 bg-[#101216] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
                  Weekly adherence
                </p>

                <h2 className="mt-1 text-xl font-black text-white">
                  Last 7 days
                </h2>
              </div>

              <CheckCircle2 className="size-6 text-emerald-300" />
            </div>

            {weeklyAdherence !==
            null ? (
              <div className="mt-6">
                <div className="flex items-end justify-between gap-3">
                  <strong className="text-4xl font-black text-white">
                    {Math.round(
                      weeklyAdherence,
                    )}
                    %
                  </strong>

                  <span className="text-xs font-bold text-zinc-500">
                    average
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-emerald-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          weeklyAdherence,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm leading-6 text-zinc-500">
                No adherence scores yet. Daily logs will build this weekly average.
              </p>
            )}
          </article>

          <article className="rounded-3xl border border-white/10 bg-[#101216] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
                  Current goal
                </p>

                <h2 className="mt-1 text-xl font-black text-white">
                  {goal}
                </h2>
              </div>

              <Target className="size-6 text-amber-300" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
                <span className="block text-zinc-600">
                  Current
                </span>

                <strong className="mt-1 block text-sm text-zinc-200">
                  {currentWeight !==
                  null
                    ? `${currentWeight.toFixed(
                        1,
                      )} kg`
                    : '—'}
                </strong>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
                <span className="block text-zinc-600">
                  Target
                </span>

                <strong className="mt-1 block text-sm text-zinc-200">
                  {data.fitness
                    .targetWeightKg !==
                  null
                    ? `${data.fitness.targetWeightKg.toFixed(
                        1,
                      )} kg`
                    : '—'}
                </strong>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-[#101216] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-zinc-500">
                Coach message
              </p>

              <h2 className="mt-1 text-xl font-black text-white">
                Latest guidance
              </h2>
            </div>

            <MessageSquareText className="size-6 text-blue-300" />
          </div>

          {data.coachMessage ? (
            <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-blue-400/10 text-blue-300">
                  <Dumbbell className="size-4" />
                </span>

                <div>
                  <p className="text-sm font-bold text-white">
                    {data.coachMessage
                      .senderName ??
                      'Muscle Fitness Coach'}
                  </p>

                  <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600">
                    {
                      data.coachMessage
                        .senderRole
                    }
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-zinc-300">
                {
                  data.coachMessage
                    .body
                }
              </p>

              <Link
                href="/dashboard/messages"
                className="mt-4 inline-flex text-xs font-bold text-blue-300 hover:text-blue-200"
              >
                Open messages
              </Link>
            </div>
          ) : (
            <EmptyState
              icon={
                MessageSquareText
              }
              title="No coach message yet"
              description="The latest coach or system message will appear here once one is sent."
              href="/dashboard/messages"
              action="Open messages"
            />
          )}
        </article>

        <article className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_38%),#111019] p-5 sm:p-6">
          <Bot className="absolute -bottom-6 -right-5 size-36 text-violet-300/[0.06]" />

          <div className="relative">
            <span className="grid size-12 place-items-center rounded-2xl border border-violet-300/20 bg-violet-300/10 text-violet-200">
              <Sparkles className="size-5" />
            </span>

            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.17em] text-violet-300/60">
              AI Coach shortcut
            </p>

            <h2 className="mt-1 max-w-lg text-2xl font-black text-white">
              Ask questions using your goal, targets and latest progress.
            </h2>

            <p className="mt-3 max-w-xl text-sm leading-6 text-violet-100/60">
              The shortcut is ready for Project 13, where tool calling will read authenticated client context instead of guessing.
            </p>

            <Link
              href="/ai-coach"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-200 px-4 py-3 text-sm font-black text-violet-950 transition hover:bg-white"
            >
              Open AI Coach
              <Bot className="size-4" />
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}