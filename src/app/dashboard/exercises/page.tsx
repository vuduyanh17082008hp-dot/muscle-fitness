import { ExerciseLibrary } from "@/features/workout/exercise-library";
import { listExercises } from "@/features/workout/store";

export default async function ExercisesPage() {
  const exercises = await listExercises();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-ink">
          Exercise library
        </h1>
        <p className="mt-2 text-steel">
          Tên bài, nhóm cơ, equipment, difficulty, instructions, cues, media,
          contraindications.
        </p>
      </div>
      <ExerciseLibrary exercises={exercises} />
    </div>
  );
}
