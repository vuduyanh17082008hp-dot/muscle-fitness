import {
  Bot,
  BrainCircuit,
  TrendingDown,
  Zap,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { PageVisual } from "@/components/visual/page-visual";

export default async function BusinessAIInsightsPage() {
  const business = await getCurrentBusiness();

  if (!business) {
    redirect("/business/setup");
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 p-6">
        <PageVisual page="business" intensity="secondary" glow={false} />

        <div className="relative z-10">
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
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <InsightCard
          icon={<TrendingDown className="h-5 w-5" />}
          title="Churn Risk"
          description="Identify members whose engagement is declining before they leave."
        />

        <InsightCard
          icon={<BrainCircuit className="h-5 w-5" />}
          title="Behaviour Insights"
          description="Understand training consistency and member engagement patterns."
        />

        <InsightCard
          icon={<Zap className="h-5 w-5" />}
          title="Recommended Actions"
          description="Generate practical actions trainers can take to improve retention."
        />
      </div>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5" />

          <h2 className="font-semibold">
            Muscle Fitness Business AI
          </h2>
        </div>

        <div className="mt-6 flex min-h-72 items-center justify-center rounded-xl border border-dashed border-white/10 p-6 text-center">
          <div>
            <Bot className="mx-auto h-8 w-8 text-zinc-600" />

            <p className="mt-4 font-medium">
              AI analysis will appear here
            </p>

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
              Groq can be connected to this interface to analyse aggregated
              business metrics and generate retention and engagement insights.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
        {icon}
      </div>

      <h2 className="mt-5 font-semibold">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-zinc-500">
        {description}
      </p>
    </article>
  );
}