import Link from "next/link";
import { listSessions } from "@/features/workout/store";
import { sessionVolume } from "@/features/workout/calculations";

export default async function HistoryPage() {
  const sessions = await listSessions();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-ink">
          Workout history
        </h1>
        <p className="mt-2 text-steel">
          Sessions đã lưu trong database (local JSON / Supabase khi cấu hình).
        </p>
      </div>
      <ul className="divide-y divide-ink/10 border border-ink/10 bg-bone">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              href={`/dashboard/workout/${s.id}`}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-mist"
            >
              <div>
                <p className="font-medium text-ink">{s.name}</p>
                <p className="text-xs text-steel">
                  {new Date(s.completedAt ?? s.startedAt).toLocaleString()}
                  {s.status === "completed"
                    ? ` · volume ${sessionVolume(s)} kg`
                    : ""}
                </p>
              </div>
              <span
                className={`text-xs uppercase tracking-wider ${
                  s.status === "completed"
                    ? "text-lime-deep"
                    : s.status === "in_progress"
                      ? "text-ink"
                      : "text-steel"
                }`}
              >
                {s.status}
              </span>
            </Link>
          </li>
        ))}
        {!sessions.length && (
          <li className="px-4 py-8 text-sm text-steel">
            Chưa có session.{" "}
            <Link href="/dashboard/workouts" className="underline">
              Open workout
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
