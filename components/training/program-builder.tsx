"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  RefreshCcw,
  Settings2,
  Sparkles,
} from "lucide-react";

import {
  DEFAULT_TRAINING_PREFERENCES,
  MUSCLE_GROUPS,
} from "@/lib/training/types";

import type {
  ClientTrainingProfile,
  CustomSplitDay,
  ExternalExercise,
  GeneratedProgram,
  MuscleGroup,
  TrainingPreferences,
  TrainingSplit,
} from "@/lib/training/types";

import {
  generateTrainingProgram,
} from "@/lib/training/program-engine";

/* =========================================================
   TYPES
========================================================= */

type ProgramBuilderProps = {
  profile: ClientTrainingProfile;

  initialPreferences:
    | TrainingPreferences
    | null;

  initialProgram:
    | GeneratedProgram
    | null;
};

/* =========================================================
   SPLIT OPTIONS
========================================================= */

const SPLITS: {
  id: TrainingSplit;
  name: string;
  description: string;
}[] = [
  {
    id: "auto",
    name: "Recommended",
    description:
      "Muscle Fitness selects a split based on your available training days.",
  },

  {
    id: "full_body",
    name: "Full Body",
    description:
      "Train the whole body multiple times per week.",
  },

  {
    id: "upper_lower",
    name: "Upper / Lower",
    description:
      "Alternate upper-body and lower-body sessions.",
  },

  {
    id: "push_pull_legs",
    name: "Push / Pull / Legs",
    description:
      "Separate pushing muscles, pulling muscles and legs.",
  },

  {
    id: "ppl_upper_lower",
    name: "PPL + Upper / Lower",
    description:
      "Hybrid five-day training structure.",
  },

  {
    id: "arnold",
    name: "Arnold Split",
    description:
      "Chest + Back, Shoulders + Arms, and Legs.",
  },

  {
    id: "torso_limbs",
    name: "Torso / Limbs",
    description:
      "Alternate torso-focused and limb-focused sessions.",
  },

  {
    id: "body_part",
    name: "Body-Part Split",
    description:
      "Dedicated sessions for individual muscle groups.",
  },

  {
    id: "custom",
    name: "Custom Split",
    description:
      "Create your own training days and choose exactly what each day trains.",
  },
];

/* =========================================================
   HELPERS
========================================================= */

function makeCustomDays(
  count: number
): CustomSplitDay[] {
  return Array.from(
    {
      length: count,
    },
    (_, index) => ({
      name: `Day ${index + 1}`,
      muscles: [],
    })
  );
}

function mergeInitialPreferences(
  profile: ClientTrainingProfile,
  initial:
    | TrainingPreferences
    | null
): TrainingPreferences {
  if (initial) {
    return initial;
  }

  const profilePriorities =
    profile.priorityMuscles
      .filter(
        (
          item
        ): item is MuscleGroup =>
          MUSCLE_GROUPS.includes(
            item as MuscleGroup
          )
      )
      .slice(0, 3);

  return {
    ...DEFAULT_TRAINING_PREFERENCES,

    trainingDays:
      Math.min(
        Math.max(
          profile.trainingDays || 3,
          2
        ),
        7
      ),

    targetSessionMinutes:
      profile.sessionDurationMinutes ||
      60,

    priorityMuscles:
      profilePriorities,
  };
}

/* =========================================================
   PROGRAM BUILDER
========================================================= */

export default function ProgramBuilder({
  profile,
  initialPreferences,
  initialProgram,
}: ProgramBuilderProps) {
  const [
    preferences,
    setPreferences,
  ] =
    useState<TrainingPreferences>(
      () =>
        mergeInitialPreferences(
          profile,
          initialPreferences
        )
    );

  const [
    program,
    setProgram,
  ] =
    useState<
      GeneratedProgram | null
    >(initialProgram);

  const [
    mode,
    setMode,
  ] =
    useState<
      "builder" | "program"
    >(
      initialProgram
        ? "program"
        : "builder"
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    sourceWarning,
    setSourceWarning,
  ] =
    useState<
      string | null
    >(null);

  /* =======================================================
     NORMALIZE CUSTOM SPLIT DAYS
  ======================================================= */

  const customDays =
    useMemo(() => {
      if (
        preferences.customSplit
          .length ===
        preferences.trainingDays
      ) {
        return preferences.customSplit;
      }

      const next =
        makeCustomDays(
          preferences.trainingDays
        );

      preferences.customSplit
        .slice(
          0,
          preferences.trainingDays
        )
        .forEach(
          (
            day,
            index
          ) => {
            next[index] =
              day;
          }
        );

      return next;
    }, [
      preferences.customSplit,
      preferences.trainingDays,
    ]);

  /* =======================================================
     PRIORITY MUSCLES
  ======================================================= */

  function togglePriority(
    muscle: MuscleGroup
  ) {
    setPreferences(
      (previous) => {
        const exists =
          previous
            .priorityMuscles
            .includes(
              muscle
            );

        if (exists) {
          return {
            ...previous,

            priorityMuscles:
              previous
                .priorityMuscles
                .filter(
                  (item) =>
                    item !== muscle
                ),
          };
        }

        if (
          previous
            .priorityMuscles
            .length >= 3
        ) {
          return previous;
        }

        return {
          ...previous,

          priorityMuscles: [
            ...previous
              .priorityMuscles,
            muscle,
          ],
        };
      }
    );
  }

  /* =======================================================
     CUSTOM SPLIT MUSCLE TOGGLE
  ======================================================= */

  function toggleCustomMuscle(
    dayIndex: number,
    muscle: MuscleGroup
  ) {
    const next =
      customDays.map(
        (day) => ({
          ...day,

          muscles: [
            ...day.muscles,
          ],
        })
      );

    const day =
      next[dayIndex];

    if (!day) {
      return;
    }

    const exists =
      day.muscles.includes(
        muscle
      );

    day.muscles =
      exists
        ? day.muscles.filter(
            (item) =>
              item !== muscle
          )
        : [
            ...day.muscles,
            muscle,
          ];

    setPreferences(
      (previous) => ({
        ...previous,

        customSplit:
          next,
      })
    );
  }

  /* =======================================================
     CHANGE CUSTOM DAY NAME
  ======================================================= */

  function changeCustomDayName(
    dayIndex: number,
    name: string
  ) {
    const next =
      customDays.map(
        (day) => ({
          ...day,

          muscles: [
            ...day.muscles,
          ],
        })
      );

    const day =
      next[dayIndex];

    if (!day) {
      return;
    }

    day.name =
      name;

    setPreferences(
      (previous) => ({
        ...previous,

        customSplit:
          next,
      })
    );
  }

  /* =======================================================
     GENERATE PROGRAM
  ======================================================= */

  async function generateProgram() {
    if (loading) {
      return;
    }

    setLoading(true);

    setError(null);

    setSourceWarning(null);

    try {
      /* ---------------------------------------------------
         VALIDATE CUSTOM SPLIT
      --------------------------------------------------- */

      if (
        preferences.splitType ===
        "custom"
      ) {
        const invalidDay =
          customDays.find(
            (day) =>
              day.muscles.length ===
              0
          );

        if (invalidDay) {
          throw new Error(
            "Every custom training day must contain at least one muscle group."
          );
        }
      }

      /* ---------------------------------------------------
         LOAD WGER
      --------------------------------------------------- */

      let externalExercises:
        ExternalExercise[] =
        [];

      try {
        const response =
          await fetch(
            "/api/training/exercises",
            {
              method: "GET",

              cache:
                "no-store",
            }
          );

        if (response.ok) {
          const data =
            (await response.json()) as {
              exercises?:
                ExternalExercise[];
            };

          externalExercises =
            data.exercises ??
            [];

          if (
            externalExercises.length ===
            0
          ) {
            setSourceWarning(
              "No external exercises were returned. Muscle Fitness fallback exercises were used."
            );
          }
        } else {
          setSourceWarning(
            "wger is currently unavailable. Muscle Fitness fallback exercises were used."
          );
        }
      } catch (
        sourceError
      ) {
        console.error(
          "[TRAINING SOURCE ERROR]",
          sourceError
        );

        setSourceWarning(
          "External exercise data could not be reached. Muscle Fitness fallback exercises were used."
        );
      }

      /* ---------------------------------------------------
         FINAL SETTINGS
      --------------------------------------------------- */

      const finalPreferences:
        TrainingPreferences =
        {
          ...preferences,

          customSplit:
            preferences.splitType ===
            "custom"
              ? customDays
              : preferences
                  .customSplit,
        };

      /* ---------------------------------------------------
         LOCAL PROGRAM ENGINE
      --------------------------------------------------- */

      const generated =
        generateTrainingProgram(
          profile,
          finalPreferences,
          externalExercises
        );

      /* ---------------------------------------------------
         SAVE TO SUPABASE
      --------------------------------------------------- */

      const saveResponse =
        await fetch(
          "/api/training/preferences",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                preferences:
                  finalPreferences,

                generatedProgram:
                  generated,
              }),
          }
        );

      if (
        !saveResponse.ok
      ) {
        let message =
          "Unable to save training program.";

        try {
          const data =
            (await saveResponse.json()) as {
              error?: string;
            };

          if (
            data.error
          ) {
            message =
              data.error;
          }
        } catch {
          // keep fallback message
        }

        throw new Error(
          message
        );
      }

      setPreferences(
        finalPreferences
      );

      setProgram(
        generated
      );

      setMode(
        "program"
      );
    } catch (
      caught: unknown
    ) {
      console.error(
        "[PROGRAM BUILDER]",
        caught
      );

      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to generate training program."
      );
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     PROGRAM VIEW
  ======================================================= */

  if (
    mode === "program" &&
    program
  ) {
    return (
      <ProgramView
        program={
          program
        }
        sourceWarning={
          sourceWarning
        }
        loading={
          loading
        }
        onEdit={() => {
          setMode(
            "builder"
          );
        }}
        onRegenerate={() => {
          void generateProgram();
        }}
      />
    );
  }

  /* =======================================================
     BUILDER VIEW
  ======================================================= */

  return (
    <div className="space-y-8">
      {/* ===================================================
          PROFILE SUMMARY
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />

          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-500">
            Client Profile
          </p>
        </div>

        <h2 className="mt-3 text-2xl font-bold">
          Training foundation
        </h2>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ProfileMetric
            label="Goal"
            value={
              profile.goal ??
              "General Fitness"
            }
          />

          <ProfileMetric
            label="Experience"
            value={
              profile.experience ??
              "Beginner"
            }
          />

          <ProfileMetric
            label="Available days"
            value={`${profile.trainingDays} / week`}
          />

          <ProfileMetric
            label="Location"
            value={
              profile.trainingLocation ??
              "Not provided"
            }
          />
        </div>

        {profile.physicalLimitations && (
          <div className="mt-5 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-amber-500">
              Physical limitations
            </p>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {
                profile.physicalLimitations
              }
            </p>
          </div>
        )}
      </section>

      {/* ===================================================
          STEP 1 — SPLIT
      =================================================== */}

      <BuilderSection
        number="01"
        title="Choose your split"
        description="Choose the structure you want. Muscle Fitness will build exercises inside your selected split."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SPLITS.map(
            (split) => {
              const selected =
                preferences.splitType ===
                split.id;

              return (
                <button
                  key={
                    split.id
                  }
                  type="button"
                  onClick={() => {
                    setPreferences(
                      (
                        previous
                      ) => ({
                        ...previous,

                        splitType:
                          split.id,

                        customSplit:
                          split.id ===
                          "custom"
                            ? customDays
                            : previous
                                .customSplit,
                      })
                    );
                  }}
                  className={`rounded-2xl border p-5 text-left transition ${
                    selected
                      ? "border-amber-500 bg-amber-500/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/3"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-white">
                      {
                        split.name
                      }
                    </h3>

                    {selected && (
                      <Check className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                  </div>

                  <p className="mt-3 text-sm leading-6 text-zinc-500">
                    {
                      split.description
                    }
                  </p>
                </button>
              );
            }
          )}
        </div>
      </BuilderSection>

      {/* ===================================================
          STEP 2 — SCHEDULE
      =================================================== */}

      <BuilderSection
        number="02"
        title="Schedule"
        description="Set your weekly frequency and realistic session duration."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <SelectField
            label="Training days"
            value={String(
              preferences.trainingDays
            )}
            onChange={(
              value
            ) => {
              setPreferences(
                (
                  previous
                ) => ({
                  ...previous,

                  trainingDays:
                    Number(
                      value
                    ),
                })
              );
            }}
            options={[
              [
                "2",
                "2 days / week",
              ],

              [
                "3",
                "3 days / week",
              ],

              [
                "4",
                "4 days / week",
              ],

              [
                "5",
                "5 days / week",
              ],

              [
                "6",
                "6 days / week",
              ],

              [
                "7",
                "7 days / week",
              ],
            ]}
          />

          <SelectField
            label="Session duration"
            value={String(
              preferences
                .targetSessionMinutes
            )}
            onChange={(
              value
            ) => {
              setPreferences(
                (
                  previous
                ) => ({
                  ...previous,

                  targetSessionMinutes:
                    Number(
                      value
                    ),
                })
              );
            }}
            options={[
              [
                "45",
                "45 minutes",
              ],

              [
                "60",
                "60 minutes",
              ],

              [
                "75",
                "75 minutes",
              ],

              [
                "90",
                "90 minutes",
              ],

              [
                "120",
                "120 minutes",
              ],
            ]}
          />
        </div>
      </BuilderSection>

      {/* ===================================================
          CUSTOM SPLIT
      =================================================== */}

      {preferences.splitType ===
        "custom" && (
        <BuilderSection
          number="03"
          title="Build your custom split"
          description="Choose exactly which muscle groups belong to each training day."
        >
          <div className="space-y-4">
            {customDays.map(
              (
                day,
                dayIndex
              ) => (
                <div
                  key={
                    dayIndex
                  }
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-black">
                      {dayIndex +
                        1}
                    </span>

                    <input
                      value={
                        day.name
                      }
                      onChange={(
                        event
                      ) => {
                        changeCustomDayName(
                          dayIndex,
                          event
                            .target
                            .value
                        );
                      }}
                      placeholder={`Day ${
                        dayIndex +
                        1
                      }`}
                      className="w-full bg-transparent text-lg font-bold text-white outline-none placeholder:text-zinc-700"
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {MUSCLE_GROUPS.map(
                      (
                        muscle
                      ) => {
                        const active =
                          day.muscles.includes(
                            muscle
                          );

                        return (
                          <button
                            key={
                              muscle
                            }
                            type="button"
                            onClick={() => {
                              toggleCustomMuscle(
                                dayIndex,
                                muscle
                              );
                            }}
                            className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                              active
                                ? "border-amber-500 bg-amber-500 text-black"
                                : "border-white/10 bg-white/3 text-zinc-400 hover:border-white/20 hover:text-white"
                            }`}
                          >
                            {
                              muscle
                            }
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </BuilderSection>
      )}

      {/* ===================================================
          PRIORITIES
      =================================================== */}

      <BuilderSection
        number={
          preferences.splitType ===
          "custom"
            ? "04"
            : "03"
        }
        title="Muscle priorities"
        description="Choose up to three muscles. Priority #1 receives the strongest exercise-order and volume emphasis."
      >
        {preferences
          .priorityMuscles
          .length > 0 && (
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            {preferences
              .priorityMuscles
              .map(
                (
                  muscle,
                  index
                ) => (
                  <div
                    key={
                      muscle
                    }
                    className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                      Priority #
                      {index + 1}
                    </p>

                    <p className="mt-2 font-bold text-white">
                      {
                        muscle
                      }
                    </p>
                  </div>
                )
              )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map(
            (muscle) => {
              const index =
                preferences
                  .priorityMuscles
                  .indexOf(
                    muscle
                  );

              return (
                <button
                  key={
                    muscle
                  }
                  type="button"
                  onClick={() => {
                    togglePriority(
                      muscle
                    );
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    index >= 0
                      ? "border-amber-500 bg-amber-500 text-black"
                      : "border-white/10 bg-white/3 text-zinc-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {index >= 0 &&
                    `#${index + 1} `}

                  {muscle}
                </button>
              );
            }
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-600">
          {
            preferences
              .priorityMuscles
              .length
          }
          /3 priorities selected
        </p>
      </BuilderSection>

      {/* ===================================================
          TRAINING STYLE
      =================================================== */}

      <BuilderSection
        number={
          preferences.splitType ===
          "custom"
            ? "05"
            : "04"
        }
        title="Training style"
        description="Control effort, volume, failure usage and exercise-selection bias."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <SelectField
            label="Intensity"
            value={
              preferences
                .intensityStyle
            }
            onChange={(
              value
            ) => {
              setPreferences(
                (
                  previous
                ) => ({
                  ...previous,

                  intensityStyle:
                    value as TrainingPreferences["intensityStyle"],
                })
              );
            }}
            options={[
              [
                "conservative",
                "Conservative — more RIR",
              ],

              [
                "moderate",
                "Moderate",
              ],

              [
                "hard",
                "Hard — close to failure",
              ],

              [
                "very_hard",
                "Very Hard",
              ],
            ]}
          />

          <SelectField
            label="Volume"
            value={
              preferences
                .volumeStyle
            }
            onChange={(
              value
            ) => {
              setPreferences(
                (
                  previous
                ) => ({
                  ...previous,

                  volumeStyle:
                    value as TrainingPreferences["volumeStyle"],
                })
              );
            }}
            options={[
              [
                "low",
                "Low volume",
              ],

              [
                "moderate",
                "Moderate volume",
              ],

              [
                "high",
                "High volume",
              ],
            ]}
          />

          <SelectField
            label="Failure use"
            value={
              preferences
                .failureStyle
            }
            onChange={(
              value
            ) => {
              setPreferences(
                (
                  previous
                ) => ({
                  ...previous,

                  failureStyle:
                    value as TrainingPreferences["failureStyle"],
                })
              );
            }}
            options={[
              [
                "rare",
                "Rare",
              ],

              [
                "isolation_only",
                "Isolation exercises only",
              ],

              [
                "selected_last_sets",
                "Selected last sets",
              ],
            ]}
          />

          <SelectField
            label="Exercise preference"
            value={
              preferences
                .exerciseStyle
            }
            onChange={(
              value
            ) => {
              setPreferences(
                (
                  previous
                ) => ({
                  ...previous,

                  exerciseStyle:
                    value as TrainingPreferences["exerciseStyle"],
                })
              );
            }}
            options={[
              [
                "mixed",
                "Mixed",
              ],

              [
                "machine",
                "Machine / Cable dominant",
              ],

              [
                "free_weights",
                "Free-weight dominant",
              ],
            ]}
          />
        </div>
      </BuilderSection>

      {/* ===================================================
          EXCLUSIONS
      =================================================== */}

      <BuilderSection
        number={
          preferences.splitType ===
          "custom"
            ? "06"
            : "05"
        }
        title="Exercise exclusions"
        description="Optional. Enter exercises that you do not want Muscle Fitness to select."
      >
        <textarea
          value={
            preferences
              .excludedExercises
              .join(", ")
          }
          onChange={(
            event
          ) => {
            setPreferences(
              (
                previous
              ) => ({
                ...previous,

                excludedExercises:
                  event
                    .target
                    .value
                    .split(",")
                    .map(
                      (
                        item
                      ) =>
                        item.trim()
                    )
                    .filter(
                      Boolean
                    ),
              })
            );
          }}
          placeholder="Example: Barbell Back Squat, Conventional Deadlift, Bench Press..."
          className="min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-500/50"
        />
      </BuilderSection>

      {/* ===================================================
          CURRENT CONFIGURATION
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-600">
          Program configuration
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <ConfigurationBadge
            text={
              SPLITS.find(
                (split) =>
                  split.id ===
                  preferences
                    .splitType
              )?.name ??
              preferences.splitType
            }
          />

          <ConfigurationBadge
            text={`${preferences.trainingDays} days`}
          />

          <ConfigurationBadge
            text={`${preferences.targetSessionMinutes} min`}
          />

          <ConfigurationBadge
            text={
              preferences
                .intensityStyle
            }
          />

          <ConfigurationBadge
            text={`${preferences.volumeStyle} volume`}
          />
        </div>
      </section>

      {/* ===================================================
          ERROR
      =================================================== */}

      {error && (
        <div className="flex gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm leading-6 text-red-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

          <div>
            <p className="font-bold">
              Unable to generate program
            </p>

            <p className="mt-1 text-red-300/80">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* ===================================================
          GENERATE BUTTON
      =================================================== */}

      <button
        type="button"
        disabled={
          loading
        }
        onClick={() => {
          void generateProgram();
        }}
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-amber-500 px-6 py-5 font-black uppercase tracking-wider text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />

            Building your program
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />

            Generate Personalized Program

            <ChevronRight className="h-5 w-5" />
          </>
        )}
      </button>
    </div>
  );
}

/* =========================================================
   PROGRAM VIEW
========================================================= */

function ProgramView({
  program,
  sourceWarning,
  onEdit,
  onRegenerate,
  loading,
}: {
  program: GeneratedProgram;

  sourceWarning:
    | string
    | null;

  onEdit: () => void;

  onRegenerate: () => void;

  loading: boolean;
}) {
  return (
    <div className="space-y-8">
      {/* ===================================================
          PROGRAM HEADER
      =================================================== */}

      <section className="rounded-3xl border border-white/10 bg-linear-to-br from-[#171717] via-[#0d0d0d] to-black p-7 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />

              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-500">
                Personalized Program
              </p>
            </div>

            <h2 className="mt-3 text-3xl font-black uppercase text-white sm:text-4xl">
              Your Training Plan
            </h2>

            <p className="mt-3 text-sm capitalize text-zinc-500">
              {program.trainingDays}
              {" days · "}

              {
                program.sessionMinutes
              }
              {" min · "}

              {
                program.intensityStyle
              }
              {" intensity · "}

              {
                program.volumeStyle
              }
              {" volume"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={
                onEdit
              }
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/8 hover:text-white"
            >
              <Settings2 className="h-4 w-4" />

              Edit settings
            </button>

            <button
              type="button"
              onClick={
                onRegenerate
              }
              disabled={
                loading
              }
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}

              Regenerate
            </button>
          </div>
        </div>

        {/* PRIORITIES */}

        {program
          .priorityMuscles
          .length >
          0 && (
          <div className="mt-7">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
              Priority muscles
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {program
                .priorityMuscles
                .map(
                  (
                    muscle,
                    index
                  ) => (
                    <span
                      key={
                        muscle
                      }
                      className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-400"
                    >
                      #
                      {index + 1}
                      {" "}
                      {
                        muscle
                      }
                    </span>
                  )
                )}
            </div>
          </div>
        )}
      </section>

      {/* ===================================================
          SOURCE INFORMATION
      =================================================== */}

      <section className="rounded-2xl border border-white/10 bg-white/3 p-5 text-sm leading-6 text-zinc-500">
        {program.externalSourceUsed ? (
          <p>
            External exercise
            database:
            {" "}

            <strong className="text-zinc-300">
              wger
            </strong>

            {" · "}

            {
              program.externalExerciseCount
            }
            {" "}

            exercise selections
            were sourced from
            external open exercise
            data.
          </p>
        ) : (
          <p>
            External exercise data
            was unavailable for this
            generation. Muscle Fitness
            fallback exercises were
            used.
          </p>
        )}

        {sourceWarning && (
          <div className="mt-3 flex gap-2 text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

            <p>
              {
                sourceWarning
              }
            </p>
          </div>
        )}
      </section>

      {/* ===================================================
          TRAINING DAYS
      =================================================== */}

      <div className="space-y-7">
        {program.days.map(
          (day) => (
            <section
              key={
                day.day
              }
              className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d]"
            >
              {/* DAY HEADER */}

              <header className="border-b border-white/8 bg-white/3 p-6 sm:p-7">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-500">
                  Day{" "}
                  {
                    day.day
                  }
                </p>

                <h3 className="mt-2 text-2xl font-black uppercase text-white">
                  {
                    day.title
                  }
                </h3>

                <p className="mt-2 text-sm text-zinc-500">
                  {day.focus.join(
                    " · "
                  )}
                </p>
              </header>

              {/* EXERCISES */}

              {day.exercises.length ===
              0 ? (
                <div className="p-6 text-sm text-zinc-500">
                  No suitable
                  exercise could be
                  selected for this
                  session.
                </div>
              ) : (
                <div className="divide-y divide-white/8">
                  {day.exercises.map(
                    (
                      exercise,
                      index
                    ) => (
                      <article
                        key={`${day.day}-${exercise.id}-${index}`}
                        className="p-6 sm:p-7"
                      >
                        <div className="flex items-start gap-4">
                          {/* NUMBER */}

                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-sm font-black text-black">
                            {String(
                              index +
                                1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </span>

                          {/* CONTENT */}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-lg font-bold text-white sm:text-xl">
                                {
                                  exercise.name
                                }
                              </h4>

                              {exercise.source ===
                                "wger" && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                                  wger
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-sm font-semibold text-amber-500">
                              {
                                exercise.targetMuscle
                              }
                            </p>

                            {/* METRICS */}

                            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <Metric
                                label="Sets"
                                value={String(
                                  exercise.sets
                                )}
                              />

                              <Metric
                                label="Reps"
                                value={
                                  exercise.reps
                                }
                              />

                              <Metric
                                label="RIR"
                                value={
                                  exercise.rir
                                }
                              />

                              <Metric
                                label="Rest"
                                value={
                                  exercise.rest
                                }
                              />
                            </div>

                            {/* WHY + FAILURE */}

                            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                              <InfoBox
                                title="Why this exercise?"
                                text={
                                  exercise.exerciseReason
                                }
                              />

                              <InfoBox
                                title="Failure instruction"
                                text={
                                  exercise.failureInstruction
                                }
                              />
                            </div>

                            {/* MUSCLES */}

                            {exercise
                              .secondaryMuscles
                              .length >
                              0 && (
                              <div className="mt-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
                                  Secondary
                                  muscles
                                </p>

                                <p className="mt-1 text-xs text-zinc-500">
                                  {exercise.secondaryMuscles.join(
                                    " · "
                                  )}
                                </p>
                              </div>
                            )}

                            {/* SOURCE */}

                            {exercise.sourceUrl && (
                              <a
                                href={
                                  exercise.sourceUrl
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="mt-4 inline-flex text-xs font-semibold text-zinc-600 transition hover:text-amber-500"
                              >
                                Source /
                                licence
                                information
                                →
                              </a>
                            )}
                          </div>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </section>
          )
        )}
      </div>

      {/* ===================================================
          TRAINING RULES
      =================================================== */}

      <section className="grid gap-4 md:grid-cols-3">
        <InfoBox
          title="Progression"
          text="When you reach the top of the prescribed rep range across your working sets at the target RIR with stable technique, increase load conservatively."
        />

        <InfoBox
          title="Execution"
          text="Use controlled repetitions, repeatable range of motion and stable technique before increasing load."
        />

        <InfoBox
          title="Fatigue"
          text="If performance declines repeatedly or joints become irritated, reduce load, sets or proximity to failure."
        />
      </section>

      {/* ===================================================
          BACK TO SETTINGS
      =================================================== */}

      <button
        type="button"
        onClick={
          onEdit
        }
        className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />

        Edit training
        configuration
      </button>
    </div>
  );
}

/* =========================================================
   BUILDER SECTION
========================================================= */

function BuilderSection({
  number,
  title,
  description,
  children,
}: {
  number: string;

  title: string;

  description: string;

  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0d0d0d] p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-500">
        {number}
      </p>

      <h2 className="mt-2 text-2xl font-bold text-white">
        {title}
      </h2>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
        {description}
      </p>

      <div className="mt-6">
        {children}
      </div>
    </section>
  );
}

/* =========================================================
   PROFILE METRIC
========================================================= */

function ProfileMetric({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold capitalize text-white">
        {value}
      </p>
    </div>
  );
}

/* =========================================================
   SELECT FIELD
========================================================= */

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;

  value: string;

  onChange:
    (
      value: string
    ) => void;

  options:
    [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </span>

      <select
        value={
          value
        }
        onChange={(
          event
        ) => {
          onChange(
            event.target.value
          );
        }}
        className="h-12 w-full rounded-xl border border-white/10 bg-black px-4 text-sm text-white outline-none transition focus:border-amber-500/50"
      >
        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={
                optionValue
              }
              value={
                optionValue
              }
            >
              {
                optionLabel
              }
            </option>
          )
        )}
      </select>
    </label>
  );
}

/* =========================================================
   METRIC
========================================================= */

function Metric({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
        {label}
      </p>

      <p className="mt-2 text-sm font-bold text-white">
        {value}
      </p>
    </div>
  );
}

/* =========================================================
   INFO BOX
========================================================= */

function InfoBox({
  title,
  text,
}: {
  title: string;

  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
        {title}
      </p>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {text}
      </p>
    </div>
  );
}

/* =========================================================
   CONFIGURATION BADGE
========================================================= */

function ConfigurationBadge({
  text,
}: {
  text: string;
}) {
  return (
    <span className="rounded-full border border-white/10 bg-white/3 px-3 py-1.5 text-xs font-semibold capitalize text-zinc-400">
      {text}
    </span>
  );
}