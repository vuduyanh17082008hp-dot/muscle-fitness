import Link from "next/link";
import { listPlans, listSessions } from "@/features/workout/store";

export default async function DashboardPage() {
  const [plans, sessions] = await Promise.all([listPlans(), listSessions()]);
  const inProgress = sessions.find((s) => s.status === "in_progress");
  const lastCompleted = sessions.find((s) => s.status === "completed");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-ink">
          Workout system
        </h1>
        <p className="mt-2 max-w-2xl text-steel">
          Luồng hoàn thành: Open workout → Log every set → Complete workout →
          Save database → View history → Next-session recommendation.
        </p>
      </div>

      {inProgress && (
        <Link
          href={`/dashboard/workout/${inProgress.id}`}
          className="block border border-lime bg-ink p-5 text-bone"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-lime">
            In progress
          </p>
          <p className="mt-2 font-display text-2xl">{inProgress.name}</p>
          <p className="mt-1 text-sm text-bone/70">Continue logging sets →</p>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/workouts"
          className="border border-ink/10 bg-bone p-5 hover:border-ink/30"
        >
          <p className="font-medium text-ink">Open workout</p>
          <p className="mt-1 text-sm text-steel">
            {plans.length} plan(s) ready
          </p>
        </Link>
        <Link
          href="/dashboard/plans"
          className="border border-ink/10 bg-bone p-5 hover:border-ink/30"
        >
          <p className="font-medium text-ink">Plan builder</p>
          <p className="mt-1 text-sm text-steel">Days, sets, RIR, tempo</p>
        </Link>
        <Link
          href="/dashboard/history"
          className="border border-ink/10 bg-bone p-5 hover:border-ink/30"
        >
          <p className="font-medium text-ink">History</p>
          <p className="mt-1 text-sm text-steel">
            {sessions.filter((s) => s.status === "completed").length} completed
          </p>
        </Link>
      </div>

      {lastCompleted && (
        <div className="border border-ink/10 bg-bone p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-steel">
            Last session
          </p>
          <p className="mt-2 text-lg font-medium text-ink">
            {lastCompleted.name}
          </p>
          <Link
            href={`/dashboard/workout/${lastCompleted.id}`}
            className="mt-2 inline-block text-sm text-lime-deep underline"
          >
            Xem recommendation
          </Link>
        </div>
      )}

      <Link
        href="/docs/workout-system"
        className="text-sm font-medium text-ink underline decoration-lime decoration-2 underline-offset-4"
      >
        Đọc hướng dẫn Dự án 09 (Tiếng Việt)
      </Link>
    </div>
  );
}
