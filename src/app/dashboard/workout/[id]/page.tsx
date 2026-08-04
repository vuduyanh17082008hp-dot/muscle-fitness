import { WorkoutPlayer } from "@/features/workout/workout-player";
import {
  getSession,
  listExercises,
  listSessions,
} from "@/features/workout/store";
import { buildNextSessionRecommendation } from "@/features/workout/calculations";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function WorkoutSessionPage({ params }: Props) {
  const { id } = await params;
  const [session, exercises, sessions] = await Promise.all([
    getSession(id),
    listExercises(),
    listSessions(),
  ]);
  if (!session) notFound();

  const recommendation =
    session.status === "completed"
      ? buildNextSessionRecommendation(session, sessions, exercises)
      : null;

  return (
    <div className="mx-auto max-w-5xl">
      <WorkoutPlayer
        initialSession={session}
        exercises={exercises}
        initialRecommendation={recommendation}
      />
    </div>
  );
}
