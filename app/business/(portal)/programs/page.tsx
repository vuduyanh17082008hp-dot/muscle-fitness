import { Dumbbell, Plus } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { ErrorState } from "@/components/dashboard/error-state";

export default async function BusinessProgramsPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  const supabase = await createClient();

  const { data: programs, error } = await supabase
    .from("business_programs")
    .select("id, name, description, status, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("BUSINESS PROGRAMS ERROR:", error);

    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10">
        <ErrorState
          title="Unable to load programs"
          description="Something went wrong loading your training programs. Please try again."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-zinc-500">
            TRAINING MANAGEMENT
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Programs
          </h1>

          <p className="mt-2 text-zinc-400">
            Create and manage training programs for members.
          </p>
        </div>

        <button
          type="button"
          disabled
          title="Creating programs is coming soon"
          className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200/50 opacity-60"
        >
          <Plus className="h-4 w-4" />
          New Program
        </button>
      </div>

      {!programs?.length ? (
        <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-center">
          <Dumbbell className="h-8 w-8 text-zinc-600" />

          <h2 className="mt-4 font-semibold">
            No programs yet
          </h2>

          <p className="mt-2 text-sm text-zinc-500">
            Create your first training program for Muscle Fitness members.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => (
            <article
              key={program.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10"
            >
              <Dumbbell className="h-5 w-5 text-zinc-500" />

              <h2 className="mt-5 text-lg font-semibold">
                {program.name}
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {program.description || "No description provided."}
              </p>

              <div className="mt-6">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs capitalize text-zinc-300">
                  {program.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}