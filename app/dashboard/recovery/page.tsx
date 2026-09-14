import Link from "next/link";

import { AlertTriangle, ShieldAlert } from "lucide-react";

import { requireUser } from "@/lib/auth/guard";
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { buildRecoveryRecommendation } from "@/lib/recovery/recommendation";

import DanteChat from "@/components/dante-chat";
import { RecoveryScoreCard } from "@/components/recovery/recovery-score-card";
import { RecoveryCheckinForm } from "@/components/recovery/recovery-checkin-form";
import { TrainingRecoveryCard } from "@/components/recovery/training-recovery-card";
import { MuscleReadinessPanel } from "@/components/dante/muscle-readiness-panel";
import { RecoveryTrendsChart } from "@/components/recovery/recovery-trends-chart";
import { RecoveryKnowledgeHub } from "@/components/recovery/recovery-knowledge-hub";
import { PageVisual } from "@/components/visual/page-visual";
import { loadRadarContext } from "@/lib/health-radar/load-radar-context";
import { buildRecoveryRadar } from "@/lib/health-radar/recovery-radar-engine";
import { DecisionCard } from "@/components/dante/decision-card";

export const dynamic = "force-dynamic";

const RECOVERY_QUICK_PROMPTS = [
  {
    label: "Why is my score lower?",
    prompt: "Why is my recovery score lower today?",
  },
  {
    label: "Reduce volume?",
    prompt: "Should I reduce training volume today?",
  },
  {
    label: "Sleep & progress",
    prompt: "Is my sleep affecting my progress?",
  },
  {
    label: "Still sore",
    prompt: "Why am I still sore?",
  },
  {
    label: "Deload timing",
    prompt: "When should I take a deload?",
  },
  {
    label: "Last 7 days",
    prompt: "Explain my last 7 days of recovery.",
  },
];

export default async function RecoveryPage() {
  const { supabase, userId } = await requireUser();

  const context = await loadRecoveryContext(supabase, userId);
  const recommendation = buildRecoveryRecommendation(
    context.todayScoreResult,
    context.trainingLoad,
  );

  const radarInput = await loadRadarContext(supabase, userId);
  const radar = buildRecoveryRadar(radarInput);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-1 py-2">
      {/* =================================================
          HEADER
      ================================================= */}

      <section className="relative overflow-hidden rounded-[24px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-6 sm:p-8">
        <PageVisual page="recovery" />

        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-mf-glass-dante">
            Recovery Intelligence
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight text-mf-glass-text sm:text-4xl">
            Train hard. Recover intelligently.
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-mf-glass-text-muted">
            A practical readiness estimate built from your sleep, stress,
            fatigue, soreness, mood and training data — connected to Dante for
            evidence-aware recovery coaching.
          </p>
        </div>
      </section>

      {/* =================================================
          SCORE + RECOMMENDATION
      ================================================= */}

      <RecoveryScoreCard
        result={context.todayScoreResult}
        recommendation={recommendation}
      />

      {/* =================================================
          PERFORMANCE / RECOVERY RADAR
      ================================================= */}

      <DecisionCard decision={radar} />

      {/* =================================================
          CHECK-IN
      ================================================= */}

      <RecoveryCheckinForm existing={context.today} />

      {/* =================================================
          TRAINING x RECOVERY
      ================================================= */}

      <TrainingRecoveryCard summary={context.trainingLoad} />

      {/* =================================================
          DANTE CORE — READINESS (per-muscle recovery)
      ================================================= */}

      <MuscleReadinessPanel />

      {/* =================================================
          TRENDS
      ================================================= */}

      <RecoveryTrendsChart data={context.trend30Days} />

      {/* =================================================
          DANTE — RECOVERY COACH
      ================================================= */}

      <div id="dante-recovery-coach" className="scroll-mt-24">
        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-mf-glass-text-muted">
            Dante
          </p>
          <h2 className="mt-1 text-xl font-black text-mf-glass-text">
            Recovery Coach
          </h2>
        </div>

        <DanteChat
          compact
          heroTitle="Your Recovery Coach"
          heroSubtitle="I can see today's recovery score, your last 7 days of trends and your recent training load. Ask me anything about sleep, stress, soreness or when to back off."
          welcomeMessage="Hi. I'm **Dante**. I can see today's recovery score, your 7-day trend and your recent training load — ask me what's driving it or whether to adjust today's session."
          quickPrompts={RECOVERY_QUICK_PROMPTS}
        />
      </div>

      {/* =================================================
          KNOWLEDGE HUB
      ================================================= */}

      <RecoveryKnowledgeHub />

      {/* =================================================
          HEALTH SAFETY
      ================================================= */}

      <section className="rounded-3xl border border-mf-glass-warning/15 bg-mf-glass-warning/[0.04] p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-mf-glass-warning" aria-hidden="true" />
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-mf-glass-warning">
            Recovery Guidance, Not Medical Diagnosis
          </p>
        </div>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-mf-glass-text-muted">
          Recovery scores and Dante insights are educational tools based on
          the information available to Muscle Fitness. They are not medical
          diagnoses and should not replace qualified medical care.
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-mf-glass-danger/15 bg-mf-glass-danger/[0.04] p-4">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-mf-glass-danger"
            aria-hidden="true"
          />
          <p className="text-xs leading-5 text-mf-glass-text-muted">
            For chest pain, severe shortness of breath, fainting,
            neurological symptoms, rapidly worsening or severe pain, severe
            illness, or a mental-health crisis, stop and seek urgent
            professional or emergency care immediately. This does not
            replace that care.
          </p>
        </div>

        <Link
          href="/responsible-ai"
          className="mt-4 inline-flex text-xs font-bold text-mf-glass-warning hover:text-mf-glass-brand"
        >
          Read our Responsible AI approach →
        </Link>
      </section>
    </div>
  );
}
