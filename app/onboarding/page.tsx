import Link from "next/link";
import { redirect } from "next/navigation";

import OnboardingWizard from "@/features/onboarding/onboarding-wizard";

import {
  defaultOnboardingData,
  type OnboardingData,
  type OnboardingDraftData,
} from "@/features/onboarding/schema";

import { createClient } from "@/lib/supabase/server";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TYPES
========================================================= */

type OnboardingPageProps = {
  searchParams: Promise<{
    edit?: string | string[];
  }>;
};

/* =========================================================
   HELPERS
========================================================= */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/* =========================================================
   ENUM VALUE HELPER
========================================================= */

function enumValue<T extends string>(
  value: string | null | undefined,
  fallback: T
): T {
  if (!value) {
    return fallback;
  }

  return value as T;
}

/* =========================================================
   MERGE EXISTING PROFILE + DRAFT
========================================================= */

function mergeDraftData(
  base:
    | OnboardingDraftData
    | undefined,
  draft:
    | OnboardingDraftData
    | undefined
): OnboardingDraftData | undefined {
  if (!base && !draft) {
    return undefined;
  }

  return {
    personal: {
      ...base?.personal,
      ...draft?.personal,
    },

    goal: {
      ...base?.goal,
      ...draft?.goal,
    },

    training: {
      ...base?.training,
      ...draft?.training,

      availableEquipment:
        draft?.training
          ?.availableEquipment ??
        base?.training
          ?.availableEquipment,

      priorityMuscles:
        draft?.training
          ?.priorityMuscles ??
        base?.training
          ?.priorityMuscles,
    },

    nutrition: {
      ...base?.nutrition,
      ...draft?.nutrition,

      foodPreferences:
        draft?.nutrition
          ?.foodPreferences ??
        base?.nutrition
          ?.foodPreferences,

      excludedFoods:
        draft?.nutrition
          ?.excludedFoods ??
        base?.nutrition
          ?.excludedFoods,

      allergies:
        draft?.nutrition
          ?.allergies ??
        base?.nutrition
          ?.allergies,
    },

    lifestyle: {
      ...base?.lifestyle,
      ...draft?.lifestyle,
    },
  };
}

/* =========================================================
   PAGE
========================================================= */

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const params =
    await searchParams;

  const editParam =
    Array.isArray(params.edit)
      ? params.edit[0]
      : params.edit;

  const isEditMode =
    editParam === "1" ||
    editParam === "true";

  /* =======================================================
     AUTH
  ======================================================= */

  const supabase =
    await createClient();

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    redirect(
      isEditMode
        ? "/login?next=/onboarding?edit=1"
        : "/login?next=/onboarding"
    );
  }

  /* =======================================================
     LOAD DATABASE DATA
  ======================================================= */

  const [
    profileResponse,
    fitnessResponse,
    preferencesResponse,
    draftResponse,
  ] = await Promise.all([
    /* -----------------------------------------------------
       PROFILE
    ----------------------------------------------------- */

    supabase
      .from("profiles")
      .select(
        `
          user_id,
          full_name,
          date_of_birth,
          gender,
          timezone,
          onboarding_completed
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle(),

    /* -----------------------------------------------------
       FITNESS PROFILE
    ----------------------------------------------------- */

    supabase
      .from(
        "fitness_profiles"
      )
      .select(
        `
          user_id,
          height_cm,
          weight_kg,
          goal,
          experience,
          training_days,
          session_duration_minutes,
          training_location,
          available_equipment,
          priority_muscles,
          physical_limitations
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle(),

    /* -----------------------------------------------------
       USER PREFERENCES
    ----------------------------------------------------- */

    supabase
      .from(
        "user_preferences"
      )
      .select(
        `
          user_id,
          meals_per_day,
          food_preferences,
          excluded_foods,
          allergies,
          weekly_food_budget,
          cooking_ability,
          meal_prep_frequency,
          sleep_hours,
          daily_steps,
          work_schedule,
          stress_level,
          preferred_training_time
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle(),

    /* -----------------------------------------------------
       SAVED DRAFT
    ----------------------------------------------------- */

    supabase
      .from(
        "onboarding_drafts"
      )
      .select(
        `
          user_id,
          current_step,
          data
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle(),
  ]);

  /* =======================================================
     ERROR HANDLING
  ======================================================= */

  if (
    profileResponse.error
  ) {
    throw new Error(
      `Unable to load profile: ${profileResponse.error.message}`
    );
  }

  if (
    fitnessResponse.error
  ) {
    console.error(
      "Unable to load fitness profile:",
      fitnessResponse.error
    );
  }

  if (
    preferencesResponse.error
  ) {
    console.error(
      "Unable to load preferences:",
      preferencesResponse.error
    );
  }

  if (
    draftResponse.error
  ) {
    console.error(
      "Unable to load onboarding draft:",
      draftResponse.error
    );
  }

  const profile =
    profileResponse.data;

  const fitness =
    fitnessResponse.data;

  const preferences =
    preferencesResponse.data;

  /* =======================================================
     IMPORTANT FIX

     Normal onboarding:
       completed → dashboard

     Edit mode:
       completed → ALLOW ACCESS
  ======================================================= */

  if (
    profile
      ?.onboarding_completed &&
    !isEditMode
  ) {
    redirect("/dashboard");
  }

  /* =======================================================
     LOAD EXISTING SAVED PROFILE FOR EDIT MODE
  ======================================================= */

  let existingProfileData:
    | OnboardingDraftData
    | undefined;

  if (isEditMode) {
    existingProfileData = {
      /* ---------------------------------------------------
         PERSONAL
      --------------------------------------------------- */

      personal: {
        fullName:
          profile?.full_name ??
          user.user_metadata
            ?.full_name ??
          "",

        dateOfBirth:
          profile?.date_of_birth ??
          "",

        gender:
          enumValue<
            OnboardingData["personal"]["gender"]
          >(
            profile?.gender,
            defaultOnboardingData
              .personal.gender
          ),

        heightCm:
          fitness?.height_cm ??
          defaultOnboardingData
            .personal.heightCm,

        weightKg:
          fitness?.weight_kg ??
          defaultOnboardingData
            .personal.weightKg,

        timezone:
          profile?.timezone ??
          defaultOnboardingData
            .personal.timezone,
      },

      /* ---------------------------------------------------
         GOAL
      --------------------------------------------------- */

      goal: {
        goal:
          enumValue<
            OnboardingData["goal"]["goal"]
          >(
            fitness?.goal,
            defaultOnboardingData
              .goal.goal
          ),
      },

      /* ---------------------------------------------------
         TRAINING
      --------------------------------------------------- */

      training: {
        experience:
          enumValue<
            OnboardingData["training"]["experience"]
          >(
            fitness?.experience,
            defaultOnboardingData
              .training.experience
          ),

        trainingDays:
          fitness?.training_days ??
          defaultOnboardingData
            .training.trainingDays,

        sessionDurationMinutes:
          fitness
            ?.session_duration_minutes ??
          defaultOnboardingData
            .training
            .sessionDurationMinutes,

        trainingLocation:
          enumValue<
            OnboardingData["training"]["trainingLocation"]
          >(
            fitness
              ?.training_location,
            defaultOnboardingData
              .training
              .trainingLocation
          ),

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
          "",
      },

      /* ---------------------------------------------------
         NUTRITION
      --------------------------------------------------- */

      nutrition: {
        mealsPerDay:
          preferences
            ?.meals_per_day ??
          defaultOnboardingData
            .nutrition.mealsPerDay,

        foodPreferences:
          preferences
            ?.food_preferences ??
          [],

        excludedFoods:
          preferences
            ?.excluded_foods ??
          [],

        allergies:
          preferences
            ?.allergies ??
          [],

        weeklyFoodBudget:
          preferences
            ?.weekly_food_budget ??
          null,

        cookingAbility:
          enumValue<
            OnboardingData["nutrition"]["cookingAbility"]
          >(
            preferences
              ?.cooking_ability,
            defaultOnboardingData
              .nutrition
              .cookingAbility
          ),

        mealPrepFrequency:
          enumValue<
            OnboardingData["nutrition"]["mealPrepFrequency"]
          >(
            preferences
              ?.meal_prep_frequency,
            defaultOnboardingData
              .nutrition
              .mealPrepFrequency
          ),
      },

      /* ---------------------------------------------------
         LIFESTYLE
      --------------------------------------------------- */

      lifestyle: {
        sleepHours:
          preferences
            ?.sleep_hours ??
          defaultOnboardingData
            .lifestyle.sleepHours,

        dailySteps:
          preferences
            ?.daily_steps ??
          defaultOnboardingData
            .lifestyle.dailySteps,

        workSchedule:
          preferences
            ?.work_schedule ??
          "",

        stressLevel:
          enumValue<
            OnboardingData["lifestyle"]["stressLevel"]
          >(
            preferences
              ?.stress_level,
            defaultOnboardingData
              .lifestyle
              .stressLevel
          ),

        preferredTrainingTime:
          enumValue<
            OnboardingData["lifestyle"]["preferredTrainingTime"]
          >(
            preferences
              ?.preferred_training_time,
            defaultOnboardingData
              .lifestyle
              .preferredTrainingTime
          ),
      },
    };
  }

  /* =======================================================
     RESTORE DRAFT IF IT EXISTS
  ======================================================= */

  const rawDraftData =
    draftResponse.data?.data;

  const draftData:
    | OnboardingDraftData
    | undefined =
    isRecord(rawDraftData)
      ? (rawDraftData as unknown as OnboardingDraftData)
      : undefined;

  /* =======================================================
     EDIT MODE:

     Saved DB profile
           ↓
     unfinished edit draft
           ↓
     final initial data
  ======================================================= */

  const initialData =
    isEditMode
      ? mergeDraftData(
          existingProfileData,
          draftData
        )
      : draftData;

  /* =======================================================
     INITIAL STEP
  ======================================================= */

  const initialStep =
    Math.min(
      Math.max(
        draftResponse.data
          ?.current_step ?? 0,
        0
      ),
      5
    );

  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* =================================================
            EDIT MODE HEADER
        ================================================= */}

        {isEditMode && (
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-500">
                Edit Profile
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Update your personal,
                training, nutrition and
                lifestyle information.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              ← Back to dashboard
            </Link>
          </div>
        )}

        {/* =================================================
            WIZARD
        ================================================= */}

        <OnboardingWizard
          userId={user.id}
          initialStep={
            initialStep
          }
          initialData={
            initialData
          }
        />
      </div>
    </main>
  );
}