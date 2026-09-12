import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type RiskLevel = "LOW" | "MODERATE" | "HIGH";

type Member = {
  id: string;
  organization_id: string;
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

type RiskFactor = {
  label: string;
  value: number;
};

type RiskResult = {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
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
  value: string | null
): number {
  if (!value) {
    return 30;
  }

  const difference =
    Date.now() -
    new Date(value).getTime();

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
  member: Member
): RiskResult {
  const days =
    getDaysSinceLastVisit(
      member.last_visit_at
    );

  const inactivity =
    getInactivityRisk(days);

  let decline = 0;

  if (
    member.sessions_previous_30d <= 0
  ) {
    decline =
      member.sessions_30d <= 0
        ? 50
        : 0;
  } else {
    decline = clamp(
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

  const weakProgress =
    100 -
    clamp(
      Number(
        member.progress_signal
      )
    );

  const score = Math.round(
    clamp(
      inactivity * 0.35 +
        decline * 0.25 +
        lowAdherence * 0.2 +
        lowEngagement * 0.15 +
        weakProgress * 0.05
    )
  );

  let level: RiskLevel = "LOW";

  if (score >= 65) {
    level = "HIGH";
  } else if (score >= 35) {
    level = "MODERATE";
  }

  return {
    score,
    level,

    factors: [
      {
        label: "Recent inactivity",
        value: Math.round(
          inactivity
        ),
      },

      {
        label:
          "Training frequency decline",
        value: Math.round(
          decline
        ),
      },

      {
        label:
          "Low workout adherence",
        value: Math.round(
          lowAdherence
        ),
      },

      {
        label:
          "Low application engagement",
        value: Math.round(
          lowEngagement
        ),
      },

      {
        label:
          "Weak progress signal",
        value: Math.round(
          weakProgress
        ),
      },
    ],
  };
}

function getRiskBadgeClass(
  level: RiskLevel
): string {
  switch (level) {
    case "HIGH":
      return [
        "border-red-400/30",
        "bg-red-400/10",
        "text-red-300",
      ].join(" ");

    case "MODERATE":
      return [
        "border-amber-400/30",
        "bg-amber-400/10",
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

function getRiskPanelClass(
  level: RiskLevel
): string {
  switch (level) {
    case "HIGH":
      return [
        "border-red-500/20",
        "bg-red-500/5",
      ].join(" ");

    case "MODERATE":
      return [
        "border-amber-500/20",
        "bg-amber-500/5",
      ].join(" ");

    default:
      return [
        "border-lime-400/20",
        "bg-lime-400/5",
      ].join(" ");
  }
}

export default async function MemberDetailPage({
  params,
}: PageProps) {
  const { id } = await params;

  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data,
    error,
  } = await supabase
    .from("gym_members")
    .select(
      `
        id,
        organization_id,
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
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "Unable to load member:",
      error
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#070908] px-6 py-20 text-white">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/business/members"
            className="text-sm text-lime-300 transition hover:text-lime-200"
          >
            ← Member Intelligence
          </Link>

          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
            <h1 className="text-3xl font-medium">
              Member unavailable
            </h1>

            <p className="mt-3 text-sm leading-6 text-white/50">
              The member does not exist,
              or your organisation does not
              have permission to access
              this record.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const member =
    data as Member;

  const risk =
    calculateRisk(member);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070908] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(184,255,90,0.08),transparent_32%)]"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-10">
        <Link
          href="/business/members"
          className="text-sm text-white/50 transition hover:text-lime-300"
        >
          ← Member Intelligence
        </Link>

        {/* HEADER */}
        <header className="mt-10 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-lime-300">
                Member Intelligence
              </span>

              <span className="rounded-full border border-lime-400/20 bg-lime-400/5 px-3 py-1 text-[10px] uppercase tracking-wider text-lime-300">
                Synthetic Demo Data
              </span>
            </div>

            <h1 className="text-4xl font-medium tracking-tight md:text-5xl">
              {member.name}
            </h1>

            <p className="mt-3 text-sm text-white/50">
              {member.membership_plan ??
                "Membership"}
              {" · "}
              {member.goal ??
                "General Fitness"}
            </p>
          </div>

          <div
            className={[
              "rounded-2xl",
              "border",
              "px-8",
              "py-5",
              getRiskPanelClass(
                risk.level
              ),
            ].join(" ")}
          >
            <p className="text-xs uppercase tracking-[0.15em] text-white/50">
              Churn Risk
            </p>

            <div className="mt-2 flex items-end gap-3">
              <span className="text-5xl font-medium tracking-tight">
                {risk.score}%
              </span>

              <span
                className={[
                  "mb-1",
                  "rounded-full",
                  "border",
                  "px-3",
                  "py-1",
                  "text-xs",
                  "font-semibold",
                  getRiskBadgeClass(
                    risk.level
                  ),
                ].join(" ")}
              >
                {risk.level}
              </span>
            </div>
          </div>
        </header>

        {/* KPI CARDS */}
        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Sessions / 30d"
            value={
              member.sessions_30d
            }
          />

          <Metric
            label="Workout Adherence"
            value={`${Math.round(
              Number(
                member.workout_adherence
              )
            )}%`}
          />

          <Metric
            label="Engagement"
            value={`${Math.round(
              Number(
                member.engagement_score
              )
            )}%`}
          />

          <Metric
            label="Last Visit"
            value={`${getDaysSinceLastVisit(
              member.last_visit_at
            )}d`}
          />
        </section>

        {/* INTELLIGENCE GRID */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          {/* TRANSPARENT RISK ENGINE */}
          <div className="rounded-3xl border border-white/10 bg-white/5 p-7">
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.18em] text-lime-300">
                Transparent Risk Engine
              </p>

              <h2 className="mt-2 text-xl font-medium">
                Why this member may
                disengage
              </h2>

              <p className="mt-2 max-w-xl text-sm leading-6 text-white/40">
                Behavioural indicators are
                weighted using a transparent
                deterministic scoring model.
              </p>
            </div>

            <div className="space-y-5">
              {risk.factors.map(
                (factor) => (
                  <div key={factor.label}>
                    <div className="mb-2 flex justify-between gap-4 text-sm">
                      <span className="text-white/60">
                        {factor.label}
                      </span>

                      <span className="font-medium text-white/80">
                        {factor.value}%
                      </span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-lime-300"
                        style={{
                          width: `${clamp(
                            factor.value
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs leading-5 text-white/40">
                The churn-risk score is
                calculated from transparent
                behavioural signals. It is
                not generated by the
                language model.
              </p>
            </div>
          </div>

          {/* AI DECISION SUPPORT */}
          <div className="rounded-3xl border border-lime-400/10 bg-lime-400/5 p-7">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.18em] text-lime-300">
                AI Decision Support
              </p>

              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/50">
                Groq AI
              </span>
            </div>

            <h2 className="mt-3 text-xl font-medium">
              Recommended next action
            </h2>

            <p className="mt-5 text-sm leading-7 text-white/60">
              Recent behavioural signals
              suggest that engagement has
              declined. A supportive
              personal check-in is
              recommended before this
              member becomes fully
              inactive.
            </p>

            <div className="mt-7 space-y-3">
              <ActionItem
                number="01"
                title="Send personalised check-in"
              />

              <ActionItem
                number="02"
                title="Offer training-plan review"
              />

              <ActionItem
                number="03"
                title="Invite to a re-engagement challenge"
              />
            </div>

            <Link
              href={`/business/campaigns/new?member=${member.id}`}
              className="mt-8 flex h-12 w-full items-center justify-center rounded-xl bg-lime-300 px-5 text-sm font-semibold text-black transition hover:bg-lime-200"
            >
              Generate Outreach
            </Link>

            <p className="mt-3 text-center text-[11px] text-white/30">
              AI generated · Human approval
              required before outreach
            </p>
          </div>
        </section>

        {/* MEMBER DETAILS */}
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-7">
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">
            Member Context
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Detail
              label="Membership"
              value={
                member.membership_plan ??
                "—"
              }
            />

            <Detail
              label="Goal"
              value={
                member.goal ?? "—"
              }
            />

            <Detail
              label="Status"
              value={
                member.status
              }
            />

            <Detail
              label="Monthly Value"
              value={`$${Number(
                member.monthly_value
              ).toFixed(0)}`}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs uppercase tracking-[0.12em] text-white/40">
        {label}
      </p>

      <p className="mt-3 text-2xl font-medium tracking-tight">
        {value}
      </p>
    </div>
  );
}

function ActionItem({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <span className="text-xs font-semibold text-lime-300">
        {number}
      </span>

      <span className="text-sm text-white/70">
        {title}
      </span>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-white/40">
        {label}
      </p>

      <p className="mt-1 text-sm font-medium text-white/80">
        {value}
      </p>
    </div>
  );
}