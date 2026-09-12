import type { Metadata } from "next";
import { Activity, Beaker, Bot, MapPin, ShieldCheck, Video } from "lucide-react";

import { requireAdmin } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buildAiEvaluationSnapshot } from "@/lib/ai-evaluation";
import type { Metric, MetricSource } from "@/lib/ai-evaluation/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Evaluation | Muscle Fitness Admin",
};

/**
 * AI Evaluation Dashboard (spec Part C §17-18).
 *
 * Admin-only (requireAdmin()) — not exposed to normal clients, per
 * spec §17's explicit instruction. Every metric renders its own
 * DEMO/REAL badge; nothing on this page presents a seeded value as a
 * measured result without saying so.
 */

function SourceBadge({ source }: { source: MetricSource }) {
  return (
    <span
      className={
        source === "real"
          ? "rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-300"
          : "rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-300"
      }
    >
      {source === "real" ? "Real" : "Demo Data"}
    </span>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "Not measured";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "passed" in (value as Record<string, unknown>)) {
    const v = value as { passed: number; total: number };
    return `${v.passed}/${v.total}`;
  }
  if (typeof value === "object" && "label" in (value as Record<string, unknown>)) {
    return (value as { label: string }).label;
  }
  return String(value);
}

function MetricRow<T>({ label, metric, suffix }: { label: string; metric: Metric<T>; suffix?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] py-3 last:border-b-0">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{metric.note}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="text-lg font-black text-white">
          {formatValue(metric.value)}
          {metric.value !== null && suffix ? suffix : ""}
        </p>
        <SourceBadge source={metric.source} />
      </div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Activity;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-7">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-amber-400" aria-hidden="true" />
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">{title}</p>
      </div>
      <div className="mt-3">{children}</div>
    </article>
  );
}

export default async function AiEvaluationPage() {
  const actor = await requireAdmin();
  const supabase = await createClient();

  const snapshot = await buildAiEvaluationSnapshot(supabase, actor.userId);

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-7 sm:p-9">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
            Admin — Internal
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            AI Evaluation Dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Every metric below is labeled <strong className="text-emerald-300">Real</strong> (live-
            computed, or a genuinely measured result) or{" "}
            <strong className="text-amber-300">Demo Data</strong> (synthetic fixtures, since no
            real labeled dataset exists yet for that system). Nothing here should be quoted
            externally as a validated accuracy claim without checking its label first.
          </p>
        </header>

        <SectionCard icon={Video} title="SetVision">
          <MetricRow label="Rep-count accuracy" metric={snapshot.setvision.repCountAccuracy} suffix={snapshot.setvision.repCountAccuracy.value !== null ? "" : undefined} />
          <MetricRow label="Exercise classification accuracy" metric={snapshot.setvision.exerciseClassificationAccuracy} />
          <MetricRow label="ROM mean absolute error" metric={snapshot.setvision.romMeanAbsoluteError} suffix="%" />
          <MetricRow label="Velocity mean absolute error" metric={snapshot.setvision.velocityMeanAbsoluteError} suffix=" m/s" />
          <MetricRow label="Average processing latency" metric={snapshot.setvision.averageLatencyMs} suffix=" ms" />
          <p className="mt-3 text-xs text-zinc-600">Sample size: {snapshot.setvision.sampleSize} fixture videos.</p>
        </SectionCard>

        <SectionCard icon={MapPin} title="HawkerLens SG">
          <MetricRow label="Dish classification accuracy" metric={snapshot.hawkerlens.classificationAccuracy} />
          <MetricRow label="Segmentation (component-set Dice)" metric={snapshot.hawkerlens.segmentationDice} />
          <MetricRow label="Portion mean absolute error" metric={snapshot.hawkerlens.portionMeanAbsoluteErrorGrams} suffix=" g" />
          <MetricRow label="Calorie mean absolute error" metric={snapshot.hawkerlens.calorieMeanAbsoluteError} suffix=" kcal" />
          <MetricRow label="Protein mean absolute error" metric={snapshot.hawkerlens.proteinMeanAbsoluteError} suffix=" g" />
          <p className="mt-3 text-xs text-zinc-600">Sample size: {snapshot.hawkerlens.sampleSize} fixture photos.</p>
        </SectionCard>

        <SectionCard icon={Bot} title="Dante">
          <MetricRow label="Recommendation consistency (determinism)" metric={snapshot.dante.recommendationConsistency} />
          <MetricRow label="Safety layer test status" metric={snapshot.dante.safetyLayerTestStatus} />
          <MetricRow label="Retrieval accuracy" metric={snapshot.dante.retrievalAccuracy} />
          <MetricRow label="Citation accuracy" metric={snapshot.dante.citationAccuracy} />
          <MetricRow label="Hallucination test status" metric={snapshot.dante.hallucinationTestStatus} />
        </SectionCard>

        <SectionCard icon={ShieldCheck} title="System">
          <MetricRow label="API latency (Supabase round-trip)" metric={snapshot.system.apiLatencyMs} suffix=" ms" />
          <MetricRow label="API healthy" metric={snapshot.system.apiHealthy} />
          <MetricRow label="Failures (24h)" metric={snapshot.system.recentFailures24h} />
          <MetricRow label="Build / test status" metric={snapshot.system.buildTestStatus} />
          <MetricRow label="SetVision analyses logged (yours)" metric={snapshot.system.setvisionAnalysesLogged} />
          <MetricRow label="HawkerLens scans logged (yours)" metric={snapshot.system.hawkerlensScansLogged} />
        </SectionCard>

        <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-zinc-600">
          <Beaker className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            Generated at {new Date(snapshot.generatedAt).toLocaleString()}. See{" "}
            <code className="text-zinc-400">docs/ai-evaluation.md</code> for how to replace demo
            fixtures with real benchmark data once labeled datasets exist.
          </p>
        </div>
      </div>
    </main>
  );
}
