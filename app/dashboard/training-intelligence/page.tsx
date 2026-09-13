import { requireUser } from "@/lib/auth/guard";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { MuscleMapClient } from "@/components/training/muscle-map/MuscleMapClient";
import { PageVisual } from "@/components/visual/page-visual";
import { DigitalTwinPanel } from "@/components/dante/digital-twin-panel";
import { loadDanteMemory } from "@/lib/dante-core/memory";
import { PerformanceCard } from "@/components/ui/performance-card";

export const dynamic = "force-dynamic";

function formatDelta(delta: number | null, unit = ""): string {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}${unit}`;
}

export default async function TrainingIntelligencePage() {
  const { supabase, userId } = await requireUser();
  const [athleteState, memory, fitnessResponse] = await Promise.all([
    buildAthleteState(supabase, userId),
    loadDanteMemory(supabase, userId),
    supabase.from("fitness_profiles").select("weight_kg").eq("user_id", userId).maybeSingle(),
  ]);

  const bodyWeightKg = fitnessResponse.data?.weight_kg ?? null;
  const { recoveryScore, trainingLoad } = athleteState.derived.baselineDeviations;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 py-2">
      <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-mf-surface-elevated via-mf-surface to-mf-bg p-6 sm:p-8">
        <PageVisual page="trainingIntelligence" />

        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mf-cyan">
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

      {/* =================================================
          METRIC-FIRST SUMMARY — real, already-computed
          figures only (personal-baseline deltas, not a
          fabricated aggregate "strength %"). Cyan/violet,
          per the Progress domain accent.
      ================================================= */}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PerformanceCard
          variant="progress"
          icon="target"
          eyebrow="Body Weight"
          title={bodyWeightKg !== null ? `${bodyWeightKg} kg` : "Not logged"}
          subtitle="From your profile"
        />
        <PerformanceCard
          variant="progress"
          icon="trending-up"
          eyebrow="Recovery vs. your normal"
          title={formatDelta(recoveryScore.delta)}
          subtitle={
            recoveryScore.sampleCount >= 5
              ? `Baseline from ${recoveryScore.sampleCount} check-ins`
              : "Not enough history yet"
          }
        />
        <PerformanceCard
          variant="recovery"
          icon="layers"
          eyebrow="Training Load vs. your normal"
          title={formatDelta(trainingLoad.delta, " sets")}
          subtitle={
            trainingLoad.sampleCount >= 5
              ? `Baseline from ${trainingLoad.sampleCount} weeks`
              : "Not enough history yet"
          }
        />
        <PerformanceCard
          variant="progress"
          icon="shield-check"
          eyebrow="Data Confidence"
          title={`${Math.round(athleteState.derived.overallConfidence * 100)}%`}
          subtitle="How well-grounded this state is"
        />
      </section>

      <MuscleMapClient
        muscles={athleteState.training.muscles}
        exerciseNames={athleteState.training.exerciseNames}
        hasAnyLoggedData={athleteState.training.hasAnyLoggedData}
        dataWindow={athleteState.dataWindow}
      />

      <DigitalTwinPanel athleteState={athleteState} memory={memory} />
    </div>
  );
}
