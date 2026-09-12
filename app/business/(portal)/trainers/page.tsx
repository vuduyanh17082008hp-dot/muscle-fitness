import {
  UserRoundCog,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { PerformanceCard } from "@/components/ui/performance-card";
import { EmptyState } from "@/components/dashboard/empty-state";

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
  avatar_url: string | null;
};

export default async function TrainersPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  const supabase = await createClient();

  // ============================================================
  // 1. LOAD BUSINESS STAFF
  // ============================================================

  const {
    data: staffData,
    error: staffError,
  } = await supabase
    .from("business_staff")
    .select(
      `
        id,
        user_id,
        role,
        created_at
      `
    )
    .eq("business_id", business.id)
    .order("created_at", {
      ascending: true,
    });

  if (staffError) {
    console.warn(
      "Unable to load business staff:",
      staffError.message
    );

    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
          <h1 className="text-lg font-semibold text-red-300">
            Unable to load trainers
          </h1>

          <p className="mt-2 text-sm leading-6 text-red-300/80">
            {staffError.message}
          </p>
        </div>
      </div>
    );
  }

  const staff = (staffData ?? []) as StaffRow[];

  // ============================================================
  // 2. LOAD RELATED PROFILES
  // ============================================================

  const userIds = staff.map(
    (member) => member.user_id
  );

  let profiles: ProfileRow[] = [];

  if (userIds.length > 0) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(
        `
          id,
          full_name,
          email,
          avatar_url
        `
      )
      .in("id", userIds);

    if (profileError) {
      /*
       * Use warn instead of console.error so Next.js dev mode
       * does not show a full-screen error overlay for a
       * recoverable profile lookup failure.
       */
      console.warn(
        "Trainer profiles could not be loaded:",
        profileError.message
      );
    } else {
      profiles =
        (profileData ?? []) as ProfileRow[];
    }
  }

  // ============================================================
  // 3. PROFILE LOOKUP MAP
  // ============================================================

  const profileMap = new Map<string, ProfileRow>(
    profiles.map((profile) => [
      profile.id,
      profile,
    ])
  );

  // ============================================================
  // 4. COUNTS
  // ============================================================

  const trainerCount = staff.filter(
    (member) => member.role === "trainer"
  ).length;

  const adminCount = staff.filter(
    (member) =>
      member.role === "admin" ||
      member.role === "owner"
  ).length;

  // ============================================================
  // 5. UI
  // ============================================================

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium tracking-wide text-zinc-500">
            TEAM MANAGEMENT
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Trainers & Staff
          </h1>

          <p className="mt-2 max-w-2xl text-zinc-400">
            Manage coaches, trainers and administrators
            working within {business.name}.
          </p>
        </div>

        <button
          type="button"
          disabled
          title="Inviting trainers is coming soon"
          className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200/50 opacity-60"
        >
          <UserRoundCog className="h-4 w-4" />

          Add Trainer
        </button>
      </div>

      {/* ========================================================
          STATS
      ======================================================== */}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <PerformanceCard icon="users" title="Team Members" metric={{ value: staff.length }} />
        <PerformanceCard icon="user-cog" title="Trainers" metric={{ value: trainerCount }} />
        <PerformanceCard icon="shield-check" title="Admins" metric={{ value: adminCount }} />
      </div>

      {/* ========================================================
          DIRECTORY
      ======================================================== */}

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 p-5">
          <h2 className="font-semibold">
            Team Directory
          </h2>

          <p className="mt-1 text-sm text-zinc-500">
            {staff.length} team member
            {staff.length === 1 ? "" : "s"}
          </p>
        </div>

        {staff.length === 0 ? (
          <EmptyState
            icon={UserRoundCog}
            title="No trainers or staff yet"
            description="Add trainers and staff to manage members, training programs and business operations."
          />
        ) : (
          <div className="divide-y divide-white/10">
            {staff.map((member) => {
              const profile =
                profileMap.get(member.user_id);

              const displayName =
                profile?.full_name ||
                profile?.email ||
                getFallbackName(member.role);

              return (
                <div
                  key={member.id}
                  className="flex flex-col justify-between gap-5 p-5 transition hover:bg-white/10 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar
                      profile={profile}
                      displayName={displayName}
                    />

                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">
                        {displayName}
                      </p>

                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {profile?.email ??
                          "Profile information unavailable"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <RoleBadge
                      role={member.role}
                    />

                    <p className="hidden text-xs text-zinc-600 md:block">
                      Joined{" "}
                      {formatDate(
                        member.created_at
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================
// AVATAR
// ============================================================

function Avatar({
  profile,
  displayName,
}: {
  profile: ProfileRow | undefined;
  displayName: string;
}) {
  if (profile?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt={`${displayName} avatar`}
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
      {displayName
        .charAt(0)
        .toUpperCase()}
    </div>
  );
}

// ============================================================
// ROLE BADGE
// ============================================================

function RoleBadge({
  role,
}: {
  role: string;
}) {
  let classes =
    "bg-zinc-500/10 text-zinc-300";

  if (role === "owner") {
    classes =
      "bg-purple-500/10 text-purple-300";
  } else if (role === "admin") {
    classes =
      "bg-blue-500/10 text-blue-300";
  } else if (role === "trainer") {
    classes =
      "bg-emerald-500/10 text-emerald-300";
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${classes}`}
    >
      {role}
    </span>
  );
}


// ============================================================
// HELPERS
// ============================================================

function getFallbackName(
  role: string
) {
  if (role === "owner") {
    return "Business Owner";
  }

  if (role === "admin") {
    return "Business Admin";
  }

  if (role === "trainer") {
    return "Trainer";
  }

  return "Staff Member";
}

function formatDate(
  date: string
) {
  return new Intl.DateTimeFormat(
    "en",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(new Date(date));
}