import { NextResponse } from "next/server";

import type {
  ExerciseDifficulty,
  ExerciseLibraryItem,
} from "@/lib/workouts/exercise-library";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type UnknownRecord =
  Record<string, unknown>;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asArray(
  value: unknown,
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value
    : "";
}

function numberValue(
  value: unknown,
): number | null {
  return typeof value === "number"
    ? value
    : null;
}

function getObjectName(
  value: unknown,
): string {
  if (!isRecord(value)) {
    return "";
  }

  return (
    stringValue(value.name) ||
    stringValue(value.name_en) ||
    stringValue(value.full_name)
  );
}

function namesFromArray(
  value: unknown,
): string[] {
  return asArray(value)
    .map(getObjectName)
    .filter(Boolean);
}

function stripHtml(
  value: string,
): string {
  return value
    .replace(
      /<[^>]*>/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function inferDifficulty(
  name: string,
  equipment: string,
): ExerciseDifficulty {
  const text =
    `${name} ${equipment}`.toLowerCase();

  if (
    text.includes("clean") ||
    text.includes("snatch") ||
    text.includes("muscle up") ||
    text.includes("muscle-up") ||
    text.includes("pistol") ||
    text.includes("handstand")
  ) {
    return "advanced";
  }

  if (
    text.includes("machine") ||
    text.includes("cable") ||
    text.includes("curl") ||
    text.includes("raise") ||
    text.includes("extension")
  ) {
    return "beginner";
  }

  return "intermediate";
}

function inferMovementPattern(
  name: string,
): string {
  const text =
    name.toLowerCase();

  if (
    text.includes(
      "row",
    )
  ) {
    return "Horizontal Pull";
  }

  if (
    text.includes("pulldown") ||
    text.includes("pull up") ||
    text.includes("pull-up")
  ) {
    return "Vertical Pull";
  }

  if (
    text.includes("squat") ||
    text.includes("leg press")
  ) {
    return "Squat";
  }

  if (
    text.includes("deadlift") ||
    text.includes("hip hinge")
  ) {
    return "Hip Hinge";
  }

  if (
    text.includes("curl")
  ) {
    return "Elbow Flexion";
  }

  if (
    text.includes(
      "triceps",
    ) ||
    text.includes(
      "pushdown",
    ) ||
    text.includes(
      "extension",
    )
  ) {
    return "Elbow Extension";
  }

  if (
    text.includes(
      "lateral raise",
    )
  ) {
    return "Shoulder Abduction";
  }

  if (
    text.includes("fly")
  ) {
    return "Horizontal Adduction";
  }

  if (
    text.includes("press")
  ) {
    return "Press";
  }

  return "Other";
}

function friendlyMuscle(
  value: string,
): string {
  const text =
    value.toLowerCase();

  if (
    text.includes(
      "pector",
    )
  ) {
    return "Chest";
  }

  if (
    text.includes(
      "latissimus",
    )
  ) {
    return "Latissimus Dorsi";
  }

  if (
    text.includes(
      "quadr",
    )
  ) {
    return "Quadriceps";
  }

  if (
    text.includes(
      "hamstring",
    ) ||
    text.includes(
      "biceps femoris",
    )
  ) {
    return "Hamstrings";
  }

  if (
    text.includes(
      "glute",
    )
  ) {
    return "Glutes";
  }

  if (
    text.includes(
      "triceps",
    )
  ) {
    return "Triceps";
  }

  if (
    text.includes(
      "biceps",
    )
  ) {
    return "Biceps";
  }

  if (
    text.includes(
      "delto",
    )
  ) {
    return "Shoulders";
  }

  if (
    text.includes(
      "gastro",
    ) ||
    text.includes(
      "soleus",
    )
  ) {
    return "Calves";
  }

  if (
    text.includes(
      "rectus abdom",
    )
  ) {
    return "Abdominals";
  }

  return value;
}

function normalizeExercise(
  raw: unknown,
): ExerciseLibraryItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const baseId =
    numberValue(raw.id);

  const translations =
    asArray(
      raw.exercises,
    ).filter(isRecord);

  const englishTranslation =
    translations.find(
      (translation) => {
        const language =
          translation.language;

        if (
          language === 2
        ) {
          return true;
        }

        return (
          isRecord(language) &&
          language.id === 2
        );
      },
    ) ??
    translations[0];

  if (!englishTranslation) {
    return null;
  }

  const name =
    stringValue(
      englishTranslation.name,
    ).trim();

  if (!name) {
    return null;
  }

  const rawMuscles =
    namesFromArray(
      raw.muscles,
    );

  const rawSecondary =
    namesFromArray(
      raw.muscles_secondary,
    );

  const equipment =
    namesFromArray(
      raw.equipment,
    ).join(", ");

  const description =
    stripHtml(
      stringValue(
        englishTranslation.description,
      ),
    );

  return {
    id: null,

    name,

    description,

    primaryMuscle:
      rawMuscles.length > 0
        ? friendlyMuscle(
            rawMuscles[0],
          )
        : "Other",

    secondaryMuscles:
      rawSecondary.map(
        friendlyMuscle,
      ),

    equipment:
      equipment ||
      "Other",

    difficulty:
      inferDifficulty(
        name,
        equipment,
      ),

    movementPattern:
      inferMovementPattern(
        name,
      ),

    source: "wger",

    sourceUrl:
      baseId !== null
        ? `https://wger.de/api/v2/exercisebaseinfo/${baseId}/`
        : "https://wger.de/",
  };
}

export async function GET() {
  try {
    const response =
      await fetch(
        "https://wger.de/api/v2/exercisebaseinfo/?limit=300&language=2",
        {
          headers: {
            Accept:
              "application/json",
          },

          next: {
            revalidate:
              21600,
          },
        },
      );

    if (!response.ok) {
      throw new Error(
        `wger returned ${response.status}.`,
      );
    }

    const data:
      unknown =
      await response.json();

    if (!isRecord(data)) {
      throw new Error(
        "Invalid wger response.",
      );
    }

    const exercises =
      asArray(
        data.results,
      )
        .map(
          normalizeExercise,
        )
        .filter(
          (
            exercise,
          ): exercise is ExerciseLibraryItem =>
            exercise !== null,
        );

    return NextResponse.json({
      source: "wger",
      exercises,
    });
  } catch (error) {
    console.error(
      "[WGER EXERCISES]",
      error,
    );

    return NextResponse.json(
      {
        source: "wger",
        exercises: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to load external exercises.",
      },
      {
        status: 502,
      },
    );
  }
}