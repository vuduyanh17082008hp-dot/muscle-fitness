import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library";
import { loadExerciseFamiliarity } from "@/lib/training/load-exercise-familiarity";
import { parseExperience } from "@/lib/training/exercise-substitution";
import { toExerciseRecord } from "@/lib/workouts/providers/local-provider";
import { parseMuscleParam } from "@/lib/workouts/library-params";
import { ExerciseBrowser } from "@/app/dashboard/workouts/library/exercise-browser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ExerciseLibraryPageProps = {
  searchParams: Promise<{
    muscle?: string | string[];
  }>;
};

/**
 * Exercise Discovery (Muscle Intelligence Phase 2). This page stays a
 * thin Server Component: it loads the one canonical exercise source
 * (LOCAL_EXERCISE_LIBRARY, normalized into ExerciseRecord — see
 * lib/workouts/providers/) plus the signed-in user's available
 * equipment, and reads the Muscle Atlas's `?muscle=` deep-link param.
 * All search/filter/pagination interaction lives client-side in
 * ExerciseBrowser — at this dataset size (tens of items) that's
 * simpler and feels more immediate than a server round-trip per
 * filter change.
 */
export default async function ExerciseLibraryPage({ searchParams }: ExerciseLibraryPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?next=${encodeURIComponent("/dashboard/workouts/library")}`);
  }

  const [{ data: fitness }, familiarSlugs] = await Promise.all([
    supabase.from("fitness_profiles").select("available_equipment, experience").eq("user_id", user.id).maybeSingle(),
    loadExerciseFamiliarity(supabase, user.id).catch(() => []),
  ]);

  const resolvedSearchParams = await searchParams;
  const initialMuscle = parseMuscleParam(resolvedSearchParams.muscle);

  const records = EXERCISE_CATALOGUE.map(toExerciseRecord);

  return (
    <ExerciseBrowser
      records={records}
      availableEquipment={fitness?.available_equipment ?? []}
      initialMuscle={initialMuscle}
      experience={parseExperience(fitness?.experience)}
      familiarSlugs={familiarSlugs}
    />
  );
}
