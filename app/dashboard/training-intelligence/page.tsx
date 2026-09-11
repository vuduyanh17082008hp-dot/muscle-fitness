import { requireUser } from "@/lib/auth/guard";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { MuscleMapClient } from "@/components/training/muscle-map/MuscleMapClient";
import { PageVisual } from "@/components/visual/page-visual";

export const dynamic = "force-dynamic";

export default async function TrainingIntelligencePage() {
  const { supabase, userId } = await requireUser();
  const athleteState = await buildAthleteState(supabase, userId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 py-2">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-6 sm:p-8">
        <PageVisual page="trainingIntelligence" />

        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-400">
            Training Intelligence
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            What your training actually means, muscle by muscle.
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Working sets are matched against a versioned exercise→muscle
            contribution model to produce modeled effective weekly volume,
            personal-baseline comparisons and an explainable recommendation for
            every muscle — direct and indirect contribution kept separate.
          </p>
        </div>
      </section>

      <MuscleMapClient
        muscles={athleteState.training.muscles}
        exerciseNames={athleteState.training.exerciseNames}
        hasAnyLoggedData={athleteState.training.hasAnyLoggedData}
        dataWindow={athleteState.dataWindow}
      />
    </div>
  );
}
