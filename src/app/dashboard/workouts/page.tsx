import { StartWorkoutPanel } from "@/features/workout/start-workout-panel";
import { listPlans, listSessions } from "@/features/workout/store";
import Link from "next/link";

export default async function WorkoutsPage() {
  const [plans, sessions] = await Promise.all([listPlans(), listSessions()]);
  const recent = sessions.slice(0, 5);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-ink">
          Open workout
        </h1>
        <p className="mt-2 text-steel">
          Start a day from your plan, then log weight / reps / RIR each set.
        </p>
      </div>
      <StartWorkoutPanel plans={plans} />
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-steel">
          Recent sessions
        </h2>
        <ul className="mt-3 divide-y divide-ink/10 border border-ink/10 bg-bone">
          {recent.map((s) => (
            <li key={s.id}>
              <Link
                href={`/dashboard/workout/${s.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-mist"
              >
                <span className="text-ink">{s.name}</span>
                <span className="text-steel">{s.status}</span>
              </Link>
            </li>
          ))}
          {!recent.length && (
            <li className="px-4 py-6 text-sm text-steel">No sessions yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
