import { createPlan, listPlans } from "@/features/workout/store";
import Link from "next/link";

export default async function PlansPage() {
  let plans = await listPlans();
  if (!plans.length) {
    await createPlan({
      name: "My first plan",
      description: "Edit days and exercises in the builder.",
    });
    plans = await listPlans();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-ink">
          Workout plan builder
        </h1>
        <p className="mt-2 text-steel">
          Tạo plan, chia ngày, chọn bài, sets / rep range / RIR·RPE / rest /
          tempo / coach notes. Kéo thả và duplicate day.
        </p>
      </div>
      <ul className="divide-y divide-ink/10 border border-ink/10 bg-bone">
        {plans.map((plan) => (
          <li key={plan.id}>
            <Link
              href={`/dashboard/plans/${plan.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-mist"
            >
              <div>
                <p className="font-medium text-ink">{plan.name}</p>
                <p className="text-sm text-steel">
                  {plan.days.length} day(s) · {plan.description || "No description"}
                </p>
              </div>
              <span className="text-sm text-lime-deep">Edit →</span>
            </Link>
          </li>
        ))}
      </ul>
      <form
        action={async () => {
          "use server";
          const { createPlanAction } = await import(
            "@/features/workout/actions"
          );
          await createPlanAction({ name: `Plan ${plans.length + 1}` });
        }}
      >
        <button
          type="submit"
          className="bg-ink px-4 py-2 text-sm font-semibold text-lime"
        >
          + New plan
        </button>
      </form>
    </div>
  );
}
