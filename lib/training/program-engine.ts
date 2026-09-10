import type {
  ClientTrainingProfile,
  CustomSplitDay,
  ExerciseStyle,
  ExternalExercise,
  FailureStyle,
  GeneratedProgram,
  MuscleGroup,
  ProgramDay,
  ProgramExercise,
  TrainingIntensity,
  TrainingPreferences,
  TrainingSplit,
  TrainingVolume,
} from "@/lib/training/types";

/* =========================================================
   FALLBACK DATABASE

   WGER is primary external source.
   These are only used if external data is unavailable or
   cannot provide a suitable movement.
========================================================= */

const FALLBACK_EXERCISES: ExternalExercise[] =
  [
    {
      id: "mf-incline-db-press",

      externalId: null,

      name:
        "Incline Dumbbell Press",

      description:
        "Upper-chest biased dumbbell press.",

      muscles: [
        "pectoralis major",
      ],

      secondaryMuscles: [
        "anterior deltoid",
        "triceps",
      ],

      equipment: [
        "dumbbell",
        "bench",
      ],

      category: "Chest",

      kind: "compound",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-machine-chest-press",

      externalId: null,

      name:
        "Machine Chest Press",

      description:
        "Stable horizontal chest pressing movement.",

      muscles: [
        "pectoralis major",
      ],

      secondaryMuscles: [
        "triceps",
        "anterior deltoid",
      ],

      equipment: [
        "machine",
      ],

      category: "Chest",

      kind: "compound",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-cable-fly",

      externalId: null,

      name:
        "Cable Chest Fly",

      description:
        "Cable chest isolation exercise.",

      muscles: [
        "pectoralis major",
      ],

      secondaryMuscles: [],

      equipment: [
        "cable",
      ],

      category: "Chest",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-lat-pulldown",

      externalId: null,

      name:
        "Lat Pulldown",

      description:
        "Vertical pull emphasizing the lats.",

      muscles: [
        "latissimus dorsi",
      ],

      secondaryMuscles: [
        "biceps",
      ],

      equipment: [
        "cable",
        "machine",
      ],

      category: "Back",

      kind: "compound",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-chest-supported-row",

      externalId: null,

      name:
        "Chest-Supported Row",

      description:
        "Stable horizontal row for upper-back development.",

      muscles: [
        "trapezius",
        "rhomboids",
      ],

      secondaryMuscles: [
        "latissimus dorsi",
        "biceps",
      ],

      equipment: [
        "machine",
        "dumbbell",
        "bench",
      ],

      category: "Back",

      kind: "compound",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-lateral-raise",

      externalId: null,

      name:
        "Cable Lateral Raise",

      description:
        "Side-delt isolation movement.",

      muscles: [
        "lateral deltoid",
      ],

      secondaryMuscles: [],

      equipment: [
        "cable",
      ],

      category: "Shoulders",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-rear-delt-fly",

      externalId: null,

      name:
        "Reverse Cable Fly",

      description:
        "Rear-delt isolation movement.",

      muscles: [
        "posterior deltoid",
      ],

      secondaryMuscles: [
        "trapezius",
      ],

      equipment: [
        "cable",
      ],

      category: "Shoulders",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-hack-squat",

      externalId: null,

      name:
        "Hack Squat",

      description:
        "Stable quad-dominant compound exercise.",

      muscles: [
        "quadriceps",
      ],

      secondaryMuscles: [
        "gluteus maximus",
      ],

      equipment: [
        "machine",
      ],

      category: "Legs",

      kind: "compound",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-leg-extension",

      externalId: null,

      name:
        "Leg Extension",

      description:
        "Direct quadriceps isolation.",

      muscles: [
        "quadriceps",
      ],

      secondaryMuscles: [],

      equipment: [
        "machine",
      ],

      category: "Legs",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-rdl",

      externalId: null,

      name:
        "Romanian Deadlift",

      description:
        "Hip hinge emphasizing hamstrings and glutes.",

      muscles: [
        "hamstrings",
      ],

      secondaryMuscles: [
        "gluteus maximus",
      ],

      equipment: [
        "barbell",
        "dumbbell",
      ],

      category: "Legs",

      kind: "compound",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-leg-curl",

      externalId: null,

      name:
        "Seated Leg Curl",

      description:
        "Hamstring isolation movement.",

      muscles: [
        "hamstrings",
      ],

      secondaryMuscles: [],

      equipment: [
        "machine",
      ],

      category: "Legs",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-hip-thrust",

      externalId: null,

      name:
        "Hip Thrust",

      description:
        "Glute-focused hip extension movement.",

      muscles: [
        "gluteus maximus",
      ],

      secondaryMuscles: [
        "hamstrings",
      ],

      equipment: [
        "barbell",
        "machine",
      ],

      category: "Legs",

      kind: "compound",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-biceps-curl",

      externalId: null,

      name:
        "Cable Biceps Curl",

      description:
        "Stable biceps isolation movement.",

      muscles: [
        "biceps brachii",
      ],

      secondaryMuscles: [],

      equipment: [
        "cable",
      ],

      category: "Arms",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-overhead-triceps",

      externalId: null,

      name:
        "Overhead Cable Triceps Extension",

      description:
        "Triceps isolation emphasizing the long head.",

      muscles: [
        "triceps brachii",
      ],

      secondaryMuscles: [],

      equipment: [
        "cable",
      ],

      category: "Arms",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-standing-calf",

      externalId: null,

      name:
        "Standing Calf Raise",

      description:
        "Calf plantar-flexion movement.",

      muscles: [
        "gastrocnemius",
      ],

      secondaryMuscles: [
        "soleus",
      ],

      equipment: [
        "machine",
      ],

      category: "Calves",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },

    {
      id: "mf-cable-crunch",

      externalId: null,

      name:
        "Cable Crunch",

      description:
        "Loadable abdominal flexion exercise.",

      muscles: [
        "rectus abdominis",
      ],

      secondaryMuscles: [],

      equipment: [
        "cable",
      ],

      category: "Abs",

      kind: "isolation",

      source:
        "muscle-fitness",

      sourceUrl: null,

      license: null,
    },
  ];

/* =========================================================
   TARGET MATCHING
========================================================= */

const TARGET_TERMS: Record<
  MuscleGroup,
  string[]
> = {
  Chest: [
    "chest",
    "pectoralis",
    "bench press",
    "chest press",
    "fly",
  ],

  "Upper Chest": [
    "incline",
    "upper chest",
    "clavicular",
    "pectoralis",
  ],

  "Back Width": [
    "latissimus",
    "lat ",
    "pulldown",
    "pull down",
    "pull-up",
    "pull up",
    "chin-up",
  ],

  "Back Thickness": [
    "row",
    "trapezius",
    "rhomboid",
    "upper back",
  ],

  "Side Delts": [
    "lateral raise",
    "side delt",
    "lateral deltoid",
    "deltoid",
  ],

  "Rear Delts": [
    "rear delt",
    "reverse fly",
    "posterior deltoid",
    "reverse butterfly",
  ],

  Quads: [
    "quadriceps",
    "squat",
    "leg press",
    "leg extension",
  ],

  Hamstrings: [
    "hamstring",
    "leg curl",
    "romanian deadlift",
    "stiff leg",
  ],

  Glutes: [
    "glute",
    "hip thrust",
    "split squat",
  ],

  Biceps: [
    "biceps",
    "curl",
  ],

  Triceps: [
    "triceps",
    "pressdown",
    "pushdown",
    "triceps extension",
  ],

  Calves: [
    "calf",
    "gastrocnemius",
    "soleus",
  ],

  Abs: [
    "abdominal",
    "rectus abdominis",
    "crunch",
  ],
};

/* =========================================================
   SPLIT TEMPLATES
========================================================= */

type DayTarget = {
  title: string;
  muscles: MuscleGroup[];
};

function repeatToLength(
  source: DayTarget[],
  count: number
) {
  const output: DayTarget[] =
    [];

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    output.push(
      source[
        index %
          source.length
      ]
    );
  }

  return output;
}

function resolveAutoSplit(
  days: number
): TrainingSplit {
  if (days <= 3) {
    return "full_body";
  }

  if (days === 4) {
    return "upper_lower";
  }

  if (days === 5) {
    return "ppl_upper_lower";
  }

  return "push_pull_legs";
}

function fullBodyDay(
  number: number
): DayTarget {
  const variations: DayTarget[] =
    [
      {
        title:
          "Full Body A",

        muscles: [
          "Chest",
          "Back Width",
          "Quads",
          "Hamstrings",
          "Side Delts",
          "Triceps",
        ],
      },

      {
        title:
          "Full Body B",

        muscles: [
          "Back Thickness",
          "Upper Chest",
          "Glutes",
          "Quads",
          "Rear Delts",
          "Biceps",
        ],
      },

      {
        title:
          "Full Body C",

        muscles: [
          "Upper Chest",
          "Back Width",
          "Hamstrings",
          "Quads",
          "Side Delts",
          "Abs",
        ],
      },
    ];

  return variations[
    number %
      variations.length
  ];
}

export function getSplitTargets(
  preferences: TrainingPreferences
): DayTarget[] {
  const days =
    preferences.trainingDays;

  const split =
    preferences.splitType ===
    "auto"
      ? resolveAutoSplit(
          days
        )
      : preferences.splitType;

  if (
    split === "custom" &&
    preferences.customSplit.length >
      0
  ) {
    return preferences.customSplit.map(
      (
        day: CustomSplitDay,
        index
      ) => ({
        title:
          day.name ||
          `Day ${index + 1}`,

        muscles:
          day.muscles,
      })
    );
  }

  if (
    split === "full_body"
  ) {
    return Array.from(
      {
        length: days,
      },
      (_, index) =>
        fullBodyDay(index)
    );
  }

  if (
    split === "upper_lower"
  ) {
    return repeatToLength(
      [
        {
          title: "Upper A",

          muscles: [
            "Chest",
            "Back Width",
            "Back Thickness",
            "Side Delts",
            "Biceps",
            "Triceps",
          ],
        },

        {
          title: "Lower A",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },

        {
          title: "Upper B",

          muscles: [
            "Upper Chest",
            "Back Thickness",
            "Back Width",
            "Rear Delts",
            "Biceps",
            "Triceps",
          ],
        },

        {
          title: "Lower B",

          muscles: [
            "Hamstrings",
            "Quads",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      days
    );
  }

  if (
    split ===
    "push_pull_legs"
  ) {
    return repeatToLength(
      [
        {
          title: "Push",

          muscles: [
            "Chest",
            "Upper Chest",
            "Side Delts",
            "Triceps",
          ],
        },

        {
          title: "Pull",

          muscles: [
            "Back Width",
            "Back Thickness",
            "Rear Delts",
            "Biceps",
          ],
        },

        {
          title: "Legs",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      days
    );
  }

  if (
    split ===
    "ppl_upper_lower"
  ) {
    return repeatToLength(
      [
        {
          title: "Push",

          muscles: [
            "Chest",
            "Upper Chest",
            "Side Delts",
            "Triceps",
          ],
        },

        {
          title: "Pull",

          muscles: [
            "Back Width",
            "Back Thickness",
            "Rear Delts",
            "Biceps",
          ],
        },

        {
          title: "Legs",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
          ],
        },

        {
          title: "Upper",

          muscles: [
            "Chest",
            "Back Width",
            "Back Thickness",
            "Side Delts",
            "Biceps",
            "Triceps",
          ],
        },

        {
          title: "Lower",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      days
    );
  }

  if (
    split === "arnold"
  ) {
    return repeatToLength(
      [
        {
          title:
            "Chest + Back",

          muscles: [
            "Chest",
            "Upper Chest",
            "Back Width",
            "Back Thickness",
          ],
        },

        {
          title:
            "Shoulders + Arms",

          muscles: [
            "Side Delts",
            "Rear Delts",
            "Biceps",
            "Triceps",
          ],
        },

        {
          title: "Legs",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      days
    );
  }

  if (
    split ===
    "torso_limbs"
  ) {
    return repeatToLength(
      [
        {
          title: "Torso",

          muscles: [
            "Chest",
            "Upper Chest",
            "Back Width",
            "Back Thickness",
            "Side Delts",
            "Rear Delts",
          ],
        },

        {
          title: "Limbs",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Biceps",
            "Triceps",
            "Calves",
          ],
        },
      ],
      days
    );
  }

  return repeatToLength(
    [
      {
        title: "Chest",

        muscles: [
          "Chest",
          "Upper Chest",
          "Triceps",
        ],
      },

      {
        title: "Back",

        muscles: [
          "Back Width",
          "Back Thickness",
          "Rear Delts",
          "Biceps",
        ],
      },

      {
        title: "Legs",

        muscles: [
          "Quads",
          "Hamstrings",
          "Glutes",
          "Calves",
        ],
      },

      {
        title:
          "Shoulders",

        muscles: [
          "Side Delts",
          "Rear Delts",
          "Triceps",
        ],
      },

      {
        title: "Arms",

        muscles: [
          "Biceps",
          "Triceps",
          "Side Delts",
        ],
      },
    ],
    days
  );
}

/* =========================================================
   SCORING
========================================================= */

function normalize(
  value: string
) {
  return value
    .toLowerCase()
    .trim();
}

function exerciseSearchText(
  exercise: ExternalExercise
) {
  return normalize(
    [
      exercise.name,

      exercise.description,

      exercise.category ?? "",

      ...exercise.muscles,

      ...exercise
        .secondaryMuscles,
    ].join(" ")
  );
}

function matchesTarget(
  exercise: ExternalExercise,
  target: MuscleGroup
) {
  const text =
    exerciseSearchText(
      exercise
    );

  return TARGET_TERMS[
    target
  ].some(
    (term) =>
      text.includes(
        normalize(term)
      )
  );
}

function equipmentAllowed(
  exercise: ExternalExercise,
  profile: ClientTrainingProfile
) {
  if (
    profile.trainingLocation
      ?.toLowerCase() === "gym"
  ) {
    return true;
  }

  if (
    exercise.equipment.length ===
    0
  ) {
    return true;
  }

  const available =
    profile.availableEquipment.map(
      normalize
    );

  return exercise.equipment.some(
    (equipment) =>
      available.some(
        (item) =>
          normalize(
            equipment
          ).includes(item) ||
          item.includes(
            normalize(
              equipment
            )
          )
      )
  );
}

function styleScore(
  exercise: ExternalExercise,
  style: ExerciseStyle
) {
  const equipment =
    exercise.equipment
      .join(" ")
      .toLowerCase();

  const name =
    exercise.name.toLowerCase();

  if (style === "mixed") {
    return 0;
  }

  if (
    style === "machine"
  ) {
    if (
      equipment.includes(
        "machine"
      ) ||
      equipment.includes(
        "cable"
      ) ||
      name.includes(
        "machine"
      ) ||
      name.includes(
        "cable"
      )
    ) {
      return 5;
    }

    return -2;
  }

  if (
    equipment.includes(
      "barbell"
    ) ||
    equipment.includes(
      "dumbbell"
    ) ||
    name.includes(
      "barbell"
    ) ||
    name.includes(
      "dumbbell"
    )
  ) {
    return 5;
  }

  return -1;
}

function priorityIndex(
  muscle: MuscleGroup,
  priorities: MuscleGroup[]
) {
  return priorities.indexOf(
    muscle
  );
}

function preferredMovementScore(
  exercise: ExternalExercise,
  target: MuscleGroup
) {
  const name =
    normalize(
      exercise.name
    );

  const preferred: Record<
    MuscleGroup,
    string[]
  > = {
    Chest: [
      "bench press",
      "chest press",
      "fly",
    ],

    "Upper Chest": [
      "incline",
      "low to high",
    ],

    "Back Width": [
      "pulldown",
      "pull up",
      "pull-up",
      "chin",
    ],

    "Back Thickness": [
      "row",
    ],

    "Side Delts": [
      "lateral raise",
    ],

    "Rear Delts": [
      "rear delt",
      "reverse fly",
    ],

    Quads: [
      "squat",
      "leg press",
      "leg extension",
    ],

    Hamstrings: [
      "leg curl",
      "romanian",
      "stiff",
    ],

    Glutes: [
      "hip thrust",
      "split squat",
    ],

    Biceps: [
      "curl",
    ],

    Triceps: [
      "extension",
      "pushdown",
      "pressdown",
    ],

    Calves: [
      "calf raise",
    ],

    Abs: [
      "crunch",
    ],
  };

  return preferred[
    target
  ].some(
    (keyword) =>
      name.includes(
        keyword
      )
  )
    ? 6
    : 0;
}

function scoreExercise(
  exercise: ExternalExercise,
  target: MuscleGroup,
  profile: ClientTrainingProfile,
  preferences: TrainingPreferences
) {
  if (
    !matchesTarget(
      exercise,
      target
    )
  ) {
    return -100;
  }

  if (
    !equipmentAllowed(
      exercise,
      profile
    )
  ) {
    return -100;
  }

  const excluded =
    preferences.excludedExercises.some(
      (item) =>
        normalize(
          exercise.name
        ).includes(
          normalize(item)
        )
    );

  if (excluded) {
    return -100;
  }

  let score = 10;

  score +=
    preferredMovementScore(
      exercise,
      target
    );

  score +=
    styleScore(
      exercise,
      preferences.exerciseStyle
    );

  if (
    exercise.source === "wger"
  ) {
    score += 3;
  }

  if (
    exercise.description.length >
    20
  ) {
    score += 1;
  }

  return score;
}

/* =========================================================
   TRAINING VARIABLES
========================================================= */

function baseSets(
  volume: TrainingVolume
) {
  if (volume === "low") {
    return 2;
  }

  if (
    volume === "high"
  ) {
    return 4;
  }

  return 3;
}

function getSets(
  target: MuscleGroup,
  preferences: TrainingPreferences
) {
  let sets =
    baseSets(
      preferences.volumeStyle
    );

  const priority =
    priorityIndex(
      target,
      preferences.priorityMuscles
    );

  if (priority === 0) {
    sets += 1;
  }

  if (
    priority === 1 &&
    preferences.volumeStyle !==
      "low"
  ) {
    sets += 1;
  }

  return Math.min(
    sets,
    5
  );
}

function getRir(
  intensity: TrainingIntensity,
  isolation: boolean
) {
  if (
    intensity ===
    "conservative"
  ) {
    return isolation
      ? "2–3 RIR"
      : "3–4 RIR";
  }

  if (
    intensity ===
    "moderate"
  ) {
    return isolation
      ? "1–2 RIR"
      : "2–3 RIR";
  }

  if (
    intensity === "hard"
  ) {
    return isolation
      ? "0–1 RIR"
      : "1–2 RIR";
  }

  return isolation
    ? "0–1 RIR"
    : "1 RIR";
}

function getFailureInstruction(
  failureStyle: FailureStyle,
  isolation: boolean
) {
  if (
    failureStyle === "rare"
  ) {
    return "Do not intentionally train to failure.";
  }

  if (
    failureStyle ===
    "isolation_only"
  ) {
    return isolation
      ? "Optional failure on the final set only if technique remains stable."
      : "Keep compound sets short of failure.";
  }

  return isolation
    ? "Final set may reach technical failure."
    : "Only selected final compound sets may approach 0–1 RIR; do not sacrifice technique.";
}

function getReps(
  goal: string,
  isolation: boolean
) {
  const normalized =
    normalize(goal);

  const strengthGoal =
    normalized.includes(
      "strength"
    );

  if (strengthGoal) {
    return isolation
      ? "8–15"
      : "4–8";
  }

  return isolation
    ? "10–20"
    : "6–12";
}

function getRest(
  isolation: boolean
) {
  return isolation
    ? "60–120 sec"
    : "2–3 min";
}

function isIsolation(
  exercise: ExternalExercise
) {
  if (
    exercise.kind ===
    "isolation"
  ) {
    return true;
  }

  if (
    exercise.kind ===
    "compound"
  ) {
    return false;
  }

  const name =
    normalize(
      exercise.name
    );

  const isolationWords = [
    "curl",
    "lateral raise",
    "extension",
    "fly",
    "crunch",
    "calf raise",
    "pushdown",
    "pressdown",
  ];

  return isolationWords.some(
    (word) =>
      name.includes(word)
  );
}

function maxExercisesForTime(
  minutes: number
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

/* =========================================================
   EXERCISE SELECTION
========================================================= */

function dedupeExercises(
  external: ExternalExercise[]
) {
  const map =
    new Map<
      string,
      ExternalExercise
    >();

  for (
    const exercise of [
      ...external,
      ...FALLBACK_EXERCISES,
    ]
  ) {
    const key =
      normalize(
        exercise.name
      );

    if (!map.has(key)) {
      map.set(
        key,
        exercise
      );
    }
  }

  return Array.from(
    map.values()
  );
}

function chooseExercise(
  exercises: ExternalExercise[],
  target: MuscleGroup,
  profile: ClientTrainingProfile,
  preferences: TrainingPreferences,
  usedIds: Set<string>
) {
  return exercises
    .filter(
      (exercise) =>
        !usedIds.has(
          exercise.id
        )
    )
    .map(
      (exercise) => ({
        exercise,

        score:
          scoreExercise(
            exercise,
            target,
            profile,
            preferences
          ),
      })
    )
    .filter(
      (item) =>
        item.score > -100
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )[0]?.exercise;
}

function reasonForExercise(
  target: MuscleGroup,
  exercise: ExternalExercise,
  preferences: TrainingPreferences
) {
  const priority =
    priorityIndex(
      target,
      preferences.priorityMuscles
    );

  if (priority === 0) {
    return `${target} is your primary priority, so this exercise is placed early and receives additional working volume.`;
  }

  if (priority === 1) {
    return `${target} is one of your prioritized muscle groups.`;
  }

  if (priority === 2) {
    return `${target} is your third training priority.`;
  }

  return `Selected to train ${target} within your chosen split and available equipment.`;
}

function convertExercise(
  exercise: ExternalExercise,
  target: MuscleGroup,
  profile: ClientTrainingProfile,
  preferences: TrainingPreferences
): ProgramExercise {
  const isolation =
    isIsolation(
      exercise
    );

  return {
    id:
      exercise.id,

    name:
      exercise.name,

    targetMuscle:
      target,

    muscles:
      exercise.muscles,

    secondaryMuscles:
      exercise.secondaryMuscles,

    equipment:
      exercise.equipment,

    sets:
      getSets(
        target,
        preferences
      ),

    reps:
      getReps(
        profile.goal ??
          "",
        isolation
      ),

    rir:
      getRir(
        preferences.intensityStyle,
        isolation
      ),

    rest:
      getRest(
        isolation
      ),

    failureInstruction:
      getFailureInstruction(
        preferences.failureStyle,
        isolation
      ),

    exerciseReason:
      reasonForExercise(
        target,
        exercise,
        preferences
      ),

    source:
      exercise.source ===
      "wger"
        ? "wger"
        : "Muscle Fitness fallback",

    sourceUrl:
      exercise.sourceUrl,

    license:
      exercise.license,
  };
}

/* =========================================================
   GENERATE PROGRAM
========================================================= */

export function generateTrainingProgram(
  profile: ClientTrainingProfile,
  preferences: TrainingPreferences,
  externalExercises: ExternalExercise[]
): GeneratedProgram {
  const pool =
    dedupeExercises(
      externalExercises
    );

  const dayTargets =
    getSplitTargets(
      preferences
    );

  const maxExercises =
    maxExercisesForTime(
      preferences.targetSessionMinutes
    );

  const priorities =
    preferences.priorityMuscles;

  const days: ProgramDay[] =
    dayTargets.map(
      (
        day,
        dayIndex
      ) => {
        const orderedTargets =
          [
            ...day.muscles,
          ].sort(
            (a, b) => {
              const aIndex =
                priorityIndex(
                  a,
                  priorities
                );

              const bIndex =
                priorityIndex(
                  b,
                  priorities
                );

              const aValue =
                aIndex === -1
                  ? 99
                  : aIndex;

              const bValue =
                bIndex === -1
                  ? 99
                  : bIndex;

              return (
                aValue -
                bValue
              );
            }
          );

        const usedIds =
          new Set<string>();

        const exercises:
          ProgramExercise[] =
          [];

        for (
          const target of orderedTargets
        ) {
          if (
            exercises.length >=
            maxExercises
          ) {
            break;
          }

          const selected =
            chooseExercise(
              pool,
              target,
              profile,
              preferences,
              usedIds
            );

          if (!selected) {
            continue;
          }

          usedIds.add(
            selected.id
          );

          exercises.push(
            convertExercise(
              selected,
              target,
              profile,
              preferences
            )
          );
        }

        /*
          Give the #1 priority muscle a second movement
          when session length allows.
        */

        const mainPriority =
          priorities[0];

        if (
          mainPriority &&
          day.muscles.includes(
            mainPriority
          ) &&
          exercises.length <
            maxExercises
        ) {
          const second =
            chooseExercise(
              pool,
              mainPriority,
              profile,
              preferences,
              usedIds
            );

          if (second) {
            exercises.splice(
              Math.min(
                1,
                exercises.length
              ),
              0,
              convertExercise(
                second,
                mainPriority,
                profile,
                preferences
              )
            );
          }
        }

        return {
          day:
            dayIndex + 1,

          title:
            day.title,

          focus:
            day.muscles,

          exercises:
            exercises.slice(
              0,
              maxExercises
            ),
        };
      }
    );

  const externalCount =
    days.reduce(
      (
        total,
        day
      ) =>
        total +
        day.exercises.filter(
          (exercise) =>
            exercise.source ===
            "wger"
        ).length,
      0
    );

  return {
    version: 1,

    generatedAt:
      new Date().toISOString(),

    splitType:
      preferences.splitType,

    goal:
      profile.goal ??
      "General fitness",

    intensityStyle:
      preferences.intensityStyle,

    volumeStyle:
      preferences.volumeStyle,

    failureStyle:
      preferences.failureStyle,

    priorityMuscles:
      preferences.priorityMuscles,

    trainingDays:
      preferences.trainingDays,

    sessionMinutes:
      preferences.targetSessionMinutes,

    days,

    externalSourceUsed:
      externalCount > 0,

    externalExerciseCount:
      externalCount,
  };
}