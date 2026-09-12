import {
  Activity,
  ArrowUpRight,
  Bot,
  Dumbbell,
  TrendingUp,
  UserRoundCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessDashboardPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  const supabase = await createClient();

  const [
    membersResponse,
    activeMembersResponse,
    staffResponse,
    programsResponse,
  ] = await Promise.all([
    supabase
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id),

    supabase
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "active"),

    supabase
      .from("business_staff")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id),

    supabase
      .from("business_programs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "active"),
  ]);

  const totalMembers = membersResponse.count ?? 0;
  const activeMembers = activeMembersResponse.count ?? 0;
  const staff = staffResponse.count ?? 0;
  const programs = programsResponse.count ?? 0;

  const stats = [
    {
      name: "Total Members",
      value: totalMembers,
      icon: Users,
      href: "/business/members",
    },
    {
      name: "Active Members",
      value: activeMembers,
      icon: Activity,
      href: "/business/members",
    },
    {
      name: "Trainers & Staff",
      value: staff,
      icon: UserRoundCog,
      href: "/business/trainers",
    },
    {
      name: "Active Programs",
      value: programs,
      icon: Dumbbell,
      href: "/business/programs",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-zinc-500">
            BUSINESS DASHBOARD
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {business.name}
          </h1>

          <p className="mt-2 text-zinc-400">
            Manage members, trainers, programs and business performance.
          </p>
        </div>

        <Link
          href="/business/ai-insights"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
        >
          <Bot className="h-4 w-4" />
          Generate AI Insights
        </Link>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <Link
              key={stat.name}
              href={stat.href}
              className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/10"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="h-5 w-5" />
                </div>

                <ArrowUpRight className="h-4 w-4 text-zinc-600 transition group-hover:text-white" />
              </div>

              <p className="mt-6 text-3xl font-bold">{stat.value}</p>

              <p className="mt-1 text-sm text-zinc-500">{stat.name}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Business performance
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Member activity and retention analytics.
              </p>
            </div>

            <TrendingUp className="h-5 w-5 text-zinc-500" />
          </div>

          <div className="mt-12 flex min-h-48 items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center">
            <p className="text-sm text-zinc-600">
              Analytics data will appear as members start using Muscle Fitness.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5" />

            <h2 className="text-lg font-semibold">
              AI Business Assistant
            </h2>
          </div>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Muscle Fitness AI can analyze engagement, identify members at risk
            of dropping out and surface actionable retention insights.
          </p>

          <Link
            href="/business/ai-insights"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white"
          >
            Open AI Insights
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </div>
  );
}