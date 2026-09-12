import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Filter,
  Search,
  Sparkles,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { PerformanceCard } from "@/components/ui/performance-card";
import {
  LOCAL_EXERCISE_LIBRARY,
  type ExerciseDifficulty,
  type ExerciseLibraryItem,
} from "@/lib/workouts/exercise-library";
import { ExerciseTechniquePanel } from "@/components/training/exercise-technique-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   TYPES
========================================================= */

type ExerciseLibraryPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    muscle?: string | string[];
    equipment?: string | string[];
    difficulty?: string | string[];
  }>;
};

/* =========================================================
   EXERCISE LIBRARY (canonical — see lib/workouts/exercise-library.ts)
========================================================= */

const EXERCISE_LIBRARY: ExerciseLibraryItem[] = LOCAL_EXERCISE_LIBRARY;

/* =========================================================
   HELPERS
========================================================= */

function getSearchParameter(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function uniqueSortedValues(
  values: string[],
): string[] {
  return [...new Set(values)].sort(
    (first, second) =>
      first.localeCompare(second),
  );
}

function getDifficultyClasses(
  difficulty: ExerciseDifficulty,
): string {
  switch (difficulty) {
    case "beginner":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";

    case "advanced":
      return "border-red-500/25 bg-red-500/10 text-red-300";

    default:
      return "border-orange-500/25 bg-orange-500/10 text-orange-300";
  }
}

function matchesSearch(
  exercise: ExerciseLibraryItem,
  query: string,
): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  const searchableText = [
    exercise.name,
    exercise.description,
    exercise.bodyPart,
    exercise.primaryMuscle,
    exercise.secondaryMuscles.join(" "),
    exercise.equipment,
    exercise.difficulty,
    exercise.movementPattern,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

/* =========================================================
   PAGE
========================================================= */

export default async function ExerciseLibraryPage({
  searchParams,
}: ExerciseLibraryPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      `/login?next=${encodeURIComponent(
        "/dashboard/workouts/library",
      )}`,
    );
  }

  const resolvedSearchParams = await searchParams;

  const query = getSearchParameter(
    resolvedSearchParams.q,
  );

  const muscle = getSearchParameter(
    resolvedSearchParams.muscle,
  );

  const equipment = getSearchParameter(
    resolvedSearchParams.equipment,
  );

  const difficulty = getSearchParameter(
    resolvedSearchParams.difficulty,
  );

  const muscleOptions = uniqueSortedValues(
    EXERCISE_LIBRARY.map(
      (exercise) => exercise.primaryMuscle,
    ),
  );

  const equipmentOptions = uniqueSortedValues(
    EXERCISE_LIBRARY.map(
      (exercise) => exercise.equipment,
    ),
  );

  const filteredExercises =
    EXERCISE_LIBRARY.filter((exercise) => {
      const matchesQuery = matchesSearch(
        exercise,
        query,
      );

      const matchesMuscle =
        !muscle ||
        muscle === "all" ||
        exercise.primaryMuscle === muscle;

      const matchesEquipment =
        !equipment ||
        equipment === "all" ||
        exercise.equipment === equipment;

      const matchesDifficulty =
        !difficulty ||
        difficulty === "all" ||
        exercise.difficulty === difficulty;

      return (
        matchesQuery &&
        matchesMuscle &&
        matchesEquipment &&
        matchesDifficulty
      );
    });

  const beginnerCount =
    EXERCISE_LIBRARY.filter(
      (exercise) =>
        exercise.difficulty === "beginner",
    ).length;

  const equipmentCount =
    equipmentOptions.length;

  const muscleCount =
    muscleOptions.length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      {/* Background */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="absolute right-[-240px] top-[-260px] h-[650px] w-[650px] rounded-full bg-orange-500/[0.07] blur-[150px]" />

        <div className="absolute bottom-[-320px] left-[-260px] h-[700px] w-[700px] rounded-full bg-red-500/[0.045] blur-[170px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,7,7,0.9)_82%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Navigation */}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/workouts"
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />

            Back to workouts
          </Link>

          <Link
            href="/dashboard/workouts/plans/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-400 px-5 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-300"
          >
            <Sparkles className="h-4 w-4" />

            Build workout plan
          </Link>
        </div>

        {/* Hero */}

        <header className="mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d]/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
                  <Dumbbell className="h-5 w-5 text-orange-400" />
                </span>

                <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
                  Exercise database
                </p>
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Exercise Library
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
                Explore exercises by muscle,
                equipment, difficulty and movement
                pattern before adding them to your
                training programme.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
                Available exercises
              </p>

              <p className="mt-2 text-3xl font-black text-orange-300">
                {EXERCISE_LIBRARY.length}
              </p>
            </div>
          </div>
        </header>

        {/* Statistics */}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PerformanceCard
            variant="training"
            icon="dumbbell"
            title="Exercises"
            metric={{ value: EXERCISE_LIBRARY.length }}
          />

          <PerformanceCard
            variant="training"
            icon="target"
            title="Primary muscles"
            metric={{ value: muscleCount }}
          />

          <PerformanceCard
            variant="training"
            icon="layers"
            title="Equipment types"
            metric={{ value: equipmentCount }}
          />

          <PerformanceCard
            variant="training"
            icon="check-circle"
            title="Beginner friendly"
            metric={{ value: beginnerCount }}
          />
        </section>

        {/* Filters */}

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
              <Filter className="h-5 w-5" />
            </span>

            <div>
              <h2 className="font-black">
                Filter exercises
              </h2>

              <p className="mt-1 text-xs text-zinc-600">
                Search by exercise, muscle or
                equipment.
              </p>
            </div>
          </div>

          <form
            action="/dashboard/workouts/library"
            method="get"
            className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5"
          >
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

              <input
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search exercise..."
                className="h-12 w-full rounded-xl border border-white/10 bg-black/40 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-700 hover:border-white/20 focus:border-orange-400/60 focus:ring-4 focus:ring-orange-500/10"
              />
            </label>

            <select
              name="muscle"
              defaultValue={muscle || "all"}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#111111] px-4 text-sm text-zinc-300 outline-none transition hover:border-white/20 focus:border-orange-400/60"
            >
              <option value="all">
                All muscles
              </option>

              {muscleOptions.map((option) => (
                <option
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              ))}
            </select>

            <select
              name="equipment"
              defaultValue={equipment || "all"}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#111111] px-4 text-sm text-zinc-300 outline-none transition hover:border-white/20 focus:border-orange-400/60"
            >
              <option value="all">
                All equipment
              </option>

              {equipmentOptions.map((option) => (
                <option
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              ))}
            </select>

            <select
              name="difficulty"
              defaultValue={difficulty || "all"}
              className="h-12 w-full rounded-xl border border-white/10 bg-[#111111] px-4 text-sm text-zinc-300 outline-none transition hover:border-white/20 focus:border-orange-400/60"
            >
              <option value="all">
                All levels
              </option>

              <option value="beginner">
                Beginner
              </option>

              <option value="intermediate">
                Intermediate
              </option>

              <option value="advanced">
                Advanced
              </option>
            </select>

            <div className="flex flex-col gap-3 md:col-span-2 xl:col-span-5 sm:flex-row">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-400 px-6 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-300"
              >
                <Search className="h-4 w-4" />

                Apply filters
              </button>

              <Link
                href="/dashboard/workouts/library"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-6 text-xs font-black uppercase tracking-[0.12em] text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                Clear filters
              </Link>
            </div>
          </form>
        </section>

        {/* Results heading */}

        <section className="mt-10">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.27em] text-orange-400">
                Exercise catalogue
              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">
                Available Exercises
              </h2>
            </div>

            <p className="text-sm text-zinc-600">
              {filteredExercises.length} of{" "}
              {EXERCISE_LIBRARY.length} exercises
            </p>
          </div>

          {filteredExercises.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-20 text-center">
              <Search className="mx-auto h-8 w-8 text-zinc-700" />

              <h3 className="mt-4 text-xl font-black text-zinc-300">
                No exercises found
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-zinc-600">
                Change your search term or remove
                some filters to see more exercises.
              </p>

              <Link
                href="/dashboard/workouts/library"
                className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-orange-400 px-5 text-xs font-black uppercase tracking-wider text-black transition hover:bg-orange-300"
              >
                Reset filters
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredExercises.map(
                (exercise) => (
                  <ExerciseCard
                    key={exercise.id ?? exercise.slug ?? exercise.name}
                    exercise={exercise}
                  />
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

type ExerciseCardProps = {
  exercise: ExerciseLibraryItem;
};

function ExerciseCard({
  exercise,
}: ExerciseCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] transition hover:-translate-y-1 hover:border-orange-500/25 hover:shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
      <div className="relative border-b border-white/10 p-5">
        <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-40 w-40 rounded-full bg-orange-500/[0.07] blur-3xl" />

        <div className="relative flex items-start justify-between gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
            <Dumbbell className="h-5 w-5" />
          </span>

          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${getDifficultyClasses(
              exercise.difficulty,
            )}`}
          >
            {exercise.difficulty}
          </span>
        </div>

        <h3 className="relative mt-5 text-xl font-black text-zinc-100">
          {exercise.name}
        </h3>

        <p className="relative mt-2 text-sm leading-6 text-zinc-600">
          {exercise.description}
        </p>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="grid grid-cols-2 gap-3">
          <ExerciseDetail
            label="Primary muscle"
            value={exercise.primaryMuscle}
          />

          <ExerciseDetail
            label="Equipment"
            value={exercise.equipment}
          />

          <ExerciseDetail
            label="Body part"
            value={exercise.bodyPart ?? "General"}
          />

          <ExerciseDetail
            label="Movement"
            value={exercise.movementPattern}
          />
        </div>

        {exercise.secondaryMuscles.length > 0 ? (
          <div className="mt-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-700">
              Secondary muscles
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {exercise.secondaryMuscles.map(
                (muscle) => (
                  <span
                    key={muscle}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-semibold text-zinc-500"
                  >
                    {muscle}
                  </span>
                ),
              )}
            </div>
          </div>
        ) : null}

        <details className="group/details mt-5 overflow-hidden rounded-xl border border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-500 transition hover:text-white">
            Technique guide

            <ChevronRight className="h-4 w-4 transition group-open/details:rotate-90" />
          </summary>

          <div className="space-y-5 border-t border-white/10 p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Instructions
              </p>

              <ol className="mt-3 space-y-2">
                {(exercise.instructions ?? []).map(
                  (instruction, index) => (
                    <li
                      key={instruction}
                      className="flex gap-3 text-xs leading-6 text-zinc-500"
                    >
                      <span className="font-black text-orange-400">
                        {index + 1}.
                      </span>

                      <span>{instruction}</span>
                    </li>
                  ),
                )}
              </ol>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-orange-400">
                Coaching cues
              </p>

              <ul className="mt-3 space-y-2">
                {(exercise.safetyCues ?? []).map(
                  (cue) => (
                    <li
                      key={cue}
                      className="flex gap-3 text-xs leading-6 text-zinc-500"
                    >
                      <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />

                      <span>{cue}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <ExerciseTechniquePanel exercise={exercise} />
          </div>
        </details>

        <div className="mt-auto pt-5">
          <Link
            href="/dashboard/workouts/plans/new"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 text-xs font-black uppercase tracking-[0.1em] text-orange-300 transition hover:bg-orange-500/20"
          >
            Add to a workout plan

            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

type ExerciseDetailProps = {
  label: string;
  value: string;
};

function ExerciseDetail({
  label,
  value,
}: ExerciseDetailProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-700">
        {label}
      </p>

      <p className="mt-1 line-clamp-2 text-xs font-bold text-zinc-400">
        {value}
      </p>
    </div>
  );
}