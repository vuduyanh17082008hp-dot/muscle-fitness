'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Dumbbell,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'

import { createWorkoutPlanAction } from '@/app/dashboard/workouts/actions'
import type { ExerciseLibraryItem } from './types'

type BuilderExercise = {
  localId: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  targetRir: number
  targetRpe: number | null
  restSeconds: number
  tempo: string
  notes: string
}

type BuilderDay = {
  localId: string
  name: string
  scheduledWeekday: number | null
  notes: string
  exercises: BuilderExercise[]
}

type Props = {
  exercises: ExerciseLibraryItem[]
}

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createExercise(
  defaultExerciseId: string,
): BuilderExercise {
  return {
    localId: createLocalId(),
    exerciseId: defaultExerciseId,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    targetRpe: null,
    restSeconds: 120,
    tempo: '',
    notes: '',
  }
}

function createDay(
  defaultExerciseId: string,
  index: number,
): BuilderDay {
  return {
    localId: createLocalId(),
    name: `Training Day ${index + 1}`,
    scheduledWeekday: null,
    notes: '',
    exercises: [createExercise(defaultExerciseId)],
  }
}

const weekdayOptions = [
  { value: '', label: 'Flexible day' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
]

const inputClass =
  'h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[#b58a52]/70'

export function WorkoutPlanBuilder({ exercises }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const firstExerciseId = exercises[0]?.id ?? ''

  const [name, setName] = useState('Muscle Building Plan')
  const [goal, setGoal] = useState('Build muscle and strength')
  const [description, setDescription] = useState('')
  const [allowSubstitution, setAllowSubstitution] = useState(true)

  const [days, setDays] = useState<BuilderDay[]>([
    createDay(firstExerciseId, 0),
  ])

  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  const exerciseLookup = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise])),
    [exercises],
  )

  function updateDay(
    dayId: string,
    updater: (day: BuilderDay) => BuilderDay,
  ) {
    setDays((current) =>
      current.map((day) =>
        day.localId === dayId ? updater(day) : day,
      ),
    )
  }

  function addDay() {
    setDays((current) => [
      ...current,
      createDay(firstExerciseId, current.length),
    ])
  }

  function removeDay(dayId: string) {
    setDays((current) =>
      current.filter((day) => day.localId !== dayId),
    )
  }

  function addExercise(dayId: string) {
    updateDay(dayId, (day) => ({
      ...day,
      exercises: [
        ...day.exercises,
        createExercise(firstExerciseId),
      ],
    }))
  }

  function removeExercise(
    dayId: string,
    exerciseLocalId: string,
  ) {
    updateDay(dayId, (day) => ({
      ...day,
      exercises: day.exercises.filter(
        (exercise) => exercise.localId !== exerciseLocalId,
      ),
    }))
  }

  function updateExercise(
    dayId: string,
    exerciseLocalId: string,
    updater: (exercise: BuilderExercise) => BuilderExercise,
  ) {
    updateDay(dayId, (day) => ({
      ...day,
      exercises: day.exercises.map((exercise) =>
        exercise.localId === exerciseLocalId
          ? updater(exercise)
          : exercise,
      ),
    }))
  }

  function moveExercise(
    dayId: string,
    exerciseIndex: number,
    direction: -1 | 1,
  ) {
    updateDay(dayId, (day) => {
      const destination = exerciseIndex + direction

      if (
        destination < 0 ||
        destination >= day.exercises.length
      ) {
        return day
      }

      const nextExercises = [...day.exercises]
      const [moved] = nextExercises.splice(exerciseIndex, 1)
      nextExercises.splice(destination, 0, moved)

      return {
        ...day,
        exercises: nextExercises,
      }
    })
  }

  function submit() {
    setMessage(null)
    setIsError(false)

    if (exercises.length === 0) {
      setIsError(true)
      setMessage('The exercise library is empty.')
      return
    }

    startTransition(async () => {
      const result = await createWorkoutPlanAction({
        name,
        goal,
        description,
        allowClientSubstitution: allowSubstitution,
        days: days.map((day) => ({
          name: day.name,
          scheduledWeekday: day.scheduledWeekday,
          notes: day.notes,
          exercises: day.exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            sets: exercise.sets,
            repMin: exercise.repMin,
            repMax: exercise.repMax,
            targetRir: exercise.targetRir,
            targetRpe: exercise.targetRpe,
            restSeconds: exercise.restSeconds,
            tempo: exercise.tempo,
            notes: exercise.notes,
          })),
        })),
      })

      if (!result.success) {
        setIsError(true)
        setMessage(result.message)
        return
      }

      setIsError(false)
      setMessage(result.message ?? 'Plan created.')

      if (result.planId) {
        router.push(`/dashboard/workouts/plans/${result.planId}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/30 sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-[#b58a52]/10 p-3 text-[#d7b47f]">
            <Dumbbell className="h-6 w-6" />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b58a52]">
              Program foundation
            </p>
            <h2 className="text-xl font-black text-white">
              Plan information
            </h2>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-300">
              Plan name
            </span>

            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Push Pull Legs"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-zinc-300">
              Goal
            </span>

            <input
              className={inputClass}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Muscle gain"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-zinc-300">
              Description
            </span>

            <textarea
              className="min-h-28 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[#b58a52]/70"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Purpose, schedule and important instructions..."
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 md:col-span-2">
            <input
              type="checkbox"
              checked={allowSubstitution}
              onChange={(event) =>
                setAllowSubstitution(event.target.checked)
              }
              className="h-4 w-4 accent-[#b58a52]"
            />

            <div>
              <p className="text-sm font-bold text-white">
                Allow exercise replacement
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Clients can replace an exercise during a session when
                equipment is unavailable.
              </p>
            </div>
          </label>
        </div>
      </section>

      <div className="space-y-6">
        {days.map((day, dayIndex) => (
          <section
            key={day.localId}
            className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 shadow-2xl shadow-black/30"
          >
            <div className="border-b border-white/10 bg-gradient-to-r from-[#b58a52]/10 to-transparent p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b58a52]">
                    Day {dayIndex + 1}
                  </p>

                  <h2 className="mt-1 text-xl font-black text-white">
                    Workout day
                  </h2>
                </div>

                {days.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDay(day.localId)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 text-sm font-bold text-red-200 transition hover:bg-red-400/15"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove day
                  </button>
                )}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-zinc-300">
                    Day name
                  </span>

                  <input
                    className={inputClass}
                    value={day.name}
                    onChange={(event) =>
                      updateDay(day.localId, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-zinc-300">
                    Scheduled weekday
                  </span>

                  <select
                    className={inputClass}
                    value={day.scheduledWeekday ?? ''}
                    onChange={(event) =>
                      updateDay(day.localId, (current) => ({
                        ...current,
                        scheduledWeekday:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      }))
                    }
                  >
                    {weekdayOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="space-y-4 p-5 sm:p-7">
              {day.exercises.map((exercise, exerciseIndex) => {
                const selectedExercise = exerciseLookup.get(
                  exercise.exerciseId,
                )

                return (
                  <div
                    key={exercise.localId}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">
                            Exercise {exerciseIndex + 1}
                          </p>

                          <p className="mt-1 font-black text-white">
                            {selectedExercise?.name ??
                              'Select exercise'}
                          </p>

                          {selectedExercise && (
                            <p className="mt-1 text-xs text-zinc-500">
                              {selectedExercise.primary_muscle.replaceAll(
                                '_',
                                ' ',
                              )}{' '}
                              • {selectedExercise.equipment}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={exerciseIndex === 0}
                            onClick={() =>
                              moveExercise(
                                day.localId,
                                exerciseIndex,
                                -1,
                              )
                            }
                            className="rounded-lg border border-white/10 p-2 text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            disabled={
                              exerciseIndex ===
                              day.exercises.length - 1
                            }
                            onClick={() =>
                              moveExercise(
                                day.localId,
                                exerciseIndex,
                                1,
                              )
                            }
                            className="rounded-lg border border-white/10 p-2 text-zinc-400 transition hover:bg-white/5 disabled:opacity-30"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>

                          {day.exercises.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                removeExercise(
                                  day.localId,
                                  exercise.localId,
                                )
                              }
                              className="rounded-lg border border-red-400/20 p-2 text-red-300 transition hover:bg-red-400/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <label className="space-y-2">
                        <span className="text-xs font-semibold text-zinc-500">
                          Exercise
                        </span>

                        <select
                          className={inputClass}
                          value={exercise.exerciseId}
                          onChange={(event) =>
                            updateExercise(
                              day.localId,
                              exercise.localId,
                              (current) => ({
                                ...current,
                                exerciseId: event.target.value,
                              }),
                            )
                          }
                        >
                          {exercises.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} —{' '}
                              {item.primary_muscle.replaceAll(
                                '_',
                                ' ',
                              )}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                        <NumberField
                          label="Sets"
                          value={exercise.sets}
                          min={1}
                          max={12}
                          onChange={(value) =>
                            updateExercise(
                              day.localId,
                              exercise.localId,
                              (current) => ({
                                ...current,
                                sets: value,
                              }),
                            )
                          }
                        />

                        <NumberField
                          label="Rep min"
                          value={exercise.repMin}
                          min={1}
                          max={100}
                          onChange={(value) =>
                            updateExercise(
                              day.localId,
                              exercise.localId,
                              (current) => ({
                                ...current,
                                repMin: value,
                              }),
                            )
                          }
                        />

                        <NumberField
                          label="Rep max"
                          value={exercise.repMax}
                          min={1}
                          max={100}
                          onChange={(value) =>
                            updateExercise(
                              day.localId,
                              exercise.localId,
                              (current) => ({
                                ...current,
                                repMax: value,
                              }),
                            )
                          }
                        />

                        <NumberField
                          label="Target RIR"
                          value={exercise.targetRir}
                          min={0}
                          max={10}
                          step={0.5}
                          onChange={(value) =>
                            updateExercise(
                              day.localId,
                              exercise.localId,
                              (current) => ({
                                ...current,
                                targetRir: value,
                              }),
                            )
                          }
                        />

                        <NumberField
                          label="Rest sec"
                          value={exercise.restSeconds}
                          min={15}
                          max={900}
                          step={15}
                          onChange={(value) =>
                            updateExercise(
                              day.localId,
                              exercise.localId,
                              (current) => ({
                                ...current,
                                restSeconds: value,
                              }),
                            )
                          }
                        />

                        <label className="space-y-2">
                          <span className="text-xs font-semibold text-zinc-500">
                            Tempo
                          </span>

                          <input
                            className={inputClass}
                            value={exercise.tempo}
                            onChange={(event) =>
                              updateExercise(
                                day.localId,
                                exercise.localId,
                                (current) => ({
                                  ...current,
                                  tempo: event.target.value,
                                }),
                              )
                            }
                            placeholder="3-1-1"
                          />
                        </label>
                      </div>

                      <textarea
                        value={exercise.notes}
                        onChange={(event) =>
                          updateExercise(
                            day.localId,
                            exercise.localId,
                            (current) => ({
                              ...current,
                              notes: event.target.value,
                            }),
                          )
                        }
                        placeholder="Exercise notes or technique instructions..."
                        className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#b58a52]/70"
                      />
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() => addExercise(day.localId)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-sm font-bold text-zinc-400 transition hover:border-[#b58a52]/50 hover:bg-[#b58a52]/5 hover:text-[#d7b47f]"
              >
                <Plus className="h-4 w-4" />
                Add exercise
              </button>
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={addDay}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#b58a52]/30 bg-[#b58a52]/5 text-sm font-black text-[#d7b47f] transition hover:bg-[#b58a52]/10"
      >
        <Plus className="h-5 w-5" />
        Add training day
      </button>

      {message && (
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 ${
            isError
              ? 'border-red-400/20 bg-red-400/10 text-red-200'
              : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
          }`}
        >
          {isError ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <Check className="mt-0.5 h-5 w-5 shrink-0" />
          )}

          <p className="text-sm font-semibold">{message}</p>
        </div>
      )}

      <div className="sticky bottom-4 z-20 rounded-2xl border border-white/10 bg-black/90 p-3 shadow-2xl shadow-black backdrop-blur-xl">
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#b58a52] px-5 font-black text-black transition hover:bg-[#c9a16c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}

          {isPending ? 'Building plan...' : 'Create workout plan'}
        </button>
      </div>
    </div>
  )
}

type NumberFieldProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold text-zinc-500">
        {label}
      </span>

      <input
        type="number"
        className={inputClass}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) =>
          onChange(
            Math.max(
              min,
              Math.min(max, Number(event.target.value)),
            ),
          )
        }
      />
    </label>
  )
}