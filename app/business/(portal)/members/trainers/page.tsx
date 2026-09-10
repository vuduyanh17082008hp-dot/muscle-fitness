import { UserRoundCog } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";

type StaffRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export default async function TrainersPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  const supabase = await createClient();

  const { data: staffData, error } = await supabase
    .from("business_staff")
    .select("id, user_id, role, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h1 className="font-semibold text-red-300">
            Unable to load trainers
          </h1>

          <p className="mt-2 text-sm text-red-300/80">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  const staff = (staffData ?? []) as StaffRow[];

  const userIds = staff.map((item) => item.user_id);

  let profiles: ProfileRow[] = [];

  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);

    profiles = (data ?? []) as ProfileRow[];
  }

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile])
  );

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <p className="text-sm font-medium text-zinc-500">
        TEAM MANAGEMENT
      </p>

      <h1 className="mt-2 text-3xl font-bold">
        Trainers & Staff
      </h1>

      <p className="mt-2 text-zinc-400">
        Manage coaches, trainers and business administrators.
      </p>

      <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {staff.length > 0 ? (
          <div className="divide-y divide-white/10">
            {staff.map((member) => {
              const profile = profileMap.get(member.user_id);

              const name =
                profile?.full_name ||
                profile?.email ||
                "Muscle Fitness Staff";

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-5 p-5 transition hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                      <UserRoundCog className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {name}
                      </p>

                      <p className="truncate text-sm text-zinc-500">
                        {profile?.email ?? member.user_id}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium capitalize text-zinc-300">
                    {member.role}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
            <UserRoundCog className="h-8 w-8 text-zinc-600" />

            <h2 className="mt-4 font-semibold">
              No staff yet
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Add trainers or staff members to this workspace.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}