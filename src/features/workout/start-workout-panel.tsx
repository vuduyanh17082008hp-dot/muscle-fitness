"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkoutPlan } from "@/features/workout/types";

export function StartWorkoutPanel({ plans }: { plans: WorkoutPlan[] }) {
  const router = useRouter();
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const [dayId, setDayId] = useState(plan?.days[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!planId || !dayId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, dayId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start");
      router.push(`/dashboard/workout/${data.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
      setBusy(false);
    }
  }

  if (!plans.length) {
    return (
      <p className="text-sm text-steel">
        No plans yet.{" "}
        <Link href="/dashboard/plans" className="underline">
          Create a plan
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="border border-ink/10 bg-bone p-5">
      <h2 className="font-display text-2xl tracking-wide text-ink">
        Open workout
      </h2>
      <p className="mt-1 text-sm text-steel">
        Pick a plan day, then log every set until you finish.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-steel">
          Plan
          <select
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              const next = plans.find((p) => p.id === e.target.value);
              setDayId(next?.days[0]?.id ?? "");
            }}
            className="mt-1 w-full border border-ink/15 bg-mist px-3 py-2 text-sm text-ink"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-steel">
          Day
          <select
            value={dayId}
            onChange={(e) => setDayId(e.target.value)}
            className="mt-1 w-full border border-ink/15 bg-mist px-3 py-2 text-sm text-ink"
          >
            {(plan?.days ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.exercises.length} exercises)
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy || !dayId}
        onClick={start}
        className="mt-4 bg-lime px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
      >
        {busy ? "Starting..." : "Start workout"}
      </button>
    </div>
  );
}
