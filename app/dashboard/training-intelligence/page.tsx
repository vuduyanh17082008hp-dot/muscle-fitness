import { requireUser } from "@/lib/auth/guard";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { MuscleMapClient } from "@/components/training/muscle-map/MuscleMapClient";
import { DigitalTwinPanel } from "@/components/dante/digital-twin-panel";
import { loadDanteMemory } from "@/lib/dante-core/memory";
import { PerformanceCard } from "@/components/ui/performance-card";
import { SectionTabs } from "@/components/dashboard/section-tabs";
import { TRAIN_TABS } from "@/components/dashboard/train-tabs";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { resolveUserTimeZone } from "@/lib/training/load-today-session";
import { buildMuscleIntelligence, MUSCLE_RANGES, type MuscleRangeId } from "@/lib/training/muscle-intelligence";
import { parseExperience } from "@/lib/training/exercise-substitution";
import { parseMuscleParam } from "@/lib/workouts/library-params";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ muscle?: string | string[]; range?: string | string[]; session?: string | string[] }>;
};

function formatDelta(delta: number | null, unit = ""): string {
  if (delta === null) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}${unit}`;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function TrainingIntelligencePage({ searchParams }: PageProps) {
  const { supabase, userId } = await requireUser();
  const params = await searchParams;
  const timeZone = await resolveUserTimeZone(supabase, userId);
  const trainingContext = await loadTrainingContext(supabase, userId, { timeZone });

  const [athleteState, memory, fitnessResponse, inProgress] = await Promise.all([
    buildAthleteState(supabase, userId, { timeZone, trainingContext }),
    loadDanteMemory(supabase, userId),
    supabase.from("fitness_profiles").select("weight_kg").eq("user_id", userId).maybeSingle(),
    supabase.from("workout_sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("session_state", "in_progress"),
  ]);

  const data = buildMuscleIntelligence({
    today: trainingContext.dataWindow.endDate,
    loggedSets: trainingContext.loggedSets,
    completedSessions: trainingContext.completedSessions,
    contributionsByExercise: trainingContext.contributionsByExercise,
  });

  const loggedExerciseIds = new Set(
    trainingContext.loggedSets.filter((set) => set.completed && set.setType !== "warmup").map((set) => set.exerciseId),
  );
  const familiarSlugs = [...loggedExerciseIds].flatMap((id) => {
    const slug = trainingContext.exercisesById.get(id)?.slug;
    return slug ? [slug] : [];
  });

  const rangeParam = first(params.range);
  const initialRange = MUSCLE_RANGES.some((r) => r.id === rangeParam) ? (rangeParam as MuscleRangeId) : "28d";

  const bodyWeightKg = fitnessResponse.data?.weight_kg ?? null;
  const { recoveryScore, trainingLoad } = athleteState.derived.baselineDeviations;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-1 py-2">
      <SectionTabs tabs={TRAIN_TABS} />

      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-mf-glass-text-muted">Muscle Intelligence</p>
        <h1 className="text-2xl font-black tracking-tight text-mf-glass-text sm:text-3xl">Your training, muscle by muscle.</h1>
        <p className="max-w-2xl text-sm leading-6 text-mf-glass-text-muted">
          Built from the working sets you logged in finished workouts. Pick a muscle to see what trained it, which exercises fit, and practical alternatives.
        </p>
      </header>

      <MuscleMapClient
        data={data}
        experience={parseExperience(athleteState.profile.experience)}
        familiarSlugs={familiarSlugs}
        // No start/apply action exists on this page; the hold is enforced where one does
        // (active workout + DB trigger), so the alternatives here are reference only.
        hold={false}
        inProgressWorkouts={inProgress.count ?? 0}
        initialMuscle={parseMuscleParam(params.muscle)}
        initialRange={initialRange}
        initialSessionId={first(params.session) ?? null}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PerformanceCard
          glass
          variant="progress"
          icon="target"
          eyebrow="Body Weight"
          title={bodyWeightKg !== null ? `${bodyWeightKg} kg` : "Not logged"}
          subtitle="From your profile"
        />
        <PerformanceCard
          glass
          variant="progress"
          icon="trending-up"
          eyebrow="Recovery vs. your normal"
          title={formatDelta(recoveryScore.delta)}
          subtitle={recoveryScore.sampleCount >= 5 ? `Baseline from ${recoveryScore.sampleCount} check-ins` : "Not enough history yet"}
        />
        <PerformanceCard
          glass
          variant="recovery"
          icon="layers"
          eyebrow="Training Load vs. your normal"
          title={formatDelta(trainingLoad.delta, " sets")}
          subtitle={trainingLoad.sampleCount >= 5 ? `Baseline from ${trainingLoad.sampleCount} weeks` : "Not enough history yet"}
        />
        <PerformanceCard
          glass
          variant="progress"
          icon="shield-check"
          eyebrow="Data Confidence"
          title={`${Math.round(athleteState.derived.overallConfidence * 100)}%`}
          subtitle="How well-grounded this state is"
        />
      </section>

      <DigitalTwinPanel athleteState={athleteState} memory={memory} />
    </div>
  );
}
