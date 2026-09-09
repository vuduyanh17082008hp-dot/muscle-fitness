import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

type GymMember = {
  id: string;
  name: string;
  email: string | null;
  membership_plan: string | null;
  goal: string | null;
  status: string;
  last_visit_at: string | null;
  sessions_30d: number;
  sessions_previous_30d: number;
  workout_adherence: number;
  engagement_score: number;
  progress_signal: number;
  monthly_value: number;
};

type RiskLevel = "LOW" | "MODERATE" | "HIGH";

type MemberWithRisk = GymMember & {
  riskScore: number;
  riskLevel: RiskLevel;
};

function clamp(
  value: number,
  minimum = 0,
  maximum = 100
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function getDaysSinceLastVisit(
  lastVisit: string | null
): number {
  if (!lastVisit) {
    return 30;
  }

  const visitDate = new Date(lastVisit);

  const difference =
    Date.now() - visitDate.getTime();

  return Math.max(
    0,
    Math.floor(
      difference /
        (1000 * 60 * 60 * 24)
    )
  );
}

function getInactivityRisk(
  days: number
): number {
  if (days <= 2) return 0;
  if (days <= 4) return 20;
  if (days <= 7) return 45;
  if (days <= 10) return 70;
  if (days <= 14) return 85;

  return 100;
}

function calculateRisk(
  member: GymMember
): {
  riskScore: number;
  riskLevel: RiskLevel;
} {
  const daysSinceLastVisit =
    getDaysSinceLastVisit(
      member.last_visit_at
    );

  const inactivity =
    getInactivityRisk(
      daysSinceLastVisit
    );

  let sessionDecline = 0;

  if (
    member.sessions_previous_30d <= 0
  ) {
    sessionDecline =
      member.sessions_30d <= 0
        ? 50
        : 0;
  } else {
    sessionDecline = clamp(
      (
        (
          member.sessions_previous_30d -
          member.sessions_30d
        ) /
        member.sessions_previous_30d
      ) * 100
    );
  }

  const lowAdherence =
    100 -
    clamp(
      Number(
        member.workout_adherence
      )
    );

  const lowEngagement =
    100 -
    clamp(
      Number(
        member.engagement_score
      )
    );

  const lackOfProgress =
    100 -
    clamp(
      Number(
        member.progress_signal
      )
    );

  const riskScore = Math.round(
    clamp(
      inactivity * 0.35 +
        sessionDecline * 0.25 +
        lowAdherence * 0.2 +
        lowEngagement * 0.15 +
        lackOfProgress * 0.05
    )
  );

  let riskLevel: RiskLevel = "LOW";

  if (riskScore >= 65) {
    riskLevel = "HIGH";
  } else if (riskScore >= 35) {
    riskLevel = "MODERATE";
  }

  return {
    riskScore,
    riskLevel,
  };
}

function getRiskClass(
  riskLevel: RiskLevel
): string {
  switch (riskLevel) {
    case "HIGH":
      return [
        "border-red-500/30",
        "bg-red-500/10",
        "text-red-300",
      ].join(" ");

    case "MODERATE":
      return [
        "border-amber-500/30",
        "bg-amber-500/10",
        "text-amber-300",
      ].join(" ");

    default:
      return [
        "border-lime-400/30",
        "bg-lime-400/10",
        "text-lime-300",
      ].join(" ");
  }
}

function formatLastVisit(
  value: string | null
): string {
  if (!value) {
    return "No visit recorded";
  }

  const days =
    getDaysSinceLastVisit(value);

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "1 day ago";
  }

  return `${days} days ago`;
}

export default async function BusinessMembersPage() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  /*
   * Try organisation ownership first.
   */
  const {
    data: ownedOrganization,
    error: ownedOrganizationError,
  } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();

  if (ownedOrganizationError) {
    console.error(
      "Unable to find owned organisation:",
      ownedOrganizationError
    );
  }

  let organizationId =
    ownedOrganization?.id ?? null;

  let organizationName =
    ownedOrganization?.name ??
    "Muscle AI";

  /*
   * If not the owner, check organisation membership.
   */
  if (!organizationId) {
    const {
      data: membership,
      error: membershipError,
    } = await supabase
      .from("organization_users")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error(
        "Unable to load organisation membership:",
        membershipError
      );
    }

    if (
      membership?.organization_id
    ) {
      organizationId =
        membership.organization_id;

      const {
        data: organization,
        error: organizationError,
      } = await supabase
        .from("organizations")
        .select("name")
        .eq(
          "id",
          organizationId
        )
        .maybeSingle();

      if (organizationError) {
        console.error(
          "Unable to load organisation:",
          organizationError
        );
      }

      if (organization?.name) {
        organizationName =
          organization.name;
      }
    }
  }

  /*
   * Do not throw a 404 if the account simply
   * has not been attached to an organisation.
   */
  if (!organizationId) {
    return (
      <main className="min-h-screen bg-[#070908] text-white">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">
              Muscle / AI
            </p>

            <h1 className="text-3xl font-semibold">
              No organisation assigned
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">
              Your account is authenticated,
              but it is not currently connected
              to a Muscle AI organisation.
              Check the organizations and
              organization_users tables in
              Supabase.
            </p>

            <Link
              href="/dashboard"
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /*
   * Load members.
   */
  const {
    data,
    error,
  } = await supabase
    .from("gym_members")
    .select(
      `
        id,
        name,
        email,
        membership_plan,
        goal,
        status,
        last_visit_at,
        sessions_30d,
        sessions_previous_30d,
        workout_adherence,
        engagement_score,
        progress_signal,
        monthly_value
      `
    )
    .eq(
      "organization_id",
      organizationId
    )
    .order(
      "name",
      {
        ascending: true,
      }
    );

  if (error) {
    console.error(
      "Unable to load gym members:",
      error
    );
  }

  const members: MemberWithRisk[] =
    ((data ?? []) as GymMember[])
      .map((member) => ({
        ...member,
        ...calculateRisk(member),
      }))
      .sort(
        (a, b) =>
          b.riskScore -
          a.riskScore
      );

  const highRiskCount =
    members.filter(
      (member) =>
        member.riskLevel === "HIGH"
    ).length;

  const moderateRiskCount =
    members.filter(
      (member) =>
        member.riskLevel ===
        "MODERATE"
    ).length;

  const averageEngagement =
    members.length > 0
      ? Math.round(
          members.reduce(
            (total, member) =>
              total +
              Number(
                member.engagement_score
              ),
            0
          ) / members.length
        )
      : 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070908] text-[#F5F7F5]">
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(184,255,90,0.09),transparent_32%)]"
      />

      <div className="relative mx-auto max-w-7xl px-5 py-8 md:px-8 lg:px-10">
        {/* HEADER */}
        <header className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-300">
                Muscle / AI
              </span>

              <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1 text-[10px] uppercase tracking-wider text-lime-300">
                Synthetic Demo Data
              </span>
            </div>

            <h1 className="text-4xl font-medium tracking-tight md:text-5xl">
              Member Intelligence
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
              {organizationName}
              {" · "}
              Understand who needs attention
              before declining engagement
              becomes a retention problem.
            </p>
          </div>

          <Link
            href="/business/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Back to Dashboard
          </Link>
        </header>

        {/* KPI CARDS */}
        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Members"
            value={members.length}
            detail="Active intelligence records"
          />

          <MetricCard
            label="High Risk"
            value={highRiskCount}
            detail="Immediate attention"
          />

          <MetricCard
            label="Moderate Risk"
            value={moderateRiskCount}
            detail="Monitor engagement"
          />

          <MetricCard
            label="Avg. Engagement"
            value={`${averageEngagement}%`}
            detail="Current member signal"
          />
        </section>

        {/* PRIORITY CENTER */}
        {highRiskCount > 0 && (
          <section className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-red-200">
                  {highRiskCount} member
                  {highRiskCount === 1
                    ? ""
                    : "s"}{" "}
                  currently require attention
                </p>

                <p className="mt-1 text-xs text-white/40">
                  Prioritised using transparent
                  behavioural risk signals.
                </p>
              </div>

              <span className="text-xs uppercase tracking-[0.16em] text-red-300/70">
                Priority Center
              </span>
            </div>
          </section>
        )}

        {/* MEMBER TABLE */}
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#101311] shadow-2xl shadow-black/20">
          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="text-base font-medium">
              All Members
            </h2>

            <p className="mt-1 text-xs text-white/40">
              Ranked automatically by
              behavioural churn risk.
            </p>
          </div>

          {error ? (
            <div className="p-10">
              <p className="font-medium text-red-300">
                Unable to load members.
              </p>

              <p className="mt-2 text-sm text-white/40">
                Check Supabase RLS,
                organisation membership and
                the server console.
              </p>
            </div>
          ) : members.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-lg font-medium">
                No members found
              </p>

              <p className="mt-2 text-sm text-white/40">
                Add members to the
                gym_members table for this
                organisation.
              </p>
            </div>
          ) : (
            <>
              {/* DESKTOP */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-max">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.14em] text-white/40">
                      <th className="px-6 py-4 font-medium">
                        Member
                      </th>

                      <th className="px-4 py-4 font-medium">
                        Goal
                      </th>

                      <th className="px-4 py-4 font-medium">
                        Last Visit
                      </th>

                      <th className="px-4 py-4 font-medium">
                        Sessions
                      </th>

                      <th className="px-4 py-4 font-medium">
                        Engagement
                      </th>

                      <th className="px-4 py-4 font-medium">
                        Risk
                      </th>

                      <th className="px-4 py-4 font-medium">
                        Value
                      </th>

                      <th className="px-6 py-4 text-right font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {members.map(
                      (member) => (
                        <tr
                          key={member.id}
                          className="border-b border-white/5 transition hover:bg-white/5"
                        >
                          <td className="px-6 py-5">
                            <div className="font-medium">
                              {member.name}
                            </div>

                            <div className="mt-1 text-xs text-white/40">
                              {member.membership_plan ??
                                "Membership"}
                            </div>
                          </td>

                          <td className="px-4 py-5 text-sm text-white/60">
                            {member.goal ?? "—"}
                          </td>

                          <td className="px-4 py-5 text-sm text-white/60">
                            {formatLastVisit(
                              member.last_visit_at
                            )}
                          </td>

                          <td className="px-4 py-5">
                            <span className="text-sm text-white/80">
                              {
                                member.sessions_30d
                              }
                            </span>

                            <span className="ml-1 text-xs text-white/30">
                              / 30d
                            </span>
                          </td>

                          <td className="px-4 py-5">
                            <div className="flex items-center gap-3">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-lime-300"
                                  style={{
                                    width: `${clamp(
                                      Number(
                                        member.engagement_score
                                      )
                                    )}%`,
                                  }}
                                />
                              </div>

                              <span className="text-sm text-white/60">
                                {Math.round(
                                  Number(
                                    member.engagement_score
                                  )
                                )}
                                %
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-5">
                            <div className="flex items-center gap-3">
                              <span
                                className={[
                                  "rounded-full",
                                  "border",
                                  "px-2.5",
                                  "py-1",
                                  "text-[10px]",
                                  "font-semibold",
                                  "tracking-wider",
                                  getRiskClass(
                                    member.riskLevel
                                  ),
                                ].join(" ")}
                              >
                                {
                                  member.riskLevel
                                }
                              </span>

                              <span className="text-sm font-medium text-white/80">
                                {
                                  member.riskScore
                                }
                                %
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-5 text-sm text-white/60">
                            $
                            {Number(
                              member.monthly_value
                            ).toFixed(0)}
                            /mo
                          </td>

                          <td className="px-6 py-5 text-right">
                            <Link
                              href={`/business/members/${member.id}`}
                              className="text-sm font-medium text-lime-300 transition hover:text-lime-200"
                            >
                              Analyse →
                            </Link>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE */}
              <div className="grid gap-3 p-4 md:hidden">
                {members.map(
                  (member) => (
                    <Link
                      key={member.id}
                      href={`/business/members/${member.id}`}
                      className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-medium">
                            {member.name}
                          </h3>

                          <p className="mt-1 text-xs text-white/40">
                            {member.goal ??
                              "General Fitness"}
                          </p>
                        </div>

                        <span
                          className={[
                            "rounded-full",
                            "border",
                            "px-2.5",
                            "py-1",
                            "text-[10px]",
                            "font-semibold",
                            getRiskClass(
                              member.riskLevel
                            ),
                          ].join(" ")}
                        >
                          {
                            member.riskScore
                          }
                          %
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-white/30">
                            Last visit
                          </p>

                          <p className="mt-1 text-white/70">
                            {formatLastVisit(
                              member.last_visit_at
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-white/30">
                            Engagement
                          </p>

                          <p className="mt-1 text-white/70">
                            {Math.round(
                              Number(
                                member.engagement_score
                              )
                            )}
                            %
                          </p>
                        </div>
                      </div>
                    </Link>
                  )
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-white/40">
        {label}
      </p>

      <div className="mt-4 text-3xl font-medium tracking-tight">
        {value}
      </div>

      <p className="mt-2 text-xs text-white/40">
        {detail}
      </p>
    </div>
  );
}