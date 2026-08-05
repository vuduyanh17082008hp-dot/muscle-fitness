import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Dumbbell,
  Library,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import PlanBuilder, {
  type ExerciseLibraryItem,
} from "../../plan-builder";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   LOCAL EXERCISE LIBRARY
========================================================= */

const EXERCISE_LIBRARY: ExerciseLibraryItem[] =
  [
    {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Barbell Bench Press",
      description:
        "Compound horizontal press for building chest, shoulder and triceps strength.",
      primaryMuscle: "Chest",
      secondaryMuscles: [
        "Front Deltoids",
        "Triceps",
      ],
      equipment: "Barbell",
      difficulty: "intermediate",
      movementPattern:
        "Horizontal Push",
    },

    {
      id: "10000000-0000-4000-8000-000000000002",
      name: "Incline Dumbbell Press",
      description:
        "Incline pressing movement that places greater emphasis on the upper chest.",
      primaryMuscle: "Upper Chest",
      secondaryMuscles: [
        "Front Deltoids",
        "Triceps",
      ],
      equipment: "Dumbbells",
      difficulty: "intermediate",
      movementPattern: "Incline Push",
    },

    {
      id: "10000000-0000-4000-8000-000000000003",
      name: "Machine Chest Press",
      description:
        "Stable machine press for controlled chest training.",
      primaryMuscle: "Chest",
      secondaryMuscles: [
        "Front Deltoids",
        "Triceps",
      ],
      equipment: "Machine",
      difficulty: "beginner",
      movementPattern:
        "Horizontal Push",
    },

    {
      id: "10000000-0000-4000-8000-000000000004",
      name: "Cable Fly",
      description:
        "Chest isolation exercise with continuous cable tension.",
      primaryMuscle: "Chest",
      secondaryMuscles: [
        "Front Deltoids",
      ],
      equipment: "Cable",
      difficulty: "beginner",
      movementPattern:
        "Horizontal Adduction",
    },

    {
      id: "10000000-0000-4000-8000-000000000005",
      name: "Barbell Overhead Press",
      description:
        "Vertical compound press for shoulder and triceps strength.",
      primaryMuscle: "Shoulders",
      secondaryMuscles: [
        "Triceps",
        "Upper Chest",
        "Core",
      ],
      equipment: "Barbell",
      difficulty: "intermediate",
      movementPattern: "Vertical Push",
    },

    {
      id: "10000000-0000-4000-8000-000000000006",
      name: "Cable Lateral Raise",
      description:
        "Isolation exercise for developing the side deltoids.",
      primaryMuscle:
        "Side Deltoids",
      secondaryMuscles: [
        "Upper Trapezius",
      ],
      equipment: "Cable",
      difficulty: "beginner",
      movementPattern:
        "Shoulder Abduction",
    },

    {
      id: "10000000-0000-4000-8000-000000000007",
      name: "Reverse Pec Deck",
      description:
        "Machine movement for rear-deltoid and upper-back development.",
      primaryMuscle:
        "Rear Deltoids",
      secondaryMuscles: [
        "Rhomboids",
        "Middle Trapezius",
      ],
      equipment: "Machine",
      difficulty: "beginner",
      movementPattern:
        "Horizontal Abduction",
    },

    {
      id: "10000000-0000-4000-8000-000000000008",
      name: "Lat Pulldown",
      description:
        "Vertical pulling exercise for developing the lats and upper back.",
      primaryMuscle:
        "Latissimus Dorsi",
      secondaryMuscles: [
        "Biceps",
        "Rear Deltoids",
        "Upper Back",
      ],
      equipment: "Cable",
      difficulty: "beginner",
      movementPattern: "Vertical Pull",
    },

    {
      id: "10000000-0000-4000-8000-000000000009",
      name: "Chest-Supported Row",
      description:
        "Supported row for upper-back development with reduced lower-back fatigue.",
      primaryMuscle: "Upper Back",
      secondaryMuscles: [
        "Latissimus Dorsi",
        "Biceps",
        "Rear Deltoids",
      ],
      equipment: "Dumbbells",
      difficulty: "beginner",
      movementPattern:
        "Horizontal Pull",
    },

    {
      id: "10000000-0000-4000-8000-000000000010",
      name: "Seated Cable Row",
      description:
        "Horizontal cable row for the lats, upper back and biceps.",
      primaryMuscle: "Upper Back",
      secondaryMuscles: [
        "Latissimus Dorsi",
        "Biceps",
        "Rear Deltoids",
      ],
      equipment: "Cable",
      difficulty: "beginner",
      movementPattern:
        "Horizontal Pull",
    },

    {
      id: "10000000-0000-4000-8000-000000000011",
      name: "Barbell Back Squat",
      description:
        "Compound lower-body movement for strength and muscle development.",
      primaryMuscle: "Quadriceps",
      secondaryMuscles: [
        "Glutes",
        "Hamstrings",
        "Core",
      ],
      equipment: "Barbell",
      difficulty: "intermediate",
      movementPattern: "Squat",
    },

    {
      id: "10000000-0000-4000-8000-000000000012",
      name: "Leg Press",
      description:
        "Machine-based compound movement for lower-body hypertrophy.",
      primaryMuscle: "Quadriceps",
      secondaryMuscles: [
        "Glutes",
        "Hamstrings",
      ],
      equipment: "Machine",
      difficulty: "beginner",
      movementPattern: "Squat",
    },

    {
      id: "10000000-0000-4000-8000-000000000013",
      name: "Romanian Deadlift",
      description:
        "Hip-hinge movement for the hamstrings, glutes and posterior chain.",
      primaryMuscle: "Hamstrings",
      secondaryMuscles: [
        "Glutes",
        "Erector Spinae",
        "Forearms",
      ],
      equipment: "Barbell",
      difficulty: "intermediate",
      movementPattern: "Hip Hinge",
    },

    {
      id: "10000000-0000-4000-8000-000000000014",
      name: "Seated Leg Curl",
      description:
        "Isolation exercise for developing the hamstrings.",
      primaryMuscle: "Hamstrings",
      secondaryMuscles: [
        "Gastrocnemius",
      ],
      equipment: "Machine",
      difficulty: "beginner",
      movementPattern:
        "Knee Flexion",
    },

    {
      id: "10000000-0000-4000-8000-000000000015",
      name: "Bulgarian Split Squat",
      description:
        "Single-leg exercise for lower-body strength, balance and hypertrophy.",
      primaryMuscle: "Quadriceps",
      secondaryMuscles: [
        "Glutes",
        "Hamstrings",
        "Core",
      ],
      equipment: "Dumbbells",
      difficulty: "intermediate",
      movementPattern:
        "Single-Leg Squat",
    },

    {
      id: "10000000-0000-4000-8000-000000000016",
      name: "Standing Calf Raise",
      description:
        "Controlled ankle plantar-flexion exercise for calf development.",
      primaryMuscle: "Calves",
      secondaryMuscles: [],
      equipment: "Machine",
      difficulty: "beginner",
      movementPattern:
        "Plantar Flexion",
    },

    {
      id: "10000000-0000-4000-8000-000000000017",
      name: "EZ-Bar Curl",
      description:
        "Elbow-flexion exercise for building the biceps and brachialis.",
      primaryMuscle: "Biceps",
      secondaryMuscles: [
        "Brachialis",
        "Forearms",
      ],
      equipment: "EZ Bar",
      difficulty: "beginner",
      movementPattern:
        "Elbow Flexion",
    },

    {
      id: "10000000-0000-4000-8000-000000000018",
      name: "Incline Dumbbell Curl",
      description:
        "Biceps curl variation that loads the muscle in a lengthened position.",
      primaryMuscle: "Biceps",
      secondaryMuscles: [
        "Brachialis",
        "Forearms",
      ],
      equipment: "Dumbbells",
      difficulty: "intermediate",
      movementPattern:
        "Elbow Flexion",
    },

    {
      id: "10000000-0000-4000-8000-000000000019",
      name: "Cable Triceps Pushdown",
      description:
        "Cable isolation movement for developing the triceps.",
      primaryMuscle: "Triceps",
      secondaryMuscles: [],
      equipment: "Cable",
      difficulty: "beginner",
      movementPattern:
        "Elbow Extension",
    },

    {
      id: "10000000-0000-4000-8000-000000000020",
      name:
        "Overhead Cable Triceps Extension",
      description:
        "Overhead extension that emphasises the long head of the triceps.",
      primaryMuscle: "Triceps",
      secondaryMuscles: [],
      equipment: "Cable",
      difficulty: "intermediate",
      movementPattern:
        "Elbow Extension",
    },

    {
      id: "10000000-0000-4000-8000-000000000021",
      name: "Cable Crunch",
      description:
        "Weighted abdominal exercise using controlled spinal flexion.",
      primaryMuscle: "Abdominals",
      secondaryMuscles: [
        "Obliques",
      ],
      equipment: "Cable",
      difficulty: "beginner",
      movementPattern:
        "Spinal Flexion",
    },

    {
      id: "10000000-0000-4000-8000-000000000022",
      name: "Hanging Knee Raise",
      description:
        "Core movement combining hip flexion and controlled pelvic movement.",
      primaryMuscle: "Abdominals",
      secondaryMuscles: [
        "Hip Flexors",
        "Forearms",
      ],
      equipment: "Pull-Up Bar",
      difficulty: "intermediate",
      movementPattern: "Hip Flexion",
    },
  ];

/* =========================================================
   PAGE
========================================================= */

export default async function NewWorkoutPlanPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(
      `/login?next=${encodeURIComponent(
        "/dashboard/workouts/plans/new",
      )}`,
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070707] px-4 py-8 text-white sm:px-6 lg:px-10">
      {/* BACKGROUND */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="absolute right-[-200px] top-[-240px] h-[620px] w-[620px] rounded-full bg-orange-500/[0.08] blur-[150px]" />

        <div className="absolute bottom-[-320px] left-[-240px] h-[680px] w-[680px] rounded-full bg-red-500/[0.05] blur-[170px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,7,7,0.9)_82%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* NAVIGATION */}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <Link
            href="/dashboard/workouts"
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />

            Back to workouts
          </Link>

          <Link
            href="/dashboard/workouts/library"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-xs font-black uppercase tracking-[0.12em] text-zinc-300 transition hover:border-orange-500/30 hover:bg-orange-500/10 hover:text-orange-300"
          >
            <Library className="h-4 w-4" />

            Exercise library
          </Link>
        </div>

        {/* HEADER */}

        <header className="mt-8 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d]/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10">
                  <Dumbbell className="h-5 w-5 text-orange-400" />
                </span>

                <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
                  Programme builder
                </p>
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Build a new workout plan
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-500 sm:text-base">
                Create workout days, choose
                exercises and configure sets,
                repetitions, rest periods,
                tempo and RIR.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[370px] lg:grid-cols-1">
              <InfoCard
                icon={
                  <Sparkles className="h-4 w-4" />
                }
                title={`${EXERCISE_LIBRARY.length} exercises available`}
                description="The integrated library works without the missing exercise_library database table."
              />

              <InfoCard
                icon={
                  <ShieldCheck className="h-4 w-4" />
                }
                title="Private account data"
                description="The saved workout plan will belong to your authenticated account."
              />
            </div>
          </div>
        </header>

        {/* PLAN BUILDER */}

        <section className="mt-8">
          <PlanBuilder
            clientId={user.id}
            exercises={EXERCISE_LIBRARY}
          />
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   INFO CARD
========================================================= */

type InfoCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
};

function InfoCard({
  icon,
  title,
  description,
}: InfoCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center gap-2 text-orange-400">
        {icon}

        <p className="text-xs font-black uppercase tracking-wider">
          {title}
        </p>
      </div>

      <p className="mt-2 text-xs leading-6 text-zinc-600">
        {description}
      </p>
    </article>
  );
}