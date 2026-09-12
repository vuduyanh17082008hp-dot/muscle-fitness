import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { loadReadinessForUser } from "@/lib/dante-core/server/load-readiness-for-user";
import { getOrBuildDailyIntelligence } from "@/lib/dante-core/daily-intelligence";
import { PerformanceCard } from "@/components/ui/performance-card";
import { PerformanceHalo } from "@/components/dashboard/performance-halo";
import { DanteIntelligencePanel } from "@/components/dante/dante-intelligence-panel";

export const dynamic =
  "force-dynamic";

/* =========================================================
   HELPERS
========================================================= */

function formatValue(
  value:
    | string
    | number
    | null
    | undefined,
  suffix = ""
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Not available";
  }

  return `${value}${suffix}`;
}

function formatList(
  value:
    | string[]
    | null
    | undefined
) {
  if (
    !value ||
    value.length === 0
  ) {
    return "Not provided";
  }

  return value.join(", ");
}

function humanize(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "Not available";
  }

  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const LOAD_STATE_STATUS: Record<string, { label: string; tone: "good" | "warning" | "critical" }> = {
  green: { label: "On track", tone: "good" },
  amber: { label: "Elevated load", tone: "warning" },
  red: { label: "High load", tone: "critical" },
};

/* =========================================================
   INFORMATION ROW
========================================================= */

function InformationRow({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/5 py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="text-sm text-zinc-500">
        {label}
      </span>

      <span className="max-w-lg text-sm font-medium leading-6 text-zinc-200 sm:text-right">
        {value}
      </span>
    </div>
  );
}

/* =========================================================
   DASHBOARD PAGE
========================================================= */

export default async function DashboardPage() {
  const supabase =
    await createClient();

  /* =======================================================
     AUTH
  ======================================================= */

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?next=/dashboard"
    );
  }

  /* =======================================================
     LOAD USER DATA
  ======================================================= */

  const [
    profileResponse,
    fitnessResponse,
    preferencesResponse,
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
          avatar_url,
          date_of_birth,
          gender,
          timezone,
          role,
          onboarding_completed,
          created_at,
          updated_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle(),

    /* -----------------------------------------------------
       FITNESS
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
          physical_limitations,
          calories_target,
          protein_target_g,
          carbs_target_g,
          fat_target_g
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle(),

    /* -----------------------------------------------------
       PREFERENCES
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
  ]);

  /* =======================================================
     DATABASE ERRORS
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
    throw new Error(
      `Unable to load fitness profile: ${fitnessResponse.error.message}`
    );
  }

  if (
    preferencesResponse.error
  ) {
    throw new Error(
      `Unable to load preferences: ${preferencesResponse.error.message}`
    );
  }

  const profile =
    profileResponse.data;

  const fitness =
    fitnessResponse.data;

  const preferences =
    preferencesResponse.data;

  /* =======================================================
     ONBOARDING CHECK
  ======================================================= */

  if (
    !profile ||
    !profile.onboarding_completed
  ) {
    redirect("/onboarding");
  }

  /* =======================================================
     TODAY — READINESS, DANTE, TRAIN/FUEL/RECOVER

     Real data only: Dante Core's readiness engine (deterministic —
     see lib/dante-core/readiness-engine.ts) and the cached daily
     narrative (lib/dante-core/daily-intelligence.ts) both already
     exist and back /api/dante/readiness and the old DailyIntelligenceCard
     respectively. Loaded here server-side so the Today Hero renders
     with real data on first paint instead of a client-side fetch.
  ======================================================= */

  const [
    { readiness, recoveryContext },
    dailyIntelligence,
    { plan: nutritionPlan },
    foodLog,
    todaySessionResponse,
  ] = await Promise.all([
    loadReadinessForUser(supabase, user.id),
    getOrBuildDailyIntelligence(supabase, user.id),
    loadNutritionContext(supabase, user.id),
    loadFoodLogForDate(supabase, user.id),
    supabase
      .from("workout_sessions")
      .select("id, name")
      .eq("user_id", user.id)
      .gte("scheduled_for", `${todayIso()}T00:00:00.000Z`)
      .lte("scheduled_for", `${todayIso()}T23:59:59.999Z`)
      .order("scheduled_for", { ascending: true })
      .limit(1),
  ]);

  const todaySession = todaySessionResponse.data?.[0] ?? null;

  /* =======================================================
     DISPLAY NAME
  ======================================================= */

  const displayName =
    profile.full_name ||
    user.user_metadata
      ?.full_name ||
    user.email?.split("@")[0] ||
    "Athlete";

  /* =======================================================
     THREE PILLARS — real values only, each independently
     nullable rather than fabricated when data is missing.
  ======================================================= */

  const sessionsLast7Days = recoveryContext.trainingLoad.sessionsLast7Days;
  const trainingDaysTarget = fitness?.training_days ?? null;

  const trainValue =
    trainingDaysTarget && trainingDaysTarget > 0
      ? Math.round((sessionsLast7Days / trainingDaysTarget) * 100)
      : null;

  const fuelValue = dailyIntelligence.nutritionAdherencePercent;
  const recoverValue = recoveryContext.todayScoreResult.score;

  const loadStatus = LOAD_STATE_STATUS[recoveryContext.trainingLoad.state] ?? null;

  const ctaHref = todaySession
    ? `/dashboard/workouts/session/${todaySession.id}`
    : "/dashboard/workouts/plans/new";

  const ctaLabel = todaySession ? "Start workout" : "Build a plan";

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">

        {/* =================================================
            GREETING
        ================================================= */}

        <p className="text-sm text-zinc-500">
          Welcome back, <span className="text-zinc-300">{displayName}</span>
        </p>

        {/* =================================================
            TODAY HERO — one dominant performance state, not
            a row of equal-weight cards.
        ================================================= */}

        <section className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-linear-to-br from-zinc-900 via-[#111111] to-black p-7 sm:p-10">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-400">
            Today
          </p>

          <div className="mt-6 flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <PerformanceHalo
              className="lg:order-2 lg:w-[280px] lg:shrink-0"
              center={{
                score: readiness.readinessScore,
                status: dailyIntelligence.recoveryStatus,
                confidence: readiness.confidence,
              }}
              train={{
                label: "Train",
                value: trainValue,
                detail:
                  trainingDaysTarget
                    ? `${sessionsLast7Days} of ${trainingDaysTarget} sessions this week`
                    : `${sessionsLast7Days} sessions in the last 7 days`,
                color: "var(--color-domain-training)",
              }}
              fuel={{
                label: "Fuel",
                value: fuelValue,
                detail:
                  fuelValue !== null
                    ? `${fuelValue}% of today's calorie target`
                    : "No nutrition target set",
                color: "var(--color-domain-nutrition)",
              }}
              recover={{
                label: "Recover",
                value: recoverValue,
                detail: recoveryContext.today
                  ? `${humanize(readiness.systemicFatigue)} systemic fatigue`
                  : "No check-in yet today",
                color: "var(--color-domain-recovery)",
              }}
            />

            <div className="w-full text-center lg:order-1 lg:max-w-xl lg:text-left">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                {todaySession
                  ? todaySession.name ?? "Today's session"
                  : "No session scheduled today"}
              </h1>

              <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
                {dailyIntelligence.narrative}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Link
                  href={ctaHref}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 text-sm font-black uppercase tracking-wider text-black transition-colors duration-200 hover:bg-amber-300"
                >
                  {ctaLabel}
                  <ArrowRight className="size-4" />
                </Link>

                <Link
                  href="/onboarding?edit=1"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/4 px-5 text-sm font-semibold text-zinc-300 transition-colors duration-200 hover:border-white/20 hover:bg-white/8 hover:text-white"
                >
                  Edit profile
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================
            THREE PERFORMANCE PILLARS
        ================================================= */}

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <PerformanceCard
            variant="training"
            icon="dumbbell"
            title={todaySession ? todaySession.name ?? "Today's session" : "Rest day"}
            subtitle={todaySession ? "Today's planned session" : "No session scheduled today"}
            status={loadStatus ?? undefined}
            metric={{ value: sessionsLast7Days, unit: "sessions / 7d" }}
            progress={
              trainValue !== null
                ? {
                    value: trainValue,
                    label:
                      trainingDaysTarget
                        ? `${sessionsLast7Days} of ${trainingDaysTarget} sessions this week`
                        : undefined,
                  }
                : undefined
            }
            actions={
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-300 transition-colors duration-200 hover:text-amber-200"
              >
                {ctaLabel}
                <ArrowRight className="size-3.5" />
              </Link>
            }
          />

          <PerformanceCard
            variant="nutrition"
            icon="utensils"
            title="Nutrition"
            subtitle={`${foodLog.totals.calories} of ${formatValue(nutritionPlan?.target.calories)} kcal today`}
            metric={{ value: fuelValue ?? "—", unit: fuelValue !== null ? "%" : undefined }}
            progress={
              fuelValue !== null
                ? { value: fuelValue, label: `${foodLog.totals.protein}g protein logged` }
                : undefined
            }
            href="/dashboard/nutrition"
          />

          <PerformanceCard
            variant="recovery"
            icon="heart-pulse"
            title="Recovery"
            subtitle={
              recoveryContext.today
                ? `${humanize(readiness.systemicFatigue)} systemic fatigue`
                : "No check-in yet today"
            }
            metric={{ value: recoverValue ?? "—" }}
            progress={
              recoverValue !== null
                ? {
                    value: recoverValue,
                    label:
                      recoveryContext.today?.sleep_hours != null
                        ? `${recoveryContext.today.sleep_hours}h sleep last night`
                        : "Sleep not logged",
                  }
                : undefined
            }
            href="/dashboard/recovery"
          />
        </section>

        {/* =================================================
            DANTE — intelligence across all three pillars
        ================================================= */}

        <div className="mt-6">
          <DanteIntelligencePanel
            recommendation={dailyIntelligence.narrative}
            why={readiness.limitingFactors}
            confidence={readiness.confidence}
          />
        </div>

        {/* =================================================
            DETAILS — profile reference, not a daily decision;
            kept below the fold, one flat card each rather than
            nested cards.
        ================================================= */}

        <section className="mt-10 grid gap-6 xl:grid-cols-2">

          {/* ===============================================
              TRAINING PROFILE
          =============================================== */}

          <article className="rounded-2xl border border-white/10 p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-500">
                Training profile
              </p>

              <h2 className="mt-2 text-2xl font-bold text-white">
                Your current setup
              </h2>
            </div>

            <InformationRow
              label="Primary goal"
              value={humanize(
                fitness?.goal
              )}
            />

            <InformationRow
              label="Experience"
              value={humanize(
                fitness?.experience
              )}
            />

            <InformationRow
              label="Height"
              value={formatValue(
                fitness?.height_cm,
                " cm"
              )}
            />

            <InformationRow
              label="Weight"
              value={formatValue(
                fitness?.weight_kg,
                " kg"
              )}
            />

            <InformationRow
              label="Training days"
              value={formatValue(
                fitness
                  ?.training_days,
                " days per week"
              )}
            />

            <InformationRow
              label="Session duration"
              value={formatValue(
                fitness
                  ?.session_duration_minutes,
                " minutes"
              )}
            />

            <InformationRow
              label="Training location"
              value={humanize(
                fitness
                  ?.training_location
              )}
            />

            <InformationRow
              label="Priority muscles"
              value={formatList(
                fitness
                  ?.priority_muscles
              )}
            />

            <InformationRow
              label="Available equipment"
              value={formatList(
                fitness
                  ?.available_equipment
              )}
            />

            <InformationRow
              label="Physical limitations"
              value={
                fitness
                  ?.physical_limitations ||
                "No limitations reported"
              }
            />
          </article>

          {/* ===============================================
              NUTRITION + LIFESTYLE
          =============================================== */}

          <article className="rounded-2xl border border-white/10 p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-500">
                Nutrition and lifestyle
              </p>

              <h2 className="mt-2 text-2xl font-bold text-white">
                Daily conditions
              </h2>
            </div>

            <InformationRow
              label="Meals per day"
              value={formatValue(
                preferences
                  ?.meals_per_day
              )}
            />

            <InformationRow
              label="Food preferences"
              value={formatList(
                preferences
                  ?.food_preferences
              )}
            />

            <InformationRow
              label="Excluded foods"
              value={formatList(
                preferences
                  ?.excluded_foods
              )}
            />

            <InformationRow
              label="Allergies"
              value={formatList(
                preferences
                  ?.allergies
              )}
            />

            <InformationRow
              label="Weekly food budget"
              value={
                preferences
                  ?.weekly_food_budget !==
                  null &&
                preferences
                  ?.weekly_food_budget !==
                  undefined
                  ? `${preferences.weekly_food_budget} SGD`
                  : "Not provided"
              }
            />

            <InformationRow
              label="Cooking ability"
              value={humanize(
                preferences
                  ?.cooking_ability
              )}
            />

            <InformationRow
              label="Meal-prep frequency"
              value={humanize(
                preferences
                  ?.meal_prep_frequency
              )}
            />

            <InformationRow
              label="Sleep"
              value={formatValue(
                preferences
                  ?.sleep_hours,
                " hours"
              )}
            />

            <InformationRow
              label="Daily steps"
              value={formatValue(
                preferences
                  ?.daily_steps
              )}
            />

            <InformationRow
              label="Stress level"
              value={humanize(
                preferences
                  ?.stress_level
              )}
            />

            <InformationRow
              label="Preferred training time"
              value={humanize(
                preferences
                  ?.preferred_training_time
              )}
            />

            <InformationRow
              label="School/work schedule"
              value={
                preferences
                  ?.work_schedule ||
                "Not provided"
              }
            />
          </article>
        </section>
      </div>
    </main>
  );
}
