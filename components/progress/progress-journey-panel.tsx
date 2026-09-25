import { MotivationLine } from "@/components/motivation/motivation-line";
import type { ProgressJourney } from "@/lib/progress/types";

export function ProgressJourneyPanel({ journey }: { journey: ProgressJourney }) {
  const empty = journey.weeklySnapshots.length === 0;

  return (
    <div className="space-y-6">
      <section className="rounded-[20px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-brand">
          Your journey
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight text-mf-glass-text">
          {empty ? "Journey not started yet" : `Week ${journey.currentWeek}`}
        </h2>
        {!empty ? (
          <p className="mt-4 text-sm text-mf-glass-text-secondary">
            {journey.currentStreak} day consistency streak
            <span className="mx-2 text-mf-glass-text-muted">·</span>
            Longest: {journey.longestStreak} days
          </p>
        ) : (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">
            Planned sessions, rest days, and check-ins will show up here once they are logged.
          </p>
        )}
        <MotivationLine
          contexts={
            journey.milestones.some((item) => item.type === "RETURN_AFTER_MISS")
              ? ["RETURN_AFTER_MISS"]
              : journey.milestones.some((item) => item.type === "ADHERENCE_IMPROVED")
                ? ["ADHERENCE_IMPROVED"]
                : journey.milestones.length > 0
                  ? ["MILESTONE_REACHED"]
                  : journey.currentStreak > 0
                    ? ["STREAK_INCREASED"]
                    : []
          }
        />
      </section>

      {!empty ? (
        <section className="rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
          <h3 className="text-lg font-bold text-mf-glass-text">Weekly journey</h3>
          <ol className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {journey.weeklySnapshots.map((week, index) => (
              <li key={week.snapshotId} className="inline-flex items-center gap-2">
                <span className="rounded-full border border-mf-glass-border px-3 py-1 text-mf-glass-text">
                  W{week.weekIndex}
                </span>
                {index < journey.weeklySnapshots.length - 1 ? (
                  <span className="text-mf-glass-text-muted" aria-hidden="true">
                    —
                  </span>
                ) : (
                  <span className="text-xs font-bold uppercase tracking-wide text-mf-glass-brand">
                    You
                  </span>
                )}
              </li>
            ))}
          </ol>
          <ul className="mt-5 space-y-3">
            {journey.weeklySnapshots.map((week) => (
              <li key={`${week.snapshotId}-copy`} className="text-sm leading-6 text-mf-glass-text-secondary">
                <span className="font-semibold text-mf-glass-text">Week {week.weekIndex}. </span>
                {week.plannedSessions > 0
                  ? `${week.completedSessions} of ${week.plannedSessions} planned sessions completed.`
                  : "No required sessions in this week."}
                {week.recoveryCheckins !== undefined
                  ? ` ${week.recoveryCheckins} recovery check-in${week.recoveryCheckins === 1 ? "" : "s"}.`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {journey.milestones.length > 0 ? (
        <section className="rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
          <h3 className="text-lg font-bold text-mf-glass-text">Milestones</h3>
          <ul className="mt-4 space-y-3">
            {journey.milestones.map((milestone) => (
              <li key={milestone.milestoneId}>
                <p className="text-sm font-semibold text-mf-glass-text">{milestone.displayData.title}</p>
                {milestone.displayData.description ? (
                  <p className="text-sm text-mf-glass-text-muted">{milestone.displayData.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {journey.thenVsNow.length > 0 ? (
        <section className="rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
          <h3 className="text-lg font-bold text-mf-glass-text">Then vs now</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {journey.thenVsNow.map((item) => (
              <article key={item.metricId} className="rounded-2xl border border-mf-glass-border px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-mf-glass-text-muted">{item.label}</p>
                <p className="mt-2 text-sm text-mf-glass-text-secondary">
                  {item.thenLabel}: {item.thenValue}
                  {item.unit ?? ""}
                </p>
                <p className="text-sm font-semibold text-mf-glass-text">
                  {item.nowLabel}: {item.nowValue}
                  {item.unit ?? ""}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : journey.weeklySnapshots.length > 0 ? (
        <p className="text-sm text-mf-glass-text-muted">
          We need a little more logged history before we can compare your journey.
        </p>
      ) : null}

      <section className="rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-6">
        <h3 className="text-lg font-bold text-mf-glass-text">Dante progress summary</h3>
        <p className="mt-3 text-sm leading-6 text-mf-glass-text-secondary">{journey.groundedSummary}</p>
      </section>
    </div>
  );
}
