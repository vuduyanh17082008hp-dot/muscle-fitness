"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useRouter } from "next/navigation";

import {
  createWorkoutPlanAction,
} from "./actions";

import type {
  ExerciseLibraryItem,
} from "@/lib/workouts/exercise-library";

import {
  buildSplitDays,
  MUSCLE_FOCUS_OPTIONS,
  SPLIT_OPTIONS,
  type MuscleFocus,
  type SplitPreset,
} from "@/lib/workouts/presets";

/* =========================================================
   TYPES
========================================================= */

type BuilderProfile = {
  goal:
    | string
    | null;

  experience:
    | string
    | null;

  trainingDays: number;

  sessionDurationMinutes:
    number;

  trainingLocation:
    | string
    | null;

  availableEquipment:
    string[];

  priorityMuscles:
    string[];

  physicalLimitations:
    | string
    | null;
};

type PlanBuilderProps = {
  clientId: string;

  exercises:
    ExerciseLibraryItem[];

  profile:
    BuilderProfile;

  initialPreset:
    SplitPreset;

  externalTemplateName:
    | string
    | null;
};

type IntensityStyle =
  | "conservative"
  | "moderate"
  | "hard"
  | "very_hard";

type VolumeStyle =
  | "low"
  | "moderate"
  | "high";

type FailureStyle =
  | "rare"
  | "isolation_only"
  | "selected_last_sets";

type ExerciseStyle =
  | "mixed"
  | "machine"
  | "free_weights";

type BuilderExercise = {
  localId: string;

  exerciseId:
    | string
    | null;

  exerciseName: string;

  source:
    "muscle-fitness"
    | "wger";

  sourceUrl:
    | string
    | null;

  targetSets: number;

  repMin: number;

  repMax: number;

  restSeconds: number;

  rir:
    | number
    | null;

  tempo: string;

  notes: string;
};

type BuilderDay = {
  localId: string;

  dayNumber: number;

  name: string;

  focus: MuscleFocus[];

  notes: string;

  exercises:
    BuilderExercise[];
};

type Feedback =
  | {
      type: "error";
      message: string;
    }
  | {
      type: "success";
      message: string;
    }
  | null;

/* =========================================================
   HELPERS
========================================================= */

function localId() {
  return crypto.randomUUID();
}

function normalize(
  value: string,
) {
  return value
    .trim()
    .toLowerCase();
}

function experienceRank(
  value: string,
) {
  if (
    value === "advanced"
  ) {
    return 3;
  }

  if (
    value ===
    "intermediate"
  ) {
    return 2;
  }

  return 1;
}

function muscleSearchTerms(
  muscle: MuscleFocus,
): string[] {
  const map: Record<
    MuscleFocus,
    string[]
  > = {
    Chest: [
      "chest",
      "pector",
      "bench",
    ],

    "Upper Chest": [
      "upper chest",
      "incline",
      "clavicular",
    ],

    "Back Width": [
      "latissimus",
      "lat ",
      "pulldown",
      "pull down",
      "pull-up",
    ],

    "Back Thickness": [
      "upper back",
      "row",
      "rhomboid",
      "trapez",
    ],

    "Side Delts": [
      "side delt",
      "lateral",
      "shoulder abduction",
    ],

    "Rear Delts": [
      "rear delt",
      "posterior delt",
      "reverse",
    ],

    Quads: [
      "quadr",
      "leg press",
      "squat",
      "leg extension",
    ],

    Hamstrings: [
      "hamstring",
      "leg curl",
      "romanian",
    ],

    Glutes: [
      "glute",
      "hip thrust",
    ],

    Biceps: [
      "biceps",
      "curl",
    ],

    Triceps: [
      "triceps",
      "pushdown",
      "pressdown",
      "extension",
    ],

    Calves: [
      "calf",
      "gastro",
      "soleus",
    ],

    Abs: [
      "abdominal",
      "abs",
      "crunch",
    ],
  };

  return map[muscle];
}

function exerciseText(
  exercise:
    ExerciseLibraryItem,
) {
  return normalize(
    [
      exercise.name,
      exercise.description,
      exercise.primaryMuscle,
      ...exercise
        .secondaryMuscles,
      exercise.equipment,
      exercise.movementPattern,
    ].join(" "),
  );
}

function matchesMuscle(
  exercise:
    ExerciseLibraryItem,
  muscle:
    MuscleFocus,
) {
  const text =
    exerciseText(
      exercise,
    );

  return muscleSearchTerms(
    muscle,
  ).some(
    (term) =>
      text.includes(
        normalize(term),
      ),
  );
}

function isIsolation(
  exercise:
    ExerciseLibraryItem,
) {
  const text =
    normalize(
      `${exercise.name} ${exercise.movementPattern}`,
    );

  return [
    "curl",
    "extension",
    "raise",
    "fly",
    "adduction",
    "abduction",
    "crunch",
    "plantar flexion",
  ].some(
    (keyword) =>
      text.includes(
        keyword,
      ),
  );
}

function equipmentAllowed(
  exercise:
    ExerciseLibraryItem,
  profile:
    BuilderProfile,
) {
  if (
    normalize(
      profile.trainingLocation ??
        "",
    ) === "gym"
  ) {
    return true;
  }

  if (
    profile
      .availableEquipment
      .length === 0
  ) {
    return true;
  }

  const equipment =
    normalize(
      exercise.equipment,
    );

  return profile
    .availableEquipment
    .some(
      (available) => {
        const item =
          normalize(
            available,
          );

        return (
          equipment.includes(
            item,
          ) ||
          item.includes(
            equipment,
          )
        );
      },
    );
}

function styleScore(
  exercise:
    ExerciseLibraryItem,
  style:
    ExerciseStyle,
) {
  if (style === "mixed") {
    return 0;
  }

  const text =
    normalize(
      `${exercise.name} ${exercise.equipment}`,
    );

  if (
    style === "machine"
  ) {
    return (
      text.includes(
        "machine",
      ) ||
      text.includes(
        "cable",
      )
    )
      ? 5
      : -2;
  }

  return (
    text.includes(
      "barbell",
    ) ||
    text.includes(
      "dumbbell",
    )
  )
    ? 5
    : -1;
}

function getSets(
  volume:
    VolumeStyle,
  priorityIndex:
    number,
) {
  let sets =
    volume === "low"
      ? 2
      : volume === "high"
        ? 4
        : 3;

  if (
    priorityIndex === 0
  ) {
    sets += 1;
  }

  return Math.min(
    sets,
    5,
  );
}

function getRir(
  intensity:
    IntensityStyle,
  isolation:
    boolean,
) {
  if (
    intensity ===
    "conservative"
  ) {
    return isolation
      ? 2
      : 3;
  }

  if (
    intensity ===
    "moderate"
  ) {
    return isolation
      ? 1
      : 2;
  }

  if (
    intensity === "hard"
  ) {
    return 1;
  }

  return isolation
    ? 0
    : 1;
}

function repRange(
  goal: string,
  isolation:
    boolean,
) {
  const strength =
    normalize(
      goal,
    ).includes(
      "strength",
    );

  if (strength) {
    return isolation
      ? [8, 15]
      : [4, 8];
  }

  return isolation
    ? [10, 20]
    : [6, 12];
}

function getRest(
  isolation:
    boolean,
) {
  return isolation
    ? 90
    : 150;
}

function maxExercises(
  minutes: number,
) {
  if (minutes <= 45) {
    return 4;
  }

  if (minutes <= 60) {
    return 5;
  }

  if (minutes <= 75) {
    return 6;
  }

  if (minutes <= 90) {
    return 7;
  }

  return 8;
}

function failureInstruction(
  style:
    FailureStyle,
  isolation:
    boolean,
) {
  if (
    style === "rare"
  ) {
    return "Stay short of technical failure.";
  }

  if (
    style ===
    "isolation_only"
  ) {
    return isolation
      ? "Final isolation set may approach technical failure."
      : "Keep compound sets short of failure.";
  }

  return isolation
    ? "Final set may reach technical failure."
    : "Only selected final sets may approach 0–1 RIR while technique remains stable.";
}

function makeDays(
  preset:
    SplitPreset,
  trainingDays:
    number,
): BuilderDay[] {
  return buildSplitDays(
    preset,
    trainingDays,
  ).map(
    (
      day,
      index,
    ) => ({
      localId:
        localId(),

      dayNumber:
        index + 1,

      name:
        day.name,

      focus: [
        ...day.muscles,
      ],

      notes: "",

      exercises: [],
    }),
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function PlanBuilder({
  clientId,
  exercises,
  profile,
  initialPreset,
  externalTemplateName,
}: PlanBuilderProps) {
  const router =
    useRouter();

  const [
    split,
    setSplit,
  ] =
    useState<SplitPreset>(
      initialPreset,
    );

  const [
    trainingDays,
    setTrainingDays,
  ] =
    useState(
      profile.trainingDays,
    );

  const [
    planName,
    setPlanName,
  ] =
    useState(
      externalTemplateName
        ? `${externalTemplateName} — adapted`
        : `${
            SPLIT_OPTIONS.find(
              (item) =>
                item.id ===
                initialPreset,
            )?.name ??
            "Workout"
          } Plan`,
    );

  const [
    description,
    setDescription,
  ] =
    useState(
      externalTemplateName
        ? `Adapted from wger community template: ${externalTemplateName}.`
        : "",
    );

  const [
    goal,
    setGoal,
  ] =
    useState(
      profile.goal ??
        "Muscle gain",
    );

  const [
    weeks,
    setWeeks,
  ] =
    useState(8);

  const [
    sessionMinutes,
    setSessionMinutes,
  ] =
    useState(
      profile
        .sessionDurationMinutes,
    );

  const [
    intensity,
    setIntensity,
  ] =
    useState<IntensityStyle>(
      normalize(
        profile.experience ??
          "",
      ) === "beginner"
        ? "moderate"
        : "hard",
    );

  const [
    volume,
    setVolume,
  ] =
    useState<VolumeStyle>(
      "moderate",
    );

  const [
    failureStyle,
    setFailureStyle,
  ] =
    useState<FailureStyle>(
      "isolation_only",
    );

  const [
    exerciseStyle,
    setExerciseStyle,
  ] =
    useState<ExerciseStyle>(
      "mixed",
    );

  const [
    priorities,
    setPriorities,
  ] =
    useState<MuscleFocus[]>(
      profile.priorityMuscles
        .filter(
          (
            item,
          ): item is MuscleFocus =>
            MUSCLE_FOCUS_OPTIONS.includes(
              item as MuscleFocus,
            ),
        )
        .slice(0, 3),
    );

  const [
    days,
    setDays,
  ] =
    useState<BuilderDay[]>(
      () =>
        makeDays(
          initialPreset,
          profile.trainingDays,
        ),
    );

  const [
    selectedDayId,
    setSelectedDayId,
  ] =
    useState(
      days[0]?.localId ??
        null,
    );

  const [
    externalExercises,
    setExternalExercises,
  ] =
    useState<
      ExerciseLibraryItem[]
    >([]);

  const [
    externalLoading,
    setExternalLoading,
  ] =
    useState(true);

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    feedback,
    setFeedback,
  ] =
    useState<Feedback>(
      null,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  /* =======================================================
     LOAD WGER EXERCISES
  ======================================================= */

  useEffect(() => {
    let active =
      true;

    async function load() {
      try {
        const response =
          await fetch(
            "/api/workouts/exercises",
          );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as {
            exercises?:
              ExerciseLibraryItem[];
          };

        if (active) {
          setExternalExercises(
            data.exercises ??
              [],
          );
        }
      } catch (
        error
      ) {
        console.error(
          "[EXTERNAL EXERCISES]",
          error,
        );
      } finally {
        if (active) {
          setExternalLoading(
            false,
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const library =
    useMemo(() => {
      const map =
        new Map<
          string,
          ExerciseLibraryItem
        >();

      /*
       * External first:
       * wger gets preference when names match.
       */
      for (
        const exercise of [
          ...externalExercises,
          ...exercises,
        ]
      ) {
        const key =
          normalize(
            exercise.name,
          );

        if (!map.has(key)) {
          map.set(
            key,
            exercise,
          );
        }
      }

      return Array.from(
        map.values(),
      );
    }, [
      exercises,
      externalExercises,
    ]);

  const selectedDay =
    days.find(
      (day) =>
        day.localId ===
        selectedDayId,
    ) ??
    days[0] ??
    null;

  const filteredLibrary =
    useMemo(() => {
      const query =
        normalize(search);

      if (!query) {
        return library.slice(
          0,
          80,
        );
      }

      return library
        .filter(
          (exercise) =>
            exerciseText(
              exercise,
            ).includes(
              query,
            ),
        )
        .slice(
          0,
          80,
        );
    }, [
      library,
      search,
    ]);

  /* =======================================================
     SPLIT
  ======================================================= */

  function applySplit(
    next:
      SplitPreset,
  ) {
    setSplit(next);

    const nextDays =
      makeDays(
        next,
        trainingDays,
      );

    setDays(
      nextDays,
    );

    setSelectedDayId(
      nextDays[0]
        ?.localId ??
        null,
    );

    setPlanName(
      `${SPLIT_OPTIONS.find(
        (item) =>
          item.id === next,
      )?.name ?? "Workout"} Plan`,
    );
  }

  function changeTrainingDays(
    next: number,
  ) {
    setTrainingDays(
      next,
    );

    const nextDays =
      makeDays(
        split,
        next,
      );

    setDays(
      nextDays,
    );

    setSelectedDayId(
      nextDays[0]
        ?.localId ??
        null,
    );
  }

  /* =======================================================
     PRIORITIES
  ======================================================= */

  function togglePriority(
    muscle:
      MuscleFocus,
  ) {
    setPriorities(
      (current) => {
        if (
          current.includes(
            muscle,
          )
        ) {
          return current.filter(
            (item) =>
              item !==
              muscle,
          );
        }

        if (
          current.length >= 3
        ) {
          return current;
        }

        return [
          ...current,
          muscle,
        ];
      },
    );
  }

  /* =======================================================
     CUSTOM DAY
  ======================================================= */

  function toggleDayFocus(
    dayId: string,
    muscle:
      MuscleFocus,
  ) {
    setDays(
      (current) =>
        current.map(
          (day) => {
            if (
              day.localId !==
              dayId
            ) {
              return day;
            }

            return {
              ...day,

              focus:
                day.focus.includes(
                  muscle,
                )
                  ? day.focus.filter(
                      (
                        item,
                      ) =>
                        item !==
                        muscle,
                    )
                  : [
                      ...day.focus,
                      muscle,
                    ],
            };
          },
        ),
    );
  }

  function updateDayName(
    dayId: string,
    name: string,
  ) {
    setDays(
      (current) =>
        current.map(
          (day) =>
            day.localId ===
            dayId
              ? {
                  ...day,
                  name,
                }
              : day,
        ),
    );
  }

  /* =======================================================
     EXERCISE SELECTION
  ======================================================= */

  function exerciseScore(
    exercise:
      ExerciseLibraryItem,
    muscle:
      MuscleFocus,
  ) {
    if (
      !matchesMuscle(
        exercise,
        muscle,
      )
    ) {
      return -999;
    }

    if (
      !equipmentAllowed(
        exercise,
        profile,
      )
    ) {
      return -999;
    }

    const clientRank =
      experienceRank(
        normalize(
          profile.experience ??
            "beginner",
        ),
      );

    const exerciseRank =
      experienceRank(
        exercise.difficulty,
      );

    if (
      exerciseRank >
      clientRank + 1
    ) {
      return -999;
    }

    let score = 10;

    if (
      exercise.source ===
      "wger"
    ) {
      score += 2;
    }

    if (
      normalize(
        profile.experience ??
          "",
      ) ===
      "beginner"
    ) {
      if (
        exercise.difficulty ===
        "beginner"
      ) {
        score += 5;
      }

      const equipment =
        normalize(
          exercise.equipment,
        );

      if (
        equipment.includes(
          "machine",
        ) ||
        equipment.includes(
          "cable",
        )
      ) {
        score += 2;
      }
    }

    score +=
      styleScore(
        exercise,
        exerciseStyle,
      );

    return score;
  }

  function makeExercise(
    libraryExercise:
      ExerciseLibraryItem,
    muscle:
      MuscleFocus,
  ): BuilderExercise {
    const isolation =
      isIsolation(
        libraryExercise,
      );

    const priorityIndex =
      priorities.indexOf(
        muscle,
      );

    const [
      repMin,
      repMax,
    ] =
      repRange(
        goal,
        isolation,
      );

    const sourceNote =
      libraryExercise.source ===
      "wger"
        ? `Source: wger${
            libraryExercise.sourceUrl
              ? ` — ${libraryExercise.sourceUrl}`
              : ""
          }`
        : "";

    return {
      localId:
        localId(),

      exerciseId:
        libraryExercise.id,

      exerciseName:
        libraryExercise.name,

      source:
        libraryExercise.source,

      sourceUrl:
        libraryExercise.sourceUrl,

      targetSets:
        getSets(
          volume,
          priorityIndex,
        ),

      repMin,

      repMax,

      restSeconds:
        getRest(
          isolation,
        ),

      rir:
        getRir(
          intensity,
          isolation,
        ),

      tempo:
        isolation
          ? "2-1-2"
          : "2-0-1",

      notes: [
        failureInstruction(
          failureStyle,
          isolation,
        ),

        sourceNote,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  function autoBuild() {
    const maximum =
      maxExercises(
        sessionMinutes,
      );

    const nextDays =
      days.map(
        (day) => {
          const used =
            new Set<string>();

          const selected:
            BuilderExercise[] =
            [];

          const orderedFocus =
            [
              ...day.focus,
            ].sort(
              (a, b) => {
                const ia =
                  priorities.indexOf(
                    a,
                  );

                const ib =
                  priorities.indexOf(
                    b,
                  );

                return (
                  (
                    ia === -1
                      ? 99
                      : ia
                  ) -
                  (
                    ib === -1
                      ? 99
                      : ib
                  )
                );
              },
            );

          for (
            const muscle of orderedFocus
          ) {
            if (
              selected.length >=
              maximum
            ) {
              break;
            }

            const candidate =
              library
                .filter(
                  (exercise) =>
                    !used.has(
                      normalize(
                        exercise.name,
                      ),
                    ),
                )
                .map(
                  (exercise) => ({
                    exercise,

                    score:
                      exerciseScore(
                        exercise,
                        muscle,
                      ),
                  }),
                )
                .filter(
                  (item) =>
                    item.score >
                    -999,
                )
                .sort(
                  (a, b) =>
                    b.score -
                    a.score,
                )[0]
                ?.exercise;

            if (!candidate) {
              continue;
            }

            used.add(
              normalize(
                candidate.name,
              ),
            );

            selected.push(
              makeExercise(
                candidate,
                muscle,
              ),
            );
          }

          /*
           * Add a second exercise for Priority #1
           * if this day trains it and time allows.
           */

          const primaryPriority =
            priorities[0];

          if (
            primaryPriority &&
            day.focus.includes(
              primaryPriority,
            ) &&
            selected.length <
              maximum
          ) {
            const second =
              library
                .filter(
                  (exercise) =>
                    !used.has(
                      normalize(
                        exercise.name,
                      ),
                    ),
                )
                .map(
                  (exercise) => ({
                    exercise,

                    score:
                      exerciseScore(
                        exercise,
                        primaryPriority,
                      ),
                  }),
                )
                .filter(
                  (item) =>
                    item.score >
                    -999,
                )
                .sort(
                  (a, b) =>
                    b.score -
                    a.score,
                )[0]
                ?.exercise;

            if (second) {
              selected.splice(
                1,
                0,
                makeExercise(
                  second,
                  primaryPriority,
                ),
              );
            }
          }

          return {
            ...day,

            exercises:
              selected.slice(
                0,
                maximum,
              ),
          };
        },
      );

    setDays(
      nextDays,
    );

    setFeedback({
      type: "success",

      message:
        "Workout sessions were generated from your split, profile, priorities and training style.",
    });
  }

  function addManualExercise(
    exercise:
      ExerciseLibraryItem,
  ) {
    if (!selectedDay) {
      return;
    }

    const target =
      selectedDay
        .focus[0] ??
      "Chest";

    setDays(
      (current) =>
        current.map(
          (day) =>
            day.localId ===
            selectedDay.localId
              ? {
                  ...day,

                  exercises: [
                    ...day.exercises,

                    makeExercise(
                      exercise,
                      target,
                    ),
                  ],
                }
              : day,
        ),
    );
  }

  function removeExercise(
    dayId: string,
    exerciseId: string,
  ) {
    setDays(
      (current) =>
        current.map(
          (day) =>
            day.localId ===
            dayId
              ? {
                  ...day,

                  exercises:
                    day.exercises.filter(
                      (
                        exercise,
                      ) =>
                        exercise.localId !==
                        exerciseId,
                    ),
                }
              : day,
        ),
    );
  }

  function updateExercise(
    dayId: string,
    localExerciseId: string,
    changes:
      Partial<BuilderExercise>,
  ) {
    setDays(
      (current) =>
        current.map(
          (day) =>
            day.localId ===
            dayId
              ? {
                  ...day,

                  exercises:
                    day.exercises.map(
                      (
                        exercise,
                      ) =>
                        exercise.localId ===
                        localExerciseId
                          ? {
                              ...exercise,
                              ...changes,
                            }
                          : exercise,
                    ),
                }
              : day,
        ),
    );
  }

  /* =======================================================
     SAVE
  ======================================================= */

  async function savePlan() {
    if (
      planName.trim().length <
      2
    ) {
      setFeedback({
        type: "error",
        message:
          "Enter a valid plan name.",
      });

      return;
    }

    if (
      days.some(
        (day) =>
          day.focus.length ===
          0,
      )
    ) {
      setFeedback({
        type: "error",
        message:
          "Every workout day needs at least one training focus.",
      });

      return;
    }

    if (
      days.some(
        (day) =>
          day.exercises.length ===
          0,
      )
    ) {
      setFeedback({
        type: "error",
        message:
          "Generate or manually add exercises before saving.",
      });

      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const result =
        await createWorkoutPlanAction({
          clientId,

          name:
            planName.trim(),

          description:
            description.trim(),

          goal:
            goal.trim(),

          weeks,

          daysPerWeek:
            days.length,

          sessionDurationMinutes:
            sessionMinutes,

          days:
            days.map(
              (
                day,
              ) => ({
                dayNumber:
                  day.dayNumber,

                name:
                  day.name.trim(),

                focus:
                  day.focus.join(
                    ", ",
                  ),

                notes:
                  day.notes,

                restDay:
                  false,

                exercises:
                  day.exercises.map(
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
                        exercise.tempo,

                      notes:
                        exercise.notes,
                    }),
                  ),
              }),
            ),
        });

      if (!result.success) {
        throw new Error(
          result.message,
        );
      }

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
            : "Unable to save workout plan.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="space-y-8">
      {/* ===================================================
          SPLIT
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-400">
          Step 1
        </p>

        <h2 className="mt-2 text-2xl font-black">
          Choose your split
        </h2>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {SPLIT_OPTIONS.map(
            (option) => {
              const selected =
                option.id ===
                split;

              return (
                <button
                  key={
                    option.id
                  }
                  type="button"
                  onClick={() =>
                    applySplit(
                      option.id,
                    )
                  }
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <strong>
                      {
                        option.name
                      }
                    </strong>

                    {selected && (
                      <Check className="h-4 w-4 text-amber-400" />
                    )}
                  </div>

                  <p className="mt-2 text-xs leading-5 text-zinc-600">
                    {
                      option.description
                    }
                  </p>
                </button>
              );
            },
          )}
        </div>
      </section>

      {/* ===================================================
          PROGRAM SETTINGS
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-400">
          Step 2
        </p>

        <h2 className="mt-2 text-2xl font-black">
          Programme settings
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field
            label="Plan name"
          >
            <input
              value={
                planName
              }
              onChange={(
                event,
              ) =>
                setPlanName(
                  event
                    .target
                    .value,
                )
              }
              className={
                inputClasses
              }
            />
          </Field>

          <Field
            label="Goal"
          >
            <input
              value={
                goal
              }
              onChange={(
                event,
              ) =>
                setGoal(
                  event
                    .target
                    .value,
                )
              }
              className={
                inputClasses
              }
            />
          </Field>

          <Field
            label="Training days"
          >
            <select
              value={
                trainingDays
              }
              onChange={(
                event,
              ) =>
                changeTrainingDays(
                  Number(
                    event
                      .target
                      .value,
                  ),
                )
              }
              className={
                inputClasses
              }
            >
              {[2,3,4,5,6,7].map(
                (number) => (
                  <option
                    key={
                      number
                    }
                    value={
                      number
                    }
                  >
                    {number} days
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field
            label="Session"
          >
            <select
              value={
                sessionMinutes
              }
              onChange={(
                event,
              ) =>
                setSessionMinutes(
                  Number(
                    event
                      .target
                      .value,
                  ),
                )
              }
              className={
                inputClasses
              }
            >
              {[45,60,75,90,120].map(
                (number) => (
                  <option
                    key={
                      number
                    }
                    value={
                      number
                    }
                  >
                    {number} min
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field
            label="Intensity"
          >
            <select
              value={
                intensity
              }
              onChange={(
                event,
              ) =>
                setIntensity(
                  event
                    .target
                    .value as IntensityStyle,
                )
              }
              className={
                inputClasses
              }
            >
              <option value="conservative">
                Conservative
              </option>

              <option value="moderate">
                Moderate
              </option>

              <option value="hard">
                Hard
              </option>

              <option value="very_hard">
                Very Hard
              </option>
            </select>
          </Field>

          <Field
            label="Volume"
          >
            <select
              value={
                volume
              }
              onChange={(
                event,
              ) =>
                setVolume(
                  event
                    .target
                    .value as VolumeStyle,
                )
              }
              className={
                inputClasses
              }
            >
              <option value="low">
                Low
              </option>

              <option value="moderate">
                Moderate
              </option>

              <option value="high">
                High
              </option>
            </select>
          </Field>

          <Field
            label="Failure use"
          >
            <select
              value={
                failureStyle
              }
              onChange={(
                event,
              ) =>
                setFailureStyle(
                  event
                    .target
                    .value as FailureStyle,
                )
              }
              className={
                inputClasses
              }
            >
              <option value="rare">
                Rare
              </option>

              <option value="isolation_only">
                Isolation only
              </option>

              <option value="selected_last_sets">
                Selected last sets
              </option>
            </select>
          </Field>

          <Field
            label="Exercise style"
          >
            <select
              value={
                exerciseStyle
              }
              onChange={(
                event,
              ) =>
                setExerciseStyle(
                  event
                    .target
                    .value as ExerciseStyle,
                )
              }
              className={
                inputClasses
              }
            >
              <option value="mixed">
                Mixed
              </option>

              <option value="machine">
                Machine / Cable
              </option>

              <option value="free_weights">
                Free weights
              </option>
            </select>
          </Field>
        </div>
      </section>

      {/* ===================================================
          PRIORITY
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-400">
          Step 3
        </p>

        <h2 className="mt-2 text-2xl font-black">
          Muscle priorities
        </h2>

        <p className="mt-2 text-sm text-zinc-600">
          Select up to three.
          Priority #1 receives the
          strongest exercise-order and
          volume emphasis.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {MUSCLE_FOCUS_OPTIONS.map(
            (muscle) => {
              const index =
                priorities.indexOf(
                  muscle,
                );

              return (
                <button
                  key={
                    muscle
                  }
                  type="button"
                  onClick={() =>
                    togglePriority(
                      muscle,
                    )
                  }
                  className={`rounded-full border px-4 py-2 text-xs font-bold transition ${
                    index >= 0
                      ? "border-amber-400 bg-amber-400 text-black"
                      : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {index >= 0 &&
                    `#${index + 1} `}

                  {muscle}
                </button>
              );
            },
          )}
        </div>
      </section>

      {/* ===================================================
          DAYS
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-400">
              Step 4
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Workout days
            </h2>
          </div>

          <button
            type="button"
            onClick={
              autoBuild
            }
            disabled={
              library.length ===
              0
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-black transition hover:bg-amber-300"
          >
            <Sparkles className="h-4 w-4" />

            Auto-build exercises
          </button>
        </div>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {days.map(
            (day) => (
              <button
                key={
                  day.localId
                }
                onClick={() =>
                  setSelectedDayId(
                    day.localId,
                  )
                }
                className={`min-w-40 rounded-xl border p-3 text-left ${
                  selectedDay?.localId ===
                  day.localId
                    ? "border-amber-400 bg-amber-400/10"
                    : "border-white/10 bg-black/20"
                }`}
              >
                <p className="text-[10px] font-black uppercase text-zinc-600">
                  Day{" "}
                  {
                    day.dayNumber
                  }
                </p>

                <p className="mt-1 truncate text-sm font-bold">
                  {
                    day.name
                  }
                </p>

                <p className="mt-1 text-[10px] text-zinc-700">
                  {
                    day.exercises
                      .length
                  }{" "}
                  exercises
                </p>
              </button>
            ),
          )}
        </div>

        {selectedDay && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
            <input
              value={
                selectedDay.name
              }
              onChange={(
                event,
              ) =>
                updateDayName(
                  selectedDay.localId,
                  event
                    .target
                    .value,
                )
              }
              className="w-full bg-transparent text-xl font-black outline-none"
            />

            <p className="mt-5 text-xs font-black uppercase tracking-wider text-zinc-600">
              Training focus
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {MUSCLE_FOCUS_OPTIONS.map(
                (muscle) => (
                  <button
                    key={
                      muscle
                    }
                    type="button"
                    onClick={() =>
                      toggleDayFocus(
                        selectedDay.localId,
                        muscle,
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      selectedDay.focus.includes(
                        muscle,
                      )
                        ? "border-amber-400 bg-amber-400 text-black"
                        : "border-white/10 text-zinc-500"
                    }`}
                  >
                    {
                      muscle
                    }
                  </button>
                ),
              )}
            </div>

            <div className="mt-6 space-y-3">
              {selectedDay.exercises.map(
                (
                  exercise,
                ) => (
                  <div
                    key={
                      exercise.localId
                    }
                    className="rounded-xl border border-white/10 bg-[#101010] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>
                            {
                              exercise.exerciseName
                            }
                          </strong>

                          {exercise.source ===
                            "wger" && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase text-emerald-400">
                              wger
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeExercise(
                            selectedDay.localId,
                            exercise.localId,
                          )
                        }
                        className="text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <NumberField
                        label="Sets"
                        value={
                          exercise.targetSets
                        }
                        onChange={(
                          value,
                        ) =>
                          updateExercise(
                            selectedDay.localId,
                            exercise.localId,
                            {
                              targetSets:
                                value,
                            },
                          )
                        }
                      />

                      <NumberField
                        label="Min reps"
                        value={
                          exercise.repMin
                        }
                        onChange={(
                          value,
                        ) =>
                          updateExercise(
                            selectedDay.localId,
                            exercise.localId,
                            {
                              repMin:
                                value,
                            },
                          )
                        }
                      />

                      <NumberField
                        label="Max reps"
                        value={
                          exercise.repMax
                        }
                        onChange={(
                          value,
                        ) =>
                          updateExercise(
                            selectedDay.localId,
                            exercise.localId,
                            {
                              repMax:
                                value,
                            },
                          )
                        }
                      />

                      <NumberField
                        label="Rest"
                        value={
                          exercise.restSeconds
                        }
                        onChange={(
                          value,
                        ) =>
                          updateExercise(
                            selectedDay.localId,
                            exercise.localId,
                            {
                              restSeconds:
                                value,
                            },
                          )
                        }
                      />

                      <NumberField
                        label="RIR"
                        value={
                          exercise.rir ??
                          0
                        }
                        onChange={(
                          value,
                        ) =>
                          updateExercise(
                            selectedDay.localId,
                            exercise.localId,
                            {
                              rir:
                                value,
                            },
                          )
                        }
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </section>

      {/* ===================================================
          LIBRARY
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-400">
              Exercise library
            </p>

            <h2 className="mt-2 text-xl font-black">
              Add or replace exercises
            </h2>
          </div>

          <p className="text-xs text-zinc-600">
            {externalLoading
              ? "Loading wger…"
              : `${externalExercises.length} external exercises loaded`}
          </p>
        </div>

        <div className="relative mt-5">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

          <input
            value={
              search
            }
            onChange={(
              event,
            ) =>
              setSearch(
                event
                  .target
                  .value,
              )
            }
            placeholder="Search exercises..."
            className={`${inputClasses} pl-11`}
          />
        </div>

        <div className="mt-4 grid max-h-96 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
          {filteredLibrary.map(
            (
              exercise,
              index,
            ) => (
              <button
                key={`${exercise.source}-${exercise.name}-${index}`}
                type="button"
                onClick={() =>
                  addManualExercise(
                    exercise,
                  )
                }
                className="rounded-xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-amber-400/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">
                    {
                      exercise.name
                    }
                  </strong>

                  <Plus className="h-4 w-4 text-amber-400" />
                </div>

                <p className="mt-2 text-xs text-zinc-600">
                  {
                    exercise.primaryMuscle
                  }{" "}
                  ·{" "}
                  {
                    exercise.equipment
                  }
                </p>

                {exercise.source ===
                  "wger" && (
                  <p className="mt-2 text-[10px] font-black uppercase text-emerald-400">
                    wger source
                  </p>
                )}
              </button>
            ),
          )}
        </div>
      </section>

      {/* ===================================================
          DESCRIPTION
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6">
        <div className="grid gap-4 md:grid-cols-[160px_1fr]">
          <Field
            label="Weeks"
          >
            <input
              type="number"
              value={
                weeks
              }
              min={1}
              max={52}
              onChange={(
                event,
              ) =>
                setWeeks(
                  Number(
                    event
                      .target
                      .value,
                  ),
                )
              }
              className={
                inputClasses
              }
            />
          </Field>

          <Field
            label="Notes / description"
          >
            <textarea
              value={
                description
              }
              onChange={(
                event,
              ) =>
                setDescription(
                  event
                    .target
                    .value,
                )
              }
              className="min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-4 text-sm outline-none focus:border-amber-400/50"
            />
          </Field>
        </div>
      </section>

      {/* ===================================================
          WARNING
      =================================================== */}

      {profile.physicalLimitations && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />

          <div>
            <strong>
              Physical limitations
            </strong>

            <p className="mt-1 text-amber-200/70">
              {
                profile.physicalLimitations
              }
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            feedback.type ===
            "error"
              ? "border-red-500/20 bg-red-500/5 text-red-300"
              : "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
          }`}
        >
          {
            feedback.message
          }
        </div>
      )}

      {/* ===================================================
          SAVE
      =================================================== */}

      <button
        type="button"
        disabled={
          submitting
        }
        onClick={() =>
          void savePlan()
        }
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-amber-400 px-6 py-5 font-black uppercase tracking-wider text-black transition hover:bg-amber-300 disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />

            Saving plan
          </>
        ) : (
          <>
            <Save className="h-5 w-5" />

            Save Workout Plan

            <ChevronRight className="h-5 w-5" />
          </>
        )}
      </button>
    </div>
  );
}

/* =========================================================
   UI HELPERS
========================================================= */

const inputClasses =
  "h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-400/50";

function Field({
  label,
  children,
}: {
  label: string;
  children:
    React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-600">
        {label}
      </span>

      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;

  value: number;

  onChange:
    (value: number) =>
      void;
}) {
  return (
    <label>
      <span className="text-[9px] font-black uppercase text-zinc-700">
        {label}
      </span>

      <input
        value={
          value
        }
        type="number"
        min={0}
        onChange={(
          event,
        ) =>
          onChange(
            Number(
              event
                .target
                .value,
            ),
          )
        }
        className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm outline-none"
      />
    </label>
  );
}