import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowLeft,
  Dumbbell,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import PlanBuilder from "../../plan-builder";

import {
  LOCAL_EXERCISE_LIBRARY,
} from "@/lib/workouts/exercise-library";

import {
  getRecommendedPreset,
  SPLIT_OPTIONS,
  type SplitPreset,
} from "@/lib/workouts/presets";

import { createClient } from "@/lib/supabase/server";

export const dynamic =
  "force-dynamic";

type NewWorkoutPlanPageProps = {
  searchParams: Promise<{
    preset?:
      | string
      | string[];

    source?:
      | string
      | string[];

    templateName?:
      | string
      | string[];
  }>;
};

function firstValue(
  value:
    | string
    | string[]
    | undefined,
): string | undefined {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function isPreset(
  value: string,
): value is SplitPreset {
  return SPLIT_OPTIONS.some(
    (option) =>
      option.id === value,
  );
}

export default async function NewWorkoutPlanPage({
  searchParams,
}: NewWorkoutPlanPageProps) {
  const supabase =
    await createClient();

  const {
    data: { user },
    error,
  } =
    await supabase.auth.getUser();

  if (
    error ||
    !user
  ) {
    redirect(
      `/login?next=${encodeURIComponent(
        "/dashboard/workouts/plans/new",
      )}`,
    );
  }

  const params =
    await searchParams;

  const {
    data: fitness,
  } =
    await supabase
      .from(
        "fitness_profiles",
      )
      .select(
        `
          goal,
          experience,
          training_days,
          session_duration_minutes,
          training_location,
          available_equipment,
          priority_muscles,
          physical_limitations
        `,
      )
      .eq(
        "user_id",
        user.id,
      )
      .maybeSingle();

  const trainingDays =
    fitness
      ?.training_days ??
    3;

  const requestedPreset =
    firstValue(
      params.preset,
    );

  const initialPreset =
    requestedPreset &&
    isPreset(
      requestedPreset,
    )
      ? requestedPreset
      : getRecommendedPreset(
          trainingDays,
          fitness?.experience ??
            null,
        );

  const source =
    firstValue(
      params.source,
    );

  const externalTemplateName =
    firstValue(
      params.templateName,
    ) ??
    null;

  return (
    <main className="relative min-h-screen text-white">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <Link
          href="/dashboard/workouts"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />

          Back to workouts
        </Link>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-xs font-semibold text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />

            Profile-aware
          </span>

          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">
            <Sparkles className="h-4 w-4" />

            Adaptive builder
          </span>
        </div>
      </div>

      <header className="mb-8 rounded-3xl border border-white/10 bg-linear-to-br from-[#171717] to-black p-7">
        <div className="flex items-center gap-2 text-amber-400">
          <Dumbbell className="h-4 w-4" />

          <p className="text-xs font-black uppercase tracking-[0.25em]">
            Workout Plan Builder
          </p>
        </div>

        <h1 className="mt-4 text-3xl font-black uppercase sm:text-4xl">
          Build your programme
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-500">
          Configure your split,
          priorities, intensity,
          volume and exercises before
          saving the final plan.
        </p>

        {source === "wger" &&
          externalTemplateName && (
            <div className="mt-5 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4 text-sm text-emerald-300">
              Starting from wger
              community template:{" "}
              <strong>
                {
                  externalTemplateName
                }
              </strong>
            </div>
          )}
      </header>

      <PlanBuilder
        clientId={
          user.id
        }
        exercises={
          LOCAL_EXERCISE_LIBRARY
        }
        initialPreset={
          initialPreset
        }
        externalTemplateName={
          externalTemplateName
        }
        profile={{
          goal:
            fitness?.goal ??
            null,

          experience:
            fitness?.experience ??
            null,

          trainingDays,

          sessionDurationMinutes:
            fitness
              ?.session_duration_minutes ??
            60,

          trainingLocation:
            fitness
              ?.training_location ??
            null,

          availableEquipment:
            fitness
              ?.available_equipment ??
            [],

          priorityMuscles:
            fitness
              ?.priority_muscles ??
            [],

          physicalLimitations:
            fitness
              ?.physical_limitations ??
            null,
        }}
      />
    </main>
  );
}