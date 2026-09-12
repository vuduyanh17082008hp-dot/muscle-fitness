import {
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { PerformanceCard } from "@/components/ui/performance-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/error-state";

type MemberRow = {
  id: string;
  user_id: string;
  status: string;
  membership_type: string | null;
  joined_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type MembersPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function BusinessMembersPage({
  searchParams,
}: MembersPageProps) {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  const { q: query = "" } = await searchParams;

  const supabase = await createClient();

  const { data: members, error: membersError } = await supabase
    .from("business_members")
    .select(
      `
        id,
        user_id,
        status,
        membership_type,
        joined_at
      `
    )
    .eq("business_id", business.id)
    .order("joined_at", { ascending: false });

  if (membersError) {
    console.error("BUSINESS MEMBERS ERROR:", membersError);

    return (
      <div className="mx-auto max-w-7xl p-6 lg:p-10">
        <ErrorState
          title="Unable to load members"
          description="Something went wrong loading your member directory. Please try again."
        />
      </div>
    );
  }

  const memberRows = (members ?? []) as MemberRow[];

  const userIds = memberRows.map((member) => member.user_id);

  let profiles: Profile[] = [];

  if (userIds.length > 0) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", userIds);

    if (profileError) {
      console.error("BUSINESS MEMBER PROFILE ERROR:", profileError);
    } else {
      profiles = (profileData ?? []) as Profile[];
    }
  }

  const profileMap = new Map(
    profiles.map((profile) => [profile.id, profile])
  );

  const enrichedMembers = memberRows.map((member) => ({
    ...member,
    profile: profileMap.get(member.user_id) ?? null,
  }));

  const activeMembers = enrichedMembers.filter(
    (member) => member.status === "active"
  ).length;

  const pendingMembers = enrichedMembers.filter(
    (member) => member.status === "pending"
  ).length;

  const normalizedQuery = query.trim().toLowerCase();

  const visibleMembers = normalizedQuery
    ? enrichedMembers.filter((member) => {
        const haystack = [
          member.profile?.full_name,
          member.profile?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      })
    : enrichedMembers;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-zinc-500">
            MEMBER MANAGEMENT
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Members
          </h1>

          <p className="mt-2 text-zinc-400">
            Manage members belonging to {business.name}.
          </p>
        </div>

        <button
          type="button"
          disabled
          title="Adding members directly is coming soon"
          className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200/50 opacity-60"
        >
          <UserPlus className="h-4 w-4" />
          Add Member
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <PerformanceCard icon="users" title="Total Members" metric={{ value: enrichedMembers.length }} />
        <PerformanceCard icon="check-circle" title="Active" metric={{ value: activeMembers }} />
        <PerformanceCard icon="clock" title="Pending" metric={{ value: pendingMembers }} />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="flex flex-col justify-between gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold">Member Directory</h2>

            <p className="mt-1 text-sm text-zinc-500">
              {visibleMembers.length} of {enrichedMembers.length} member
              {enrichedMembers.length === 1 ? "" : "s"}
            </p>
          </div>

          <form method="GET" className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search members..."
              aria-label="Search members by name or email"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-white/20 sm:w-72"
            />
          </form>
        </div>

        {enrichedMembers.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={Users}
            title="No members yet"
            description="Add members to your Muscle Fitness workspace to start tracking engagement, training progress and retention."
          />
        ) : visibleMembers.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={Search}
            title="No members match your search"
            description={`Nobody matched "${query}". Try a different name or email.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full"
              style={{
                minWidth: "800px",
              }}
            >
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-zinc-600">
                  <th className="px-6 py-4 font-medium">Member</th>
                  <th className="px-6 py-4 font-medium">Membership</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                </tr>
              </thead>

              <tbody>
                {visibleMembers.map((member) => {
                  const profile = member.profile;

                  const displayName =
                    profile?.full_name ||
                    profile?.email ||
                    "Muscle Fitness Member";

                  return (
                    <tr
                      key={member.id}
                      className="border-b border-white/5 transition last:border-b-0 hover:bg-white/5"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          {profile?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={profile.avatar_url}
                              alt={`${displayName} avatar`}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-semibold">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <p className="font-medium text-white">
                              {displayName}
                            </p>

                            <p className="mt-0.5 text-xs text-zinc-500">
                              {profile?.email ?? member.user_id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5 text-sm capitalize text-zinc-300">
                        {member.membership_type ?? "Standard"}
                      </td>

                      <td className="px-6 py-5">
                        <StatusBadge status={member.status} />
                      </td>

                      <td className="px-6 py-5 text-sm text-zinc-400">
                        {new Intl.DateTimeFormat("en", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(member.joined_at))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


function StatusBadge({ status }: { status: string }) {
  let classes = "bg-zinc-500/10 text-zinc-400";

  if (status === "active") {
    classes = "bg-emerald-500/10 text-emerald-400";
  } else if (status === "pending") {
    classes = "bg-amber-500/10 text-amber-400";
  } else if (status === "cancelled") {
    classes = "bg-red-500/10 text-red-400";
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${classes}`}
    >
      {status}
    </span>
  );
}