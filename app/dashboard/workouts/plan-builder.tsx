"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Dumbbell,
  Loader2,
  Minus,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import { createWorkoutPlanAction } from "./actions";

/* =========================================================
   PUBLIC TYPES
========================================================= */

export type ExerciseDifficulty =
  | "beginner"
  | "intermediate"
  | "advanced";

export type ExerciseLibraryItem = {
  id: string;
  name: string;
  description: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  difficulty: ExerciseDifficulty;
  movementPattern: string;
};

export type PlanBuilderProps = {
  clientId: string;
  exercises: ExerciseLibraryItem[];
};

/* =========================================================
   INTERNAL TYPES
========================================================= */

type BuilderExercise = {
  localId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseOrder: number;
  targetSets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  rir: number | null;
  tempo: string;
  notes: string;
};

type BuilderDay = {
  localId: string;
  dayNumber: number;
  name: string;
  focus: string;
  notes: string;
  restDay: boolean;
  exercises: BuilderExercise[];
};

type Feedback =
  | {
      type: "success";
      message: string;
    }
  | {
      type: "error";
      message: string;
    }
  | null;

/* =========================================================
   STYLES
========================================================= */

const inputClassName = [
  "h-12 w-full rounded-xl",
  "border border-white/10",
  "bg-black/40 px-4",
  "text-sm text-white",
  "outline-none transition",
  "placeholder:text-zinc-700",
  "hover:border-white/20",
  "focus:border-orange-400/70",
  "focus:ring-4",
  "focus:ring-orange-500/10",
  "disabled:cursor-not-allowed",
  "disabled:opacity-50",
].join(" ");

const textareaClassName = [
  "min-h-28 w-full resize-y rounded-xl",
  "border border-white/10",
  "bg-black/40 px-4 py-3",
  "text-sm leading-6 text-white",
  "outline-none transition",
  "placeholder:text-zinc-700",
  "hover:border-white/20",
  "focus:border-orange-400/70",
  "focus:ring-4",
  "focus:ring-orange-500/10",
].join(" ");

/* =========================================================
   HELPERS
========================================================= */

function createLocalId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function createEmptyDay(dayNumber: number): BuilderDay {
  return {
    localId: createLocalId(),
    dayNumber,
    name: `Day ${dayNumber}`,
    focus: "",
    notes: "",
    restDay: false,
    exercises: [],
  };
}

function getDifficultyClasses(
  difficulty: ExerciseDifficulty,
): string {
  switch (difficulty) {
    case "beginner":
      return [
        "border-emerald-500/20",
        "bg-emerald-500/10",
        "text-emerald-300",
      ].join(" ");

    case "advanced":
      return [
        "border-red-500/20",
        "bg-red-500/10",
        "text-red-300",
      ].join(" ");

    default:
      return [
        "border-orange-500/20",
        "bg-orange-500/10",
        "text-orange-300",
      ].join(" ");
  }
}

/* =========================================================
   COMPONENT
========================================================= */

export default function PlanBuilder({
  clientId,
  exercises,
}: PlanBuilderProps) {
  const router = useRouter();

  const [planName, setPlanName] = useState("");
  const [description, setDescription] =
    useState("");
  const [goal, setGoal] = useState("");
  const [weeks, setWeeks] = useState(4);

  const [
    sessionDurationMinutes,
    setSessionDurationMinutes,
  ] = useState(60);

  const [days, setDays] = useState<
    BuilderDay[]
  >(() => [
    createEmptyDay(1),
    createEmptyDay(2),
    createEmptyDay(3),
  ]);

  const [
    selectedDayId,
    setSelectedDayId,
  ] = useState<string | null>(
    days[0]?.localId ?? null,
  );

  const [searchQuery, setSearchQuery] =
    useState("");

  const [muscleFilter, setMuscleFilter] =
    useState("all");

  const [feedback, setFeedback] =
    useState<Feedback>(null);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const selectedDay =
    days.find(
      (day) =>
        day.localId === selectedDayId,
    ) ??
    days[0] ??
    null;

  const muscleOptions = useMemo(() => {
    return Array.from(
      new Set(
        exercises.map(
          (exercise) =>
            exercise.primaryMuscle,
        ),
      ),
    ).sort((first, second) =>
      first.localeCompare(second),
    );
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const query =
      searchQuery.trim().toLowerCase();

    return exercises.filter((exercise) => {
      const matchesMuscle =
        muscleFilter === "all" ||
        exercise.primaryMuscle ===
          muscleFilter;

      if (!matchesMuscle) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        exercise.name,
        exercise.description,
        exercise.primaryMuscle,
        exercise.secondaryMuscles.join(" "),
        exercise.equipment,
        exercise.movementPattern,
        exercise.difficulty,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [
    exercises,
    muscleFilter,
    searchQuery,
  ]);

  const totalExercises = days.reduce(
    (total, day) =>
      total + day.exercises.length,
    0,
  );

  function updateDay(
    dayId: string,
    changes: Partial<BuilderDay>,
  ) {
    setDays((currentDays) =>
      currentDays.map((day) =>
        day.localId === dayId
          ? {
              ...day,
              ...changes,
            }
          : day,
      ),
    );
  }

  function addDay() {
    if (days.length >= 7) {
      setFeedback({
        type: "error",
        message:
          "A workout plan can contain a maximum of seven days.",
      });

      return;
    }

    const newDay = createEmptyDay(
      days.length + 1,
    );

    setDays((currentDays) => [
      ...currentDays,
      newDay,
    ]);

    setSelectedDayId(newDay.localId);
    setFeedback(null);
  }

  function removeDay(dayId: string) {
    if (days.length <= 1) {
      setFeedback({
        type: "error",
        message:
          "A workout plan must contain at least one day.",
      });

      return;
    }

    const remainingDays = days
      .filter(
        (day) =>
          day.localId !== dayId,
      )
      .map((day, index) => ({
        ...day,
        dayNumber: index + 1,
      }));

    setDays(remainingDays);

    if (selectedDayId === dayId) {
      setSelectedDayId(
        remainingDays[0]?.localId ?? null,
      );
    }

    setFeedback(null);
  }

  function addExercise(
    libraryExercise: ExerciseLibraryItem,
  ) {
    if (!selectedDay) {
      setFeedback({
        type: "error",
        message:
          "Select a workout day before adding an exercise.",
      });

      return;
    }

    if (selectedDay.restDay) {
      setFeedback({
        type: "error",
        message:
          "Exercises cannot be added to a recovery day.",
      });

      return;
    }

    const newExercise: BuilderExercise = {
      localId: createLocalId(),
      exerciseId: libraryExercise.id,
      exerciseName:
        libraryExercise.name,
      exerciseOrder:
        selectedDay.exercises.length + 1,
      targetSets: 3,
      repMin: 8,
      repMax: 12,
      restSeconds: 90,
      rir: 2,
      tempo: "",
      notes: "",
    };

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.localId ===
        selectedDay.localId
          ? {
              ...day,
              exercises: [
                ...day.exercises,
                newExercise,
              ],
            }
          : day,
      ),
    );

    setFeedback(null);
  }

  function updateExercise(
    dayId: string,
    exerciseLocalId: string,
    changes: Partial<BuilderExercise>,
  ) {
    setDays((currentDays) =>
      currentDays.map((day) => {
        if (day.localId !== dayId) {
          return day;
        }

        return {
          ...day,

          exercises: day.exercises.map(
            (exercise) =>
              exercise.localId ===
              exerciseLocalId
                ? {
                    ...exercise,
                    ...changes,
                  }
                : exercise,
          ),
        };
      }),
    );
  }

  function removeExercise(
    dayId: string,
    exerciseLocalId: string,
  ) {
    setDays((currentDays) =>
      currentDays.map((day) => {
        if (day.localId !== dayId) {
          return day;
        }

        const remainingExercises =
          day.exercises
            .filter(
              (exercise) =>
                exercise.localId !==
                exerciseLocalId,
            )
            .map((exercise, index) => ({
              ...exercise,
              exerciseOrder: index + 1,
            }));

        return {
          ...day,
          exercises:
            remainingExercises,
        };
      }),
    );
  }

  function validatePlan(): string | null {
    if (planName.trim().length < 2) {
      return "Plan name must contain at least two characters.";
    }

    if (days.length === 0) {
      return "The plan must contain at least one day.";
    }

    for (const day of days) {
      if (day.name.trim().length < 2) {
        return `Day ${day.dayNumber} needs a valid name.`;
      }

      if (
        !day.restDay &&
        day.exercises.length === 0
      ) {
        return `${day.name} does not contain any exercises.`;
      }

      for (const exercise of day.exercises) {
        if (
          exercise.repMax <
          exercise.repMin
        ) {
          return `${exercise.exerciseName}: maximum repetitions cannot be lower than minimum repetitions.`;
        }

        if (exercise.targetSets < 1) {
          return `${exercise.exerciseName}: at least one set is required.`;
        }
      }
    }

    return null;
  }

  async function handleSubmit() {
    const validationError =
      validatePlan();

    if (validationError) {
      setFeedback({
        type: "error",
        message: validationError,
      });

      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result =
        await createWorkoutPlanAction({
          clientId,
          name: planName.trim(),
          description:
            description.trim(),
          goal: goal.trim(),
          weeks,

          daysPerWeek: Math.max(
            1,
            days.filter(
              (day) =>
                !day.restDay,
            ).length,
          ),

          sessionDurationMinutes,

          days: days.map((day) => ({
            dayNumber: day.dayNumber,
            name: day.name.trim(),
            focus: day.focus.trim(),
            notes: day.notes.trim(),
            restDay: day.restDay,

            exercises: day.restDay
              ? []
              : day.exercises.map(
                  (
                    exercise,
                    index,
                  ) => ({
                    exerciseId:
                      exercise.exerciseId,

                    exerciseName:
                      exercise.exerciseName,

                    exerciseOrder:
                      index + 1,

                    targetSets:
                      exercise.targetSets,

                    repMin:
                      exercise.repMin,

                    repMax:
                      exercise.repMax,

                    restSeconds:
                      exercise.restSeconds,

                    rir:
                      exercise.rir,

                    tempo:
                      exercise.tempo.trim(),

                    notes:
                      exercise.notes.trim(),
                  }),
                ),
          })),
        });

      if (!result.success) {
        setFeedback({
          type: "error",
          message: result.message,
        });

        return;
      }

      setFeedback({
        type: "success",
        message: result.message,
      });

      if (result.planId) {
        router.push(
          `/dashboard/workouts/plans/${result.planId}`,
        );
      } else {
        router.push(
          "/dashboard/workouts",
        );
      }

      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create the workout plan.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-6">
        {/* PLAN INFORMATION */}

        <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
            Step 1
          </p>

          <h2 className="mt-2 text-2xl font-black">
            Programme information
          </h2>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <Field
              label="Plan name"
              className="md:col-span-2"
            >
              <input
                value={planName}
                onChange={(event) =>
                  setPlanName(
                    event.target.value,
                  )
                }
                maxLength={120}
                placeholder="12-week hypertrophy programme"
                className={inputClassName}
              />
            </Field>

            <Field label="Primary goal">
              <input
                value={goal}
                onChange={(event) =>
                  setGoal(event.target.value)
                }
                maxLength={500}
                placeholder="Muscle gain"
                className={inputClassName}
              />
            </Field>

            <Field label="Programme weeks">
              <input
                value={weeks}
                onChange={(event) =>
                  setWeeks(
                    Math.max(
                      1,
                      Math.min(
                        52,
                        Number(
                          event.target.value,
                        ) || 1,
                      ),
                    ),
                  )
                }
                type="number"
                min={1}
                max={52}
                className={inputClassName}
              />
            </Field>

            <Field label="Session duration">
              <div className="relative">
                <input
                  value={
                    sessionDurationMinutes
                  }
                  onChange={(event) =>
                    setSessionDurationMinutes(
                      Math.max(
                        15,
                        Math.min(
                          300,
                          Number(
                            event.target.value,
                          ) || 15,
                        ),
                      ),
                    )
                  }
                  type="number"
                  min={15}
                  max={300}
                  className={`${inputClassName} pr-20`}
                />

                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-600">
                  minutes
                </span>
              </div>
            </Field>

            <Field
              label="Description"
              className="md:col-span-2"
            >
              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(
                    event.target.value,
                  )
                }
                maxLength={2000}
                placeholder="Describe the programme structure and progression."
                className={
                  textareaClassName
                }
              />
            </Field>
          </div>
        </section>

        {/* WORKOUT DAYS */}

        <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
                Step 2
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Workout days
              </h2>

              <p className="mt-2 text-sm text-zinc-600">
                Add training and recovery
                days to the programme.
              </p>
            </div>

            <button
              type="button"
              onClick={addDay}
              disabled={days.length >= 7}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-5 text-xs font-black uppercase tracking-wider text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />

              Add day
            </button>
          </div>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {days.map((day) => {
              const isSelected =
                day.localId ===
                selectedDay?.localId;

              return (
                <button
                  key={day.localId}
                  type="button"
                  onClick={() =>
                    setSelectedDayId(
                      day.localId,
                    )
                  }
                  className={`min-w-36 rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? [
                          "border-orange-500/40",
                          "bg-orange-500/10",
                          "text-orange-300",
                        ].join(" ")
                      : [
                          "border-white/10",
                          "bg-black/30",
                          "text-zinc-500",
                          "hover:border-white/20",
                          "hover:text-white",
                        ].join(" ")
                  }`}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider">
                    Day {day.dayNumber}
                  </p>

                  <p className="mt-1 truncate text-sm font-bold">
                    {day.name}
                  </p>

                  <p className="mt-1 text-[10px] text-zinc-600">
                    {day.restDay
                      ? "Recovery"
                      : `${day.exercises.length} exercises`}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedDay ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">
                    Day{" "}
                    {selectedDay.dayNumber}
                  </p>

                  <h3 className="mt-2 text-xl font-black">
                    Configure workout day
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    removeDay(
                      selectedDay.localId,
                    )
                  }
                  disabled={
                    days.length <= 1
                  }
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />

                  Delete day
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="Day name">
                  <input
                    value={selectedDay.name}
                    onChange={(event) =>
                      updateDay(
                        selectedDay.localId,
                        {
                          name:
                            event.target.value,
                        },
                      )
                    }
                    maxLength={120}
                    className={inputClassName}
                  />
                </Field>

                <Field label="Training focus">
                  <input
                    value={
                      selectedDay.focus
                    }
                    onChange={(event) =>
                      updateDay(
                        selectedDay.localId,
                        {
                          focus:
                            event.target.value,
                        },
                      )
                    }
                    maxLength={300}
                    placeholder="Chest, shoulders and triceps"
                    className={inputClassName}
                  />
                </Field>

                <Field
                  label="Day notes"
                  className="md:col-span-2"
                >
                  <textarea
                    value={
                      selectedDay.notes
                    }
                    onChange={(event) =>
                      updateDay(
                        selectedDay.localId,
                        {
                          notes:
                            event.target.value,
                        },
                      )
                    }
                    maxLength={2000}
                    placeholder="Training priorities and coaching notes."
                    className={
                      textareaClassName
                    }
                  />
                </Field>

                <label className="flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-zinc-400 md:col-span-2">
                  <input
                    checked={
                      selectedDay.restDay
                    }
                    onChange={(event) =>
                      updateDay(
                        selectedDay.localId,
                        {
                          restDay:
                            event.target
                              .checked,

                          exercises:
                            event.target
                              .checked
                              ? []
                              : selectedDay.exercises,
                        },
                      )
                    }
                    type="checkbox"
                    className="h-4 w-4 accent-orange-400"
                  />

                  Mark this as a recovery day
                </label>
              </div>

              {!selectedDay.restDay ? (
                <div className="mt-7">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">
                        Selected exercises
                      </p>

                      <h4 className="mt-1 text-lg font-black">
                        Session structure
                      </h4>
                    </div>

                    <span className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-zinc-500">
                      {
                        selectedDay.exercises
                          .length
                      }{" "}
                      exercises
                    </span>
                  </div>

                  {selectedDay.exercises
                    .length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
                      <Dumbbell className="mx-auto h-7 w-7 text-zinc-700" />

                      <p className="mt-3 font-bold text-zinc-500">
                        No exercises selected
                      </p>

                      <p className="mt-1 text-sm text-zinc-700">
                        Add exercises from the
                        library.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      {selectedDay.exercises.map(
                        (exercise) => (
                          <ExerciseEditor
                            key={
                              exercise.localId
                            }
                            exercise={
                              exercise
                            }
                            onChange={(
                              changes,
                            ) =>
                              updateExercise(
                                selectedDay.localId,
                                exercise.localId,
                                changes,
                              )
                            }
                            onRemove={() =>
                              removeExercise(
                                selectedDay.localId,
                                exercise.localId,
                              )
                            }
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-5 py-4">
                  <p className="font-bold text-blue-300">
                    Recovery day
                  </p>

                  <p className="mt-1 text-sm leading-6 text-blue-200/50">
                    Exercises are disabled for
                    recovery days.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>

      {/* EXERCISE LIBRARY */}

      <aside className="self-start xl:sticky xl:top-6">
        <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-400">
            Step 3
          </p>

          <h2 className="mt-2 text-xl font-black">
            Exercise library
          </h2>

          <p className="mt-2 text-xs leading-6 text-zinc-600">
            Select a workout day, then add
            exercises.
          </p>

          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

            <input
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(
                  event.target.value,
                )
              }
              type="search"
              placeholder="Search exercise..."
              className={`${inputClassName} pl-11`}
            />
          </div>

          <div className="relative mt-3">
            <select
              value={muscleFilter}
              onChange={(event) =>
                setMuscleFilter(
                  event.target.value,
                )
              }
              className={`${inputClassName} appearance-none pr-10`}
            >
              <option value="all">
                All muscles
              </option>

              {muscleOptions.map(
                (muscle) => (
                  <option
                    key={muscle}
                    value={muscle}
                  >
                    {muscle}
                  </option>
                ),
              )}
            </select>

            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          </div>

          <div className="mt-5 max-h-[680px] space-y-3 overflow-y-auto pr-1">
            {filteredExercises.map(
              (exercise) => (
                <article
                  key={exercise.id}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-zinc-200">
                        {exercise.name}
                      </p>

                      <p className="mt-1 text-xs text-zinc-600">
                        {
                          exercise.primaryMuscle
                        }{" "}
                        · {exercise.equipment}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${getDifficultyClasses(
                        exercise.difficulty,
                      )}`}
                    >
                      {exercise.difficulty}
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-700">
                    {exercise.description}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      addExercise(exercise)
                    }
                    disabled={
                      !selectedDay ||
                      selectedDay.restDay
                    }
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 text-xs font-black uppercase tracking-wider text-orange-300 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" />

                    Add exercise
                  </button>
                </article>
              ),
            )}

            {filteredExercises.length ===
            0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
                <Search className="mx-auto h-6 w-6 text-zinc-700" />

                <p className="mt-3 text-sm font-bold text-zinc-600">
                  No exercises found
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {/* SAVE PANEL */}

        <section className="mt-5 rounded-3xl border border-white/10 bg-[#0d0d0d] p-5">
          <div className="grid grid-cols-3 gap-2">
            <SummaryValue
              label="Days"
              value={days.length}
            />

            <SummaryValue
              label="Exercises"
              value={totalExercises}
            />

            <SummaryValue
              label="Weeks"
              value={weeks}
            />
          </div>

          {feedback ? (
            <div
              className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 ${
                feedback.type === "success"
                  ? [
                      "border-emerald-500/20",
                      "bg-emerald-500/10",
                      "text-emerald-300",
                    ].join(" ")
                  : [
                      "border-red-500/20",
                      "bg-red-500/10",
                      "text-red-300",
                    ].join(" ")
              }`}
            >
              {feedback.type ===
              "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}

              <p className="text-xs leading-5">
                {feedback.message}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-400 px-6 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />

                Creating plan
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />

                Save workout plan
              </>
            )}
          </button>
        </section>
      </aside>
    </div>
  );
}

/* =========================================================
   FIELD
========================================================= */

type FieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

function Field({
  label,
  children,
  className = "",
}: FieldProps) {
  return (
    <label
      className={`space-y-2 ${className}`}
    >
      <span className="block text-sm font-semibold text-zinc-300">
        {label}
      </span>

      {children}
    </label>
  );
}

/* =========================================================
   SUMMARY VALUE
========================================================= */

type SummaryValueProps = {
  label: string;
  value: number;
};

function SummaryValue({
  label,
  value,
}: SummaryValueProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-center">
      <p className="text-lg font-black">
        {value}
      </p>

      <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-zinc-700">
        {label}
      </p>
    </div>
  );
}

/* =========================================================
   EXERCISE EDITOR
========================================================= */

type ExerciseEditorProps = {
  exercise: BuilderExercise;

  onChange: (
    changes: Partial<BuilderExercise>,
  ) => void;

  onRemove: () => void;
};

function ExerciseEditor({
  exercise,
  onChange,
  onRemove,
}: ExerciseEditorProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-xs font-black text-orange-300">
            {exercise.exerciseOrder}
          </span>

          <div>
            <p className="font-black text-zinc-200">
              {exercise.exerciseName}
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Configure sets and repetitions
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${exercise.exerciseName}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 transition hover:bg-red-500/20"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <NumberField
          label="Sets"
          value={exercise.targetSets}
          minimum={1}
          maximum={20}
          onChange={(value) =>
            onChange({
              targetSets: value,
            })
          }
        />

        <NumberField
          label="Min reps"
          value={exercise.repMin}
          minimum={1}
          maximum={100}
          onChange={(value) =>
            onChange({
              repMin: value,
            })
          }
        />

        <NumberField
          label="Max reps"
          value={exercise.repMax}
          minimum={1}
          maximum={100}
          onChange={(value) =>
            onChange({
              repMax: value,
            })
          }
        />

        <NumberField
          label="Rest"
          value={exercise.restSeconds}
          minimum={0}
          maximum={900}
          step={15}
          onChange={(value) =>
            onChange({
              restSeconds: value,
            })
          }
        />

        <NumberField
          label="RIR"
          value={exercise.rir ?? 0}
          minimum={0}
          maximum={5}
          onChange={(value) =>
            onChange({
              rir: value,
            })
          }
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          value={exercise.tempo}
          onChange={(event) =>
            onChange({
              tempo: event.target.value,
            })
          }
          maxLength={30}
          placeholder="Tempo, e.g. 3-1-1"
          className={inputClassName}
        />

        <input
          value={exercise.notes}
          onChange={(event) =>
            onChange({
              notes: event.target.value,
            })
          }
          maxLength={1000}
          placeholder="Exercise notes"
          className={inputClassName}
        />
      </div>
    </article>
  );
}

/* =========================================================
   NUMBER FIELD
========================================================= */

type NumberFieldProps = {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step?: number;
  onChange: (value: number) => void;
};

function NumberField({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  onChange,
}: NumberFieldProps) {
  function applyValue(nextValue: number) {
    const safeValue = Number.isFinite(
      nextValue,
    )
      ? nextValue
      : minimum;

    onChange(
      Math.max(
        minimum,
        Math.min(maximum, safeValue),
      ),
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-700">
        {label}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            applyValue(value - step)
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-500 transition hover:text-white"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <input
          value={value}
          onChange={(event) =>
            applyValue(
              Number(
                event.target.value,
              ),
            )
          }
          type="number"
          min={minimum}
          max={maximum}
          step={step}
          className="h-8 min-w-0 flex-1 bg-transparent text-center text-sm font-black text-zinc-200 outline-none"
        />

        <button
          type="button"
          onClick={() =>
            applyValue(value + step)
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-500 transition hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}