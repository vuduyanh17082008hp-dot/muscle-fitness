import {
  BarChart3,
  TrendingUp,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessAnalyticsPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  const supabase = await createClient();

  const [totalResult, activeResult] = await Promise.all([
    supabase
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id),

    supabase
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "active"),
  ]);

  const totalMembers = totalResult.count ?? 0;
  const activeMembers = activeResult.count ?? 0;

  const retentionRate =
    totalMembers > 0
      ? Math.round((activeMembers / totalMembers) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <p className="text-sm font-medium text-zinc-500">
        BUSINESS INTELLIGENCE
      </p>

      <h1 className="mt-2 text-3xl font-bold">
        Analytics
      </h1>

      <p className="mt-2 text-zinc-400">
        Understand membership, engagement and retention trends.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total Members"
          value={totalMembers.toString()}
        />

        <MetricCard
          label="Active Members"
          value={activeMembers.toString()}
        />

        <MetricCard
          label="Active Rate"
          value={`${retentionRate}%`}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <AnalyticsCard
          title="Member Growth"
          description="Track total membership growth over time."
          icon={<Users className="h-5 w-5" />}
        />

        <AnalyticsCard
          title="Retention"
          description="Measure active members and identify potential churn."
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold">
        {value}
      </p>
    </div>
  );
}

function AnalyticsCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-3">
        {icon}

        <h2 className="font-semibold">
          {title}
        </h2>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        {description}
      </p>

      <div className="mt-8 flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10">
        <BarChart3 className="h-8 w-8 text-zinc-700" />
      </div>
    </section>
  );
}