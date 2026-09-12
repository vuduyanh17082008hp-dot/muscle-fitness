import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRight,
  BookOpen,
  Dumbbell,
  ExternalLink,
  Layers3,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { SectionTabs } from "@/components/dashboard/section-tabs";

const TRAIN_TABS = [
  { label: "Today", href: "/dashboard/today" },
  { label: "Plan", href: "/dashboard/split" },
  { label: "Form Coach", href: "/dashboard/workouts/form-coach" },
  { label: "History", href: "/dashboard/workouts/history" },
];

import {
  getRecommendedPreset,
  inferPresetFromText,
  SPLIT_OPTIONS,
  type SplitPreset,
} from "@/lib/workouts/presets";

export const dynamic =
  "force-dynamic";

type WgerTemplate = {
  id: string;
  name: string;
  description: string;
  preset: SplitPreset;
  sourceUrl: string;
};

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

function getString(
  source: UnknownRecord,
  keys: string[],
): string {
  for (const key of keys) {
    const value =
      source[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return "";
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

async function loadWgerTemplates():
  Promise<WgerTemplate[]> {
  try {
    const response =
      await fetch(
        "https://wger.de/api/v2/public-templates/?limit=30",
        {
          headers: {
            Accept:
              "application/json",
          },

          next: {
            revalidate:
              3600,
          },
        },
      );

    if (!response.ok) {
      return [];
    }

    const data:
      unknown =
      await response.json();

    if (!isRecord(data)) {
      return [];
    }

    const results =
      Array.isArray(
        data.results,
      )
        ? data.results
        : [];

    const templates:
      WgerTemplate[] =
      [];

    for (
      const item of results
    ) {
      if (!isRecord(item)) {
        continue;
      }

      const nestedRoutine =
        isRecord(
          item.routine,
        )
          ? item.routine
          : null;

      const name =
        getString(
          item,
          [
            "name",
            "title",
          ],
        ) ||
        (
          nestedRoutine
            ? getString(
                nestedRoutine,
                [
                  "name",
                  "title",
                ],
              )
            : ""
        );

      if (!name) {
        continue;
      }

      const description =
        stripHtml(
          getString(
            item,
            [
              "description",
            ],
          ) ||
          (
            nestedRoutine
              ? getString(
                  nestedRoutine,
                  [
                    "description",
                  ],
                )
              : ""
          ),
        );

      const preset =
        inferPresetFromText(
          `${name} ${description}`,
        );

      /*
       * Chỉ show template mà chúng ta có thể map
       * an toàn vào một split đã biết.
       */
      if (!preset) {
        continue;
      }

      const rawId =
        item.id ??
        nestedRoutine?.id;

      const id =
        typeof rawId ===
          "number" ||
        typeof rawId ===
          "string"
          ? String(rawId)
          : name;

      templates.push({
        id,

        name,

        description,

        preset,

        sourceUrl:
          `https://wger.de/api/v2/public-templates/${id}/`,
      });

      if (
        templates.length >= 6
      ) {
        break;
      }
    }

    return templates;
  } catch {
    return [];
  }
}

export default async function WorkoutsPage() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?next=/dashboard/workouts",
    );
  }

  const [
    fitnessResponse,
    plansResponse,
    externalTemplates,
  ] =
    await Promise.all([
      supabase
        .from(
          "fitness_profiles",
        )
        .select(
          `
            goal,
            experience,
            training_days,
            session_duration_minutes,
            priority_muscles
          `,
        )
        .eq(
          "user_id",
          user.id,
        )
        .maybeSingle(),

      supabase
        .from(
          "workout_plans",
        )
        .select(
          `
            id,
            name,
            goal,
            status,
            days_per_week,
            weeks
          `,
        )
        .eq(
          "client_id",
          user.id,
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(4),

      loadWgerTemplates(),
    ]);

  const fitness =
    fitnessResponse.data;

  const plans =
    plansResponse.data ??
    [];

  const trainingDays =
    fitness
      ?.training_days ??
    3;

  const recommended =
    getRecommendedPreset(
      trainingDays,
      fitness?.experience ??
        null,
    );

  const recommendedInfo =
    SPLIT_OPTIONS.find(
      (split) =>
        split.id ===
        recommended,
    );

  const activePlan =
    plans.find(
      (plan) =>
        plan.status === "active",
    ) ?? null;

  return (
    <main className="space-y-10">
      <SectionTabs tabs={TRAIN_TABS} />

      {/* ===================================================
          HERO
      =================================================== */}

      <header className="overflow-hidden rounded-3xl border border-white/10 bg-linear-to-br from-[#171717] via-[#0d0d0d] to-black p-7 sm:p-9">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-amber-400">
              <Dumbbell className="h-4 w-4" />

              <p className="text-xs font-black uppercase tracking-[0.28em]">
                Workout System
              </p>
            </div>

            <h1 className="mt-4 text-4xl font-black uppercase tracking-tight sm:text-5xl">
              Build your
              <span className="block text-amber-400">
                training programme.
              </span>
            </h1>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-400 sm:text-base">
              Choose a proven split,
              customise every training
              day, set muscle priorities,
              control intensity and
              volume, or start from an
              open-source community
              template.
            </p>
          </div>

          <Link
            href={`/dashboard/workouts/plans/new?preset=${recommended}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-black transition hover:bg-amber-300"
          >
            <WandSparkles className="h-4 w-4" />

            Build recommended plan
          </Link>
        </div>
      </header>

      {/* ===================================================
          FORM COACH — BETA
      =================================================== */}

      <Link
        href="/dashboard/workouts/form-coach"
        className="group flex flex-col items-start justify-between gap-4 rounded-3xl border border-amber-400/20 bg-amber-400/[0.05] p-6 transition hover:border-amber-400/40 hover:bg-amber-400/[0.08] sm:flex-row sm:items-center sm:p-7"
      >
        <div>
          <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">
            Beta
          </span>

          <h2 className="mt-4 text-xl font-black text-white sm:text-2xl">
            Form Coach — camera-based squat, push-up &amp; plank feedback
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Use your webcam for live rep counting and form cues, analysed
            locally in your browser.
          </p>
        </div>

        <ArrowRight className="h-6 w-6 shrink-0 text-amber-400 transition group-hover:translate-x-1" />
      </Link>

      {/* ===================================================
          SETVISION — BETA
      =================================================== */}

      <Link
        href="/dashboard/workouts/setvision"
        className="group flex flex-col items-start justify-between gap-4 rounded-3xl border border-amber-400/20 bg-amber-400/[0.05] p-6 transition hover:border-amber-400/40 hover:bg-amber-400/[0.08] sm:flex-row sm:items-center sm:p-7"
      >
        <div>
          <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">
            Beta
          </span>

          <h2 className="mt-4 text-xl font-black text-white sm:text-2xl">
            SetVision — video analysis for Bench, Squat &amp; Deadlift
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Upload a set to get rep count, ROM, tempo, bar-path consistency and
            velocity loss, then ask Dante what it means for your next set.
          </p>
        </div>

        <ArrowRight className="h-6 w-6 shrink-0 text-amber-400 transition group-hover:translate-x-1" />
      </Link>

      {/* ===================================================
          YOUR CURRENT TRAINING PLAN
      =================================================== */}

      {activePlan ? (
        <section>
          <div className="mb-5 flex items-center gap-2 text-emerald-400">
            <Dumbbell className="h-4 w-4" />

            <p className="text-xs font-black uppercase tracking-[0.22em]">
              Your current training plan
            </p>
          </div>

          <Link
            href={`/dashboard/workouts/plans/${activePlan.id}`}
            className="group block rounded-3xl border border-emerald-500/20 bg-emerald-500/6 p-6 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 sm:p-8"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="rounded-full bg-emerald-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">
                  Active
                </span>

                <h2 className="mt-4 text-2xl font-black text-white">
                  {activePlan.name}
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Goal: {activePlan.goal || "General fitness"} ·{" "}
                  {activePlan.days_per_week} days/week · {activePlan.weeks} weeks
                </p>

                <p className="mt-3 text-xs text-zinc-600">
                  Open the full programme for every workout day, exercise,
                  sets, reps, RIR and rest periods.
                </p>
              </div>

              <ArrowRight className="h-6 w-6 text-emerald-400 transition group-hover:translate-x-1" />
            </div>
          </Link>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-600">
            Your current training plan
          </p>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            You do not have an active training plan yet. Build the
            recommended plan below, or choose a split, to generate the
            full programme — every workout day, exercise, sets, reps and
            rest periods.
          </p>
        </section>
      )}

      {/* ===================================================
          RECOMMENDED
      =================================================== */}

      <section>
        <div className="mb-5">
          <div className="flex items-center gap-2 text-amber-400">
            <Sparkles className="h-4 w-4" />

            <p className="text-xs font-black uppercase tracking-[0.22em]">
              Recommended for you
            </p>
          </div>

          <h2 className="mt-2 text-2xl font-black">
            Start here
          </h2>
        </div>

        <Link
          href={`/dashboard/workouts/plans/new?preset=${recommended}`}
          className="group block rounded-3xl border border-amber-400/25 bg-amber-400/8 p-6 transition hover:border-amber-400/50 hover:bg-amber-400/12"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">
                Recommended
              </span>

              <h3 className="mt-4 text-2xl font-black">
                {
                  recommendedInfo
                    ?.name
                }
              </h3>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                {
                  recommendedInfo
                    ?.description
                }
              </p>

              <p className="mt-3 text-xs text-zinc-600">
                Based on{" "}
                {trainingDays} training
                days and your current
                experience level.
              </p>
            </div>

            <ArrowRight className="h-6 w-6 text-amber-400 transition group-hover:translate-x-1" />
          </div>
        </Link>
      </section>

      {/* ===================================================
          SPLITS
      =================================================== */}

      <section>
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-600">
            Choose your structure
          </p>

          <h2 className="mt-2 text-2xl font-black">
            Training splits
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SPLIT_OPTIONS.map(
            (split) => (
              <Link
                key={
                  split.id
                }
                href={`/dashboard/workouts/plans/new?preset=${split.id}`}
                className="group rounded-2xl border border-white/10 bg-[#0d0d0d] p-5 transition hover:border-amber-400/30 hover:bg-white/4"
              >
                <div className="flex items-center justify-between gap-3">
                  {split.id ===
                  "custom" ? (
                    <Target className="h-5 w-5 text-amber-400" />
                  ) : (
                    <Layers3 className="h-5 w-5 text-zinc-600 transition group-hover:text-amber-400" />
                  )}

                  <ArrowRight className="h-4 w-4 text-zinc-700 transition group-hover:translate-x-1 group-hover:text-amber-400" />
                </div>

                <h3 className="mt-5 font-black text-white">
                  {
                    split.name
                  }
                </h3>

                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  {
                    split.description
                  }
                </p>

                <p className="mt-4 text-xs leading-5 text-zinc-700">
                  {
                    split.suitableFor
                  }
                </p>
              </Link>
            ),
          )}
        </div>
      </section>

      {/* ===================================================
          WGER COMMUNITY
      =================================================== */}

      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-400">
              <BookOpen className="h-4 w-4" />

              <p className="text-xs font-black uppercase tracking-[0.22em]">
                Open-source source
              </p>
            </div>

            <h2 className="mt-2 text-2xl font-black">
              wger public templates
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Community templates are
              used as starting points,
              then adapted to your Muscle
              Fitness profile.
            </p>
          </div>

          <a
            href="https://wger.de/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-emerald-400"
          >
            wger
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {externalTemplates.length >
        0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {externalTemplates.map(
              (template) => (
                <Link
                  key={
                    template.id
                  }
                  href={`/dashboard/workouts/plans/new?preset=${template.preset}&source=wger&templateName=${encodeURIComponent(
                    template.name,
                  )}`}
                  className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-5 transition hover:border-emerald-500/30 hover:bg-emerald-500/8"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-400">
                      wger
                    </span>

                    <ExternalLink className="h-4 w-4 text-emerald-400" />
                  </div>

                  <h3 className="mt-4 font-black">
                    {
                      template.name
                    }
                  </h3>

                  {template.description ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">
                      {
                        template.description
                      }
                    </p>
                  ) : null}

                  <p className="mt-4 text-xs text-zinc-700">
                    Adapted to{" "}
                    {
                      SPLIT_OPTIONS.find(
                        (
                          split,
                        ) =>
                          split.id ===
                          template.preset,
                      )?.name
                    }
                  </p>
                </Link>
              ),
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-600">
            External templates are
            temporarily unavailable.
            Built-in Muscle Fitness
            splits remain available.
          </div>
        )}

        <p className="mt-4 text-xs leading-5 text-zinc-700">
          Community templates are not
          automatically treated as
          medically or professionally
          certified programmes. Muscle
          Fitness adapts them according
          to the client profile.
        </p>
      </section>

      {/* ===================================================
          EXISTING PLANS
      =================================================== */}

      {plans.length > 0 && (
        <section>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-600">
            Saved plans
          </p>

          <h2 className="mt-2 text-2xl font-black">
            Your programmes
          </h2>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {plans.map(
              (plan) => (
                <Link
                  key={
                    plan.id
                  }
                  href={`/dashboard/workouts/plans/${plan.id}`}
                  className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5 transition hover:border-white/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold">
                      {
                        plan.name
                      }
                    </h3>

                    <span className="text-[10px] font-black uppercase text-zinc-600">
                      {
                        plan.status
                      }
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-zinc-600">
                    {
                      plan.days_per_week
                    }{" "}
                    days/week ·{" "}
                    {plan.weeks} weeks
                  </p>
                </Link>
              ),
            )}
          </div>
        </section>
      )}
    </main>
  );
}