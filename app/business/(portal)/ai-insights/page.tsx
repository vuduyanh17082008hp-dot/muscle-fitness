import { Bot } from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { PerformanceCard } from "@/components/ui/performance-card";
import { EmptyState } from "@/components/dashboard/empty-state";

export default async function BusinessAIInsightsPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <p className="text-sm font-medium text-zinc-500">
        AI BUSINESS INTELLIGENCE
      </p>

      <h1 className="mt-2 text-3xl font-bold">
        AI Insights
      </h1>

      <p className="mt-2 max-w-2xl leading-7 text-zinc-400">
        Turn member activity and fitness data into actionable business
        intelligence for {business.name}.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <PerformanceCard
          icon="trending-down"
          title="Churn Risk"
          subtitle="Identify members whose engagement is declining before they leave."
        />

        <PerformanceCard
          icon="brain-circuit"
          title="Behaviour Insights"
          subtitle="Understand training consistency and member engagement patterns."
        />

        <PerformanceCard
          icon="zap"
          title="Recommended Actions"
          subtitle="Generate practical actions trainers can take to improve retention."
        />
      </div>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5" />

          <h2 className="font-semibold">
            Muscle Fitness Business AI
          </h2>
        </div>

        <EmptyState
          className="mt-6 min-h-72"
          icon={Bot}
          title="AI analysis will appear here"
          description="Groq can be connected here to analyse business metrics, member behaviour, engagement and retention patterns."
        />
      </section>
    </div>
  );
}