import { PlanBuilder } from "@/features/workout/plan-builder";
import { getPlan, listExercises } from "@/features/workout/store";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function PlanEditorPage({ params }: Props) {
  const { id } = await params;
  const [plan, exercises] = await Promise.all([getPlan(id), listExercises()]);
  if (!plan) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/dashboard/plans"
        className="text-sm text-steel hover:text-ink"
      >
        ← All plans
      </Link>
      <PlanBuilder initialPlan={plan} exercises={exercises} />
    </div>
  );
}
