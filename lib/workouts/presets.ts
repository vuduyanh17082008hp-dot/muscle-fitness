export type SplitPreset =
  | "full_body"
  | "upper_lower"
  | "push_pull_legs"
  | "ppl_upper_lower"
  | "arnold"
  | "torso_limbs"
  | "body_part"
  | "custom";

export type MuscleFocus =
  | "Chest"
  | "Upper Chest"
  | "Back Width"
  | "Back Thickness"
  | "Side Delts"
  | "Rear Delts"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Biceps"
  | "Triceps"
  | "Calves"
  | "Abs";

export type SplitDayTemplate = {
  name: string;
  muscles: MuscleFocus[];
};

export const MUSCLE_FOCUS_OPTIONS: MuscleFocus[] = [
  "Chest",
  "Upper Chest",
  "Back Width",
  "Back Thickness",
  "Side Delts",
  "Rear Delts",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Biceps",
  "Triceps",
  "Calves",
  "Abs",
];

export const SPLIT_OPTIONS: {
  id: SplitPreset;
  name: string;
  description: string;
  suitableFor: string;
}[] = [
  {
    id: "full_body",
    name: "Full Body",
    description:
      "Train most major muscle groups every session.",
    suitableFor:
      "Excellent for beginners and 2–3 training days.",
  },

  {
    id: "upper_lower",
    name: "Upper / Lower",
    description:
      "Alternate upper-body and lower-body sessions.",
    suitableFor:
      "Balanced 4-day structure with good frequency.",
  },

  {
    id: "push_pull_legs",
    name: "Push / Pull / Legs",
    description:
      "Push muscles, pull muscles and legs on separate sessions.",
    suitableFor:
      "Best when training around 3 or 6 days.",
  },

  {
    id: "ppl_upper_lower",
    name: "PPL + Upper / Lower",
    description:
      "Five-day hybrid combining PPL with Upper/Lower.",
    suitableFor:
      "Good for intermediate lifters with five sessions.",
  },

  {
    id: "arnold",
    name: "Arnold Split",
    description:
      "Chest + Back, Shoulders + Arms, and Legs.",
    suitableFor:
      "Higher-frequency bodybuilding structure.",
  },

  {
    id: "torso_limbs",
    name: "Torso / Limbs",
    description:
      "Alternate torso-focused sessions with limb-focused sessions.",
    suitableFor:
      "Flexible hypertrophy split.",
  },

  {
    id: "body_part",
    name: "Body-Part Split",
    description:
      "Different major body regions receive dedicated sessions.",
    suitableFor:
      "More suitable for experienced lifters.",
  },

  {
    id: "custom",
    name: "Custom Split",
    description:
      "You decide exactly what each training day contains.",
    suitableFor:
      "Full control for experienced clients.",
  },
];

function repeatDays(
  source: SplitDayTemplate[],
  count: number,
): SplitDayTemplate[] {
  return Array.from(
    {
      length: count,
    },
    (_, index) => {
      const template =
        source[index % source.length];

      return {
        name:
          source.length === count
            ? template.name
            : `${template.name} ${Math.floor(index / source.length) + 1}`,

        muscles: [
          ...template.muscles,
        ],
      };
    },
  );
}

export function getRecommendedPreset(
  trainingDays: number,
  experience: string | null,
): SplitPreset {
  const normalized =
    experience?.toLowerCase() ?? "";

  if (
    normalized === "beginner" ||
    normalized === ""
  ) {
    if (trainingDays <= 3) {
      return "full_body";
    }

    return "upper_lower";
  }

  if (trainingDays <= 3) {
    return "full_body";
  }

  if (trainingDays === 4) {
    return "upper_lower";
  }

  if (trainingDays === 5) {
    return "ppl_upper_lower";
  }

  return "push_pull_legs";
}

export function buildSplitDays(
  preset: SplitPreset,
  trainingDays: number,
): SplitDayTemplate[] {
  const count =
    Math.min(
      Math.max(
        trainingDays,
        1,
      ),
      7,
    );

  if (preset === "custom") {
    return Array.from(
      {
        length: count,
      },
      (_, index) => ({
        name:
          `Day ${index + 1}`,

        muscles: [],
      }),
    );
  }

  if (preset === "full_body") {
    return repeatDays(
      [
        {
          name:
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
          name:
            "Full Body B",

          muscles: [
            "Upper Chest",
            "Back Thickness",
            "Quads",
            "Glutes",
            "Rear Delts",
            "Biceps",
          ],
        },

        {
          name:
            "Full Body C",

          muscles: [
            "Chest",
            "Back Width",
            "Hamstrings",
            "Quads",
            "Side Delts",
            "Abs",
          ],
        },
      ],
      count,
    );
  }

  if (preset === "upper_lower") {
    return repeatDays(
      [
        {
          name:
            "Upper A",

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
          name:
            "Lower A",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },

        {
          name:
            "Upper B",

          muscles: [
            "Upper Chest",
            "Back Width",
            "Back Thickness",
            "Rear Delts",
            "Biceps",
            "Triceps",
          ],
        },

        {
          name:
            "Lower B",

          muscles: [
            "Hamstrings",
            "Quads",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      count,
    );
  }

  if (
    preset ===
    "push_pull_legs"
  ) {
    return repeatDays(
      [
        {
          name: "Push",

          muscles: [
            "Chest",
            "Upper Chest",
            "Side Delts",
            "Triceps",
          ],
        },

        {
          name: "Pull",

          muscles: [
            "Back Width",
            "Back Thickness",
            "Rear Delts",
            "Biceps",
          ],
        },

        {
          name: "Legs",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      count,
    );
  }

  if (
    preset ===
    "ppl_upper_lower"
  ) {
    return repeatDays(
      [
        {
          name: "Push",

          muscles: [
            "Chest",
            "Upper Chest",
            "Side Delts",
            "Triceps",
          ],
        },

        {
          name: "Pull",

          muscles: [
            "Back Width",
            "Back Thickness",
            "Rear Delts",
            "Biceps",
          ],
        },

        {
          name: "Legs",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
          ],
        },

        {
          name: "Upper",

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
          name: "Lower",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      count,
    );
  }

  if (preset === "arnold") {
    return repeatDays(
      [
        {
          name:
            "Chest + Back",

          muscles: [
            "Chest",
            "Upper Chest",
            "Back Width",
            "Back Thickness",
          ],
        },

        {
          name:
            "Shoulders + Arms",

          muscles: [
            "Side Delts",
            "Rear Delts",
            "Biceps",
            "Triceps",
          ],
        },

        {
          name: "Legs",

          muscles: [
            "Quads",
            "Hamstrings",
            "Glutes",
            "Calves",
            "Abs",
          ],
        },
      ],
      count,
    );
  }

  if (
    preset ===
    "torso_limbs"
  ) {
    return repeatDays(
      [
        {
          name: "Torso",

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
          name: "Limbs",

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
      count,
    );
  }

  return repeatDays(
    [
      {
        name: "Chest",

        muscles: [
          "Chest",
          "Upper Chest",
          "Triceps",
        ],
      },

      {
        name: "Back",

        muscles: [
          "Back Width",
          "Back Thickness",
          "Rear Delts",
          "Biceps",
        ],
      },

      {
        name: "Legs",

        muscles: [
          "Quads",
          "Hamstrings",
          "Glutes",
          "Calves",
        ],
      },

      {
        name:
          "Shoulders",

        muscles: [
          "Side Delts",
          "Rear Delts",
          "Triceps",
        ],
      },

      {
        name: "Arms",

        muscles: [
          "Biceps",
          "Triceps",
          "Side Delts",
        ],
      },
    ],
    count,
  );
}

export function inferPresetFromText(
  value: string,
): SplitPreset | null {
  const text =
    value.toLowerCase();

  if (
    text.includes(
      "full body",
    ) ||
    text.includes(
      "full-body",
    )
  ) {
    return "full_body";
  }

  if (
    text.includes(
      "upper lower",
    ) ||
    text.includes(
      "upper/lower",
    )
  ) {
    return "upper_lower";
  }

  if (
    text.includes(
      "push pull legs",
    ) ||
    text.includes("ppl")
  ) {
    return "push_pull_legs";
  }

  if (
    text.includes("arnold")
  ) {
    return "arnold";
  }

  if (
    text.includes(
      "torso",
    ) &&
    text.includes(
      "limb",
    )
  ) {
    return "torso_limbs";
  }

  return null;
}