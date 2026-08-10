import Link from "next/link";

import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { loadDashboardPageData } from "@/features/dashboard/load-page-data";
import type { DashboardData } from "@/features/dashboard/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  let loadError: unknown = null;

  try {
    const result = await loadDashboardPageData();
    data = result.data;
  } catch (error) {
    loadError = error;
    console.error("Dashboard page failed:", error);
  }

  if (!data || loadError) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-white">
          Unable to load dashboard data
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Something went wrong while loading your client dashboard.
          Please try again.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[var(--color-accent-light)]"
        >
          Try again
        </Link>
      </div>
    );
  }

  return <DashboardOverview data={data} />;
}
