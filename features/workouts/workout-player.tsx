'use client'

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Dumbbell,
  History,
  LoaderCircle,
  Pause,
  Play,
  RefreshCcw,
  SkipForward,
  TimerReset,
  Trophy,
} from 'lucide-react'

import {
  finishWorkoutAction,
  replaceSessionExerciseAction,
  saveWorkoutSetAction,
  skipSessionExerciseAction,
} from '@/app/dashboard/workouts/actions'
import type {
  WorkoutPlayerExercise,
  WorkoutPlayerSet,
  WorkoutReplacementOption,
} from './types'

type Props = {
  sessionId: string
  sessionName: string
  startedAt: string | null
  allowSubstitution: boolean
  initialExercises: WorkoutPlayerExercise[]
  replacementOptions: WorkoutReplacementOption[]
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(
    remainingSeconds,
  ).padStart(2, '0')}`
}

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

export function WorkoutPlayer({
  sessionId,
  sessionName,
  startedAt,
  allowSubstitution,
  initialExercises,
  replacementOptions,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [exercises, setExercises] =
    useState<WorkoutPlayerExercise[]>(initialExercises)

  const [restSeconds, setRestSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)

  const [sessionRpe, setSessionRpe] = useState<number | null>(null)
  const [sessionNotes, setSessionNotes] = useState('')

  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!timerRunning || restSeconds <= 0) {
      if (restSeconds <= 0) {
        setTimerRunning(false)
      }

      return
    }

    const timer = window.setInterval(() => {
      setRestSeconds((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [timerRunning, restSeconds])

  const progress = useMemo(() => {
    const activeSets = exercises
      .filter((exercise) => !exercise.isSkipped)
      .flatMap((exercise) => exercise.sets)

    const completedSets = activeSets.filter(
      (set) => set.completed,
    ).length

    return {
      total: activeSets.length,
      completed: completedSets,
      percent:
        activeSets.length === 0
          ? 0
          : Math.round(
              (completedSets / activeSets.length) * 100,
            ),
    }
  }, [exercises])

  function updateSetLocally(
    exerciseId: string,
    setId: string,
    updater: (set: WorkoutPlayerSet) => WorkoutPlayerSet,
  ) {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? updater(set) : set,
              ),
            },
      ),
    )
  }

  function saveSet(
    exercise: WorkoutPlayerExercise,
    set: WorkoutPlayerSet,
    completed: boolean,
  ) {
    const nextSet = {
      ...set,
      completed,
    }

    if (
      completed &&
      (nextSet.reps === null || nextSet.reps < 0)
    ) {
      setIsError(true)
      setMessage('Enter repetitions before completing the set.')
      return
    }

    updateSetLocally(exercise.id, set.id, () => nextSet)
    setMessage(null)

    startTransition(async () => {
      const result = await saveWorkoutSetAction({
        setId: nextSet.id,
        weightKg: nextSet.weightKg,
        reps: nextSet.reps,
        rir: nextSet.rir,
        rpe: nextSet.rpe,
        completed: nextSet.completed,
        notes: '',
      })

      if (!result.success) {
        updateSetLocally(exercise.id, set.id, () => set)

        setIsError(true)
        setMessage(result.message)
        return
      }

      if (completed) {
        setRestSeconds(exercise.restSeconds)
        setTimerRunning(true)
      }

      setIsError(false)
      setMessage('Set saved.')
    })
  }

  function skipExercise(exercise: WorkoutPlayerExercise) {
    const nextSkipped = !exercise.isSkipped

    setExercises((current) =>
      current.map((item) =>
        item.id === exercise.id
          ? {
              ...item,
              isSkipped: nextSkipped,
            }
          : item,
      ),
    )

    startTransition(async () => {
      const result = await skipSessionExerciseAction(
        exercise.id,
        nextSkipped,
      )

      if (!result.success) {
        setExercises((current) =>
          current.map((item) =>
            item.id === exercise.id
              ? {
                  ...item,
                  isSkipped: exercise.isSkipped,
                }
              : item,
          ),
        )

        setIsError(true)
        setMessage(result.message)
        return
      }

      setIsError(false)
      setMessage(
        nextSkipped
          ? 'Exercise skipped.'
          : 'Exercise restored.',
      )
    })
  }

  function replaceExercise(
    exercise: WorkoutPlayerExercise,
    replacementExerciseId: string,
  ) {
    if (
      !replacementExerciseId ||
      replacementExerciseId === exercise.exerciseId
    ) {
      return
    }

    startTransition(async () => {
      const result = await replaceSessionExerciseAction({
        sessionExerciseId: exercise.id,
        replacementExerciseId,
      })

      if (!result.success) {
        setIsError(true)
        setMessage(result.message)
        return
      }

      setIsError(false)
      setMessage(result.message ?? 'Exercise replaced.')
      router.refresh()
    })
  }

  function finishWorkout() {
    startTransition(async () => {
      const result = await finishWorkoutAction({
        sessionId,
        sessionRpe,
        notes: sessionNotes,
      })

      if (!result.success) {
        setIsError(true)
        setMessage(result.message)
        return
      }

      router.push('/dashboard/workouts/history')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 pb-32">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#b58a52]/15 via-zinc-950 to-black p-5 shadow-2xl shadow-black/40 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-[#d7b47f]">
              <Dumbbell className="h-4 w-4" />
              Workout in progress
            </div>

            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {sessionName}
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              Started{' '}
              {startedAt
                ? new Date(startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'now'}
            </p>
          </div>

          <div className="min-w-64 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-zinc-400">
                Session progress
              </span>

              <span className="font-black text-white">
                {progress.completed}/{progress.total}
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-[#b58a52] transition-all duration-300"
                style={{
                  width: `${progress.percent}%`,
                }}
              />
            </div>

            <p className="mt-2 text-right text-xs font-bold text-[#d7b47f]">
              {progress.percent}%
            </p>
          </div>
        </div>
      </header>

      <section className="sticky top-3 z-20 rounded-2xl border border-white/10 bg-black/90 p-3 shadow-2xl shadow-black backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#b58a52]/10 p-2.5 text-[#d7b47f]">
              <Clock3 className="h-5 w-5" />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">
                Rest timer
              </p>

              <p className="text-2xl font-black tabular-nums text-white">
                {formatTimer(restSeconds)}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTimerRunning((current) => !current)}
              disabled={restSeconds <= 0}
              className="rounded-xl border border-white/10 p-3 text-zinc-300 transition hover:bg-white/5 disabled:opacity-30"
            >
              {timerRunning ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setRestSeconds(0)
                setTimerRunning(false)
              }}
              className="rounded-xl border border-white/10 p-3 text-zinc-300 transition hover:bg-white/5"
            >
              <TimerReset className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 ${
            isError
              ? 'border-red-400/20 bg-red-400/10 text-red-200'
              : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          {isError ? (
            <AlertCircle className="h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          )}

          <p className="text-sm font-semibold">{message}</p>
        </div>
      )}

      {exercises.map((exercise, exerciseIndex) => {
        const previousSets = exercise.previous?.sets ?? []

        return (
          <section
            key={exercise.id}
            className={`overflow-hidden rounded-3xl border bg-zinc-950/80 shadow-xl shadow-black/20 ${
              exercise.isSkipped
                ? 'border-zinc-800 opacity-60'
                : 'border-white/10'
            }`}
          >
            <div className="border-b border-white/10 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b58a52]">
                    Exercise {exerciseIndex + 1}
                  </p>

                  <h2 className="mt-2 text-2xl font-black text-white">
                    {exercise.name}
                  </h2>

                  <p className="mt-2 text-sm text-zinc-500">
                    {exercise.targetSets} sets • {exercise.repMin}–
                    {exercise.repMax} reps • RIR{' '}
                    {exercise.targetRir ?? 2} • Rest{' '}
                    {exercise.restSeconds}s
                  </p>

                  {exercise.notes && (
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                      {exercise.notes}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => skipExercise(exercise)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-zinc-400 transition hover:bg-white/5"
                >
                  {exercise.isSkipped ? (
                    <RefreshCcw className="h-4 w-4" />
                  ) : (
                    <SkipForward className="h-4 w-4" />
                  )}

                  {exercise.isSkipped ? 'Restore' : 'Skip'}
                </button>
              </div>

              {allowSubstitution && (
                <label className="mt-5 block max-w-xl space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-600">
                    Replace exercise
                  </span>

                  <select
                    defaultValue=""
                    disabled={isPending}
                    onChange={(event) => {
                      replaceExercise(exercise, event.target.value)
                      event.target.value = ''
                    }}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-300 outline-none focus:border-[#b58a52]/70"
                  >
                    <option value="">Choose replacement...</option>

                    {replacementOptions
                      .filter(
                        (option) =>
                          option.id !== exercise.exerciseId &&
                          option.primaryMuscle ===
                            exercise.primaryMuscle,
                      )
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} — {option.equipment}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            {!exercise.isSkipped && (
              <div className="p-4 sm:p-6">
                {exercise.previous && (
                  <div className="mb-5 rounded-2xl border border-[#b58a52]/15 bg-[#b58a52]/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-black text-[#d7b47f]">
                      <History className="h-4 w-4" />
                      Previous performance
                    </div>

                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(
                        exercise.previous.performed_at,
                      ).toLocaleDateString()}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {previousSets.map((set) => (
                        <span
                          key={set.setNumber}
                          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs font-semibold text-zinc-300"
                        >
                          Set {set.setNumber}:{' '}
                          {set.weightKg ?? 0}kg × {set.reps ?? 0}
                          {set.rir !== null
                            ? ` @ ${set.rir} RIR`
                            : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="hidden grid-cols-[60px_1fr_1fr_1fr_1fr_52px] gap-3 px-3 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-600 sm:grid">
                  <span>Set</span>
                  <span>Weight</span>
                  <span>Reps</span>
                  <span>RIR</span>
                  <span>RPE</span>
                  <span />
                </div>

                <div className="space-y-3">
                  {exercise.sets.map((set) => (
                    <div
                      key={set.id}
                      className={`grid gap-3 rounded-2xl border p-3 sm:grid-cols-[60px_1fr_1fr_1fr_1fr_52px] sm:items-center ${
                        set.completed
                          ? 'border-emerald-400/20 bg-emerald-400/5'
                          : 'border-white/10 bg-black/30'
                      }`}
                    >
                      <div className="flex h-11 items-center justify-center rounded-xl bg-white/5 font-black text-white">
                        {set.setNumber}
                      </div>

                      <SetInput
                        label="Weight kg"
                        value={set.weightKg}
                        step={0.5}
                        onChange={(value) =>
                          updateSetLocally(
                            exercise.id,
                            set.id,
                            (current) => ({
                              ...current,
                              weightKg: value,
                            }),
                          )
                        }
                      />

                      <SetInput
                        label="Reps"
                        value={set.reps}
                        step={1}
                        onChange={(value) =>
                          updateSetLocally(
                            exercise.id,
                            set.id,
                            (current) => ({
                              ...current,
                              reps: value,
                            }),
                          )
                        }
                      />

                      <SetInput
                        label="RIR"
                        value={set.rir}
                        step={0.5}
                        onChange={(value) =>
                          updateSetLocally(
                            exercise.id,
                            set.id,
                            (current) => ({
                              ...current,
                              rir: value,
                            }),
                          )
                        }
                      />

                      <SetInput
                        label="RPE"
                        value={set.rpe}
                        step={0.5}
                        onChange={(value) =>
                          updateSetLocally(
                            exercise.id,
                            set.id,
                            (current) => ({
                              ...current,
                              rpe: value,
                            }),
                          )
                        }
                      />

                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          saveSet(exercise, set, !set.completed)
                        }
                        className={`flex h-11 items-center justify-center rounded-xl border transition ${
                          set.completed
                            ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200'
                            : 'border-white/10 text-zinc-500 hover:border-[#b58a52]/40 hover:bg-[#b58a52]/10 hover:text-[#d7b47f]'
                        }`}
                      >
                        {set.completed ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <span className="h-4 w-4 rounded border border-current" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )
      })}

      <section className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#b58a52]/10 p-2.5 text-[#d7b47f]">
            <Trophy className="h-5 w-5" />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b58a52]">
              Session review
            </p>

            <h2 className="text-xl font-black text-white">
              Finish strong
            </h2>
          </div>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[200px_1fr]">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-400">
              Session RPE
            </span>

            <input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={sessionRpe ?? ''}
              onChange={(event) =>
                setSessionRpe(nullableNumber(event.target.value))
              }
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-white outline-none focus:border-[#b58a52]/70"
              placeholder="1–10"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-400">
              Session notes
            </span>

            <textarea
              value={sessionNotes}
              onChange={(event) =>
                setSessionNotes(event.target.value)
              }
              className="min-h-24 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#b58a52]/70"
              placeholder="Energy, technique, pain, performance or adjustments..."
            />
          </label>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/90 p-3 backdrop-blur-xl lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="hidden min-w-40 sm:block">
            <p className="text-xs text-zinc-500">
              Completed sets
            </p>

            <p className="font-black text-white">
              {progress.completed}/{progress.total}
            </p>
          </div>

          <button
            type="button"
            disabled={isPending || progress.completed === 0}
            onClick={finishWorkout}
            className="flex h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-[#b58a52] px-6 font-black text-black transition hover:bg-[#c9a16c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}

            {isPending ? 'Saving workout...' : 'Complete workout'}
          </button>
        </div>
      </div>
    </div>
  )
}

type SetInputProps = {
  label: string
  value: number | null
  step: number
  onChange: (value: number | null) => void
}

function SetInput({
  label,
  value,
  step,
  onChange,
}: SetInputProps) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600 sm:hidden">
        {label}
      </span>

      <input
        type="number"
        min={0}
        step={step}
        value={value ?? ''}
        onChange={(event) =>
          onChange(nullableNumber(event.target.value))
        }
        className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none focus:border-[#b58a52]/70"
      />
    </label>
  )
}