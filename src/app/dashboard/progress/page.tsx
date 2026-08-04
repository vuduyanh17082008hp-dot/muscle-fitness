import {
  adherenceRate,
  personalRecords,
  sessionVolume,
  weeklySetsPerMuscle,
} from "@/features/workout/calculations";
import { listExercises, listSessions } from "@/features/workout/store";

export default async function ProgressPage() {
  const [sessions, exercises] = await Promise.all([
    listSessions(),
    listExercises(),
  ]);
  const completed = sessions.filter((s) => s.status === "completed");
  const weeklySets = weeklySetsPerMuscle(completed, exercises, 1);
  const prs = personalRecords(completed, exercises);
  const adherence = adherenceRate(sessions);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-ink">
          Progression
        </h1>
        <p className="mt-2 text-steel">
          Volume load, weekly sets / muscle, PR, estimated 1RM, adherence,
          deload markers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border border-ink/10 bg-bone p-4">
          <p className="text-xs uppercase tracking-wider text-steel">Adherence</p>
          <p className="mt-2 font-display text-3xl text-ink">{adherence}%</p>
        </div>
        <div className="border border-ink/10 bg-bone p-4">
          <p className="text-xs uppercase tracking-wider text-steel">
            Completed
          </p>
          <p className="mt-2 font-display text-3xl text-ink">
            {completed.length}
          </p>
        </div>
        <div className="border border-ink/10 bg-bone p-4">
          <p className="text-xs uppercase tracking-wider text-steel">
            Last volume
          </p>
          <p className="mt-2 font-display text-3xl text-ink">
            {completed[0] ? sessionVolume(completed[0]) : 0}
            <span className="text-base text-steel"> kg</span>
          </p>
        </div>
      </div>

      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink">
          Weekly sets / muscle
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(weeklySets)
            .sort((a, b) => b[1] - a[1])
            .map(([muscle, sets]) => (
              <div
                key={muscle}
                className="flex items-center justify-between border border-ink/10 bg-bone px-3 py-2 text-sm"
              >
                <span className="capitalize text-ink">{muscle}</span>
                <span className="font-medium text-lime-deep">
                  {Math.round(sets * 10) / 10}
                </span>
              </div>
            ))}
          {!Object.keys(weeklySets).length && (
            <p className="text-sm text-steel">Hoàn thành workout để thấy volume.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl tracking-wide text-ink">
          Personal records (e1RM)
        </h2>
        <ul className="mt-3 divide-y divide-ink/10 border border-ink/10 bg-bone">
          {prs.map((pr) => (
            <li
              key={pr.exerciseId}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="font-medium text-ink">{pr.exerciseName}</span>
              <span className="text-steel">
                {pr.weightKg} kg × {pr.reps} · e1RM {pr.estimated1Rm} kg
              </span>
            </li>
          ))}
          {!prs.length && (
            <li className="px-4 py-6 text-sm text-steel">Chưa có PR.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
