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
import { loadTodaySession } from "@/lib/training/load-today-session";
import { resolveCanonicalMuscle, MUSCLE_DISPLAY_NAME } from "@/lib/training/muscle-taxonomy";
import { PrimaryButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TRAIN_TABS = [
  { label: "Today", href: "/dashboard/workouts" },
  { label: "Plan", href: "/dashboard/split" },
  { label: "Exercises", href: "/dashboard/workouts/library" },
  { label: "History", href: "/dashboard/workouts/history" },
];

/** A rough, honestly-labeled ("~") estimate from each exercise's own target sets and rest time — never a fabricated fixed number. 45s is an assumed average set-execution time, not measured. */
const ASSUMED_SET_EXECUTION_SECONDS = 45;

function estimateSessionMinutes(exercises: Array<{ targetSets: number | null; restSeconds: number | null }>): number {
  const totalSeconds = exercises.reduce((sum, exercise) => {
    const sets = exercise.targetSets ?? 3;
    const rest = exercise.restSeconds ?? 90;
    return sum + sets * (rest + ASSUMED_SET_EXECUTION_SECONDS);
  }, 0);

  return Math.max(1, Math.round(totalSeconds / 60));
}

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

const BANNER_TONE = {
  amber: {
    badge: "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand",
    border: "hover:border-mf-glass-brand-border",
    arrow: "group-hover:text-mf-glass-brand",
  },
  emerald: {
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    border: "border-emerald-500/20 bg-emerald-500/[0.05] hover:border-emerald-500/40 hover:bg-emerald-500/[0.08]",
    arrow: "text-emerald-400 group-hover:text-emerald-300",
  },
  neutral: {
    badge: "border-mf-glass-border bg-white/5 text-mf-glass-text-secondary",
    border: "hover:border-mf-glass-border-strong",
    arrow: "group-hover:text-mf-glass-text",
  },
} as const;

/**
 * A single reusable horizontal promo/status pattern — replaces four
 * near-identical hand-rolled card blocks (Form Coach, SetVision,
 * Active plan, Recommended split) that previously duplicated the
 * same badge/title/description/arrow CSS with slightly different
 * colors each time. Beta feature links use the quiet neutral/amber-
 * badge-only treatment (glow stays reserved for the hero's one
 * primary CTA); an active plan is real current state, so it's
 * allowed the stronger emerald surface accent.
 */
function PromoBanner({
  href,
  badge,
  tone = "amber",
  title,
  description,
  meta,
  surfaceAccent = false,
}: {
  href: string;
  badge: string;
  tone?: keyof typeof BANNER_TONE;
  title: string;
  description: string;
  meta?: string;
  /** When true, tints the whole card surface with the tone (reserved for real current-state cards, e.g. an active plan) rather than just the badge. */
  surfaceAccent?: boolean;
}) {
  const t = BANNER_TONE[tone];

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col items-start justify-between gap-4 rounded-[20px] border p-6 transition hover:-translate-y-0.5 sm:flex-row sm:items-center sm:p-7",
        surfaceAccent ? t.border : cn("border-mf-glass-border bg-mf-glass-surface", t.border),
      )}
    >
      <div className="min-w-0">
        <span className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider", t.badge)}>
          {badge}
        </span>

        <h2 className="mt-4 text-xl font-black text-mf-glass-text sm:text-2xl">{title}</h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">{description}</p>

        {meta ? <p className="mt-3 text-xs text-mf-glass-text-muted">{meta}</p> : null}
      </div>

      <ArrowRight className={cn("h-5 w-5 shrink-0 text-mf-glass-text-muted transition group-hover:translate-x-1", t.arrow)} />
    </Link>
  );
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
    todaySession,
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
      loadTodaySession(supabase, user.id),
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

  const activeExercises = todaySession?.exercises.filter((exercise) => !exercise.isSkipped) ?? [];

  const muscleLabels = Array.from(
    new Set(
      activeExercises
        .map((exercise) => resolveCanonicalMuscle(exercise.primaryMuscle))
        .filter((muscle): muscle is NonNullable<typeof muscle> => muscle !== null)
        .map((muscle) => MUSCLE_DISPLAY_NAME[muscle]),
    ),
  );

  const estimatedMinutes = activeExercises.length > 0 ? estimateSessionMinutes(activeExercises) : null;
  const hasTodaySession = todaySession !== null && activeExercises.length > 0;

  return (
    <main className="space-y-10">
      <SectionTabs tabs={TRAIN_TABS} />

      {/* ===================================================
          HERO — leads with TODAY'S SESSION when one is
          scheduled; the main action (Start workout) is the
          single dominant element, not one of several
          equal-weight cards.
      =================================================== */}

      <header className="overflow-hidden rounded-[24px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-7 sm:p-9">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-mf-glass-brand">
              <Dumbbell className="h-4 w-4" />

              <p className="text-xs font-black uppercase tracking-[0.28em]">
                {hasTodaySession ? "Today's Session" : "Workout System"}
              </p>
            </div>

            {hasTodaySession ? (
              <>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-mf-glass-text sm:text-5xl">
                  {todaySession!.name ?? "Today's session"}
                </h1>

                {muscleLabels.length > 0 ? (
                  <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-mf-glass-brand">
                    {muscleLabels.join(" • ")}
                  </p>
                ) : null}

                <p className="mt-4 text-sm text-mf-glass-text-muted sm:text-base">
                  {activeExercises.length} exercise{activeExercises.length === 1 ? "" : "s"}
                  {estimatedMinutes !== null ? ` · ~${estimatedMinutes} min` : ""}
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-4 text-4xl font-black uppercase tracking-tight text-mf-glass-text sm:text-5xl">
                  Build your
                  <span className="block text-mf-glass-brand">
                    training programme.
                  </span>
                </h1>

                <p className="mt-5 max-w-3xl text-sm leading-7 text-mf-glass-text-muted sm:text-base">
                  Choose a proven split,
                  customise every training
                  day, set muscle priorities,
                  control intensity and
                  volume, or start from an
                  open-source community
                  template.
                </p>
              </>
            )}
          </div>

          {hasTodaySession ? (
            <PrimaryButton size="lg" asChild>
              <Link href={`/dashboard/workouts/session/${todaySession!.id}`}>
                Start workout
                <ArrowRight className="size-4" />
              </Link>
            </PrimaryButton>
          ) : (
            <PrimaryButton size="lg" asChild>
              <Link href={`/dashboard/workouts/plans/new?preset=${recommended}`}>
                <WandSparkles className="size-4" />
                Build recommended plan
              </Link>
            </PrimaryButton>
          )}
        </div>
      </header>

      {/* ===================================================
          BETA FEATURES — quieter secondary surface; the hero
          above carries the page's one primary/glowing CTA.
      =================================================== */}

      <div className="grid gap-4 lg:grid-cols-2">
        <PromoBanner
          href="/dashboard/workouts/form-coach"
          badge="Beta"
          tone="neutral"
          title="Form Coach"
          description="Camera-based squat, push-up and plank feedback — live rep counting and form cues, analysed locally in your browser."
        />

        <PromoBanner
          href="/dashboard/workouts/setvision"
          badge="Beta"
          tone="neutral"
          title="SetVision"
          description="Upload a set for rep count, ROM, tempo, bar-path consistency and velocity loss on Bench, Squat and Deadlift."
        />
      </div>

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

          <PromoBanner
            href={`/dashboard/workouts/plans/${activePlan.id}`}
            badge="Active"
            tone="emerald"
            surfaceAccent
            title={activePlan.name}
            description={`Goal: ${activePlan.goal || "General fitness"} · ${activePlan.days_per_week} days/week · ${activePlan.weeks} weeks`}
            meta="Open the full programme for every workout day, exercise, sets, reps, RIR and rest periods."
          />
        </section>
      ) : (
        <section className="rounded-[20px] border border-dashed border-mf-glass-border bg-white/[0.02] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-mf-glass-text-muted">
            Your current training plan
          </p>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">
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
          <div className="flex items-center gap-2 text-mf-glass-brand">
            <Sparkles className="h-4 w-4" />

            <p className="text-xs font-black uppercase tracking-[0.22em]">
              Recommended for you
            </p>
          </div>

          <h2 className="mt-2 text-2xl font-black text-mf-glass-text">
            Start here
          </h2>
        </div>

        <PromoBanner
          href={`/dashboard/workouts/plans/new?preset=${recommended}`}
          badge="Recommended"
          tone="amber"
          title={recommendedInfo?.name ?? "Recommended split"}
          description={recommendedInfo?.description ?? ""}
          meta={`Based on ${trainingDays} training days and your current experience level.`}
        />
      </section>

      {/* ===================================================
          SPLITS
      =================================================== */}

      <section>
        <div className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-mf-glass-text-muted">
            Choose your structure
          </p>

          <h2 className="mt-2 text-2xl font-black text-mf-glass-text">
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
                className="group rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-5 transition hover:-translate-y-0.5 hover:border-mf-glass-brand-border hover:bg-white/4"
              >
                <div className="flex items-center justify-between gap-3">
                  {split.id ===
                  "custom" ? (
                    <Target className="h-5 w-5 text-mf-glass-brand" />
                  ) : (
                    <Layers3 className="h-5 w-5 text-mf-glass-text-muted transition group-hover:text-mf-glass-brand" />
                  )}

                  <ArrowRight className="h-4 w-4 text-mf-glass-text-muted transition group-hover:translate-x-1 group-hover:text-mf-glass-brand" />
                </div>

                <h3 className="mt-5 font-black text-mf-glass-text">
                  {
                    split.name
                  }
                </h3>

                <p className="mt-2 text-sm leading-6 text-mf-glass-text-muted">
                  {
                    split.description
                  }
                </p>

                <p className="mt-4 text-xs leading-5 text-mf-glass-text-muted">
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

            <h2 className="mt-2 text-2xl font-black text-mf-glass-text">
              wger public templates
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-mf-glass-text-muted">
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
            className="inline-flex items-center gap-2 text-xs font-semibold text-mf-glass-text-muted hover:text-emerald-400"
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
                  className="rounded-[20px] border border-emerald-500/15 bg-emerald-500/5 p-5 transition hover:-translate-y-0.5 hover:border-emerald-500/30 hover:bg-emerald-500/8"
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
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-mf-glass-text-muted">
                      {
                        template.description
                      }
                    </p>
                  ) : null}

                  <p className="mt-4 text-xs text-mf-glass-text-muted">
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
          <div className="rounded-[20px] border border-dashed border-mf-glass-border p-6 text-sm text-mf-glass-text-muted">
            External templates are
            temporarily unavailable.
            Built-in Muscle Fitness
            splits remain available.
          </div>
        )}

        <p className="mt-4 text-xs leading-5 text-mf-glass-text-muted">
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
          <p className="text-xs font-black uppercase tracking-[0.22em] text-mf-glass-text-muted">
            Saved plans
          </p>

          <h2 className="mt-2 text-2xl font-black text-mf-glass-text">
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
                  className="rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-5 transition hover:-translate-y-0.5 hover:border-mf-glass-border-strong"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold text-mf-glass-text">
                      {
                        plan.name
                      }
                    </h3>

                    <span className="text-[10px] font-black uppercase text-mf-glass-text-muted">
                      {
                        plan.status
                      }
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-mf-glass-text-muted">
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