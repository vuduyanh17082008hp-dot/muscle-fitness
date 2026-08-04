import { NextResponse } from "next/server";
import { listExercises, listSessions } from "@/features/workout/store";
import {
  adherenceRate,
  personalRecords,
  sessionVolume,
  weeklySetsPerMuscle,
} from "@/features/workout/calculations";

export async function GET() {
  const [sessions, exercises] = await Promise.all([
    listSessions(),
    listExercises(),
  ]);
  const completed = sessions.filter((s) => s.status === "completed");

  const weeklyVolume = completed
    .slice(0, 8)
    .reverse()
    .map((s) => ({
      id: s.id,
      name: s.name,
      date: s.completedAt ?? s.startedAt,
      volume: sessionVolume(s),
      deload: Boolean(s.deload),
    }));

  return NextResponse.json({
    adherence: adherenceRate(sessions),
    weeklySets: weeklySetsPerMuscle(completed, exercises, 1),
    personalRecords: personalRecords(completed, exercises),
    weeklyVolume,
    sessionCount: sessions.length,
    completedCount: completed.length,
  });
}
