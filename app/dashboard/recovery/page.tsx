import Link from "next/link";

import { AlertTriangle, ChevronDown, MessageSquareText, ShieldAlert, Watch } from "lucide-react";

import { requireUser } from "@/lib/auth/guard";
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context";
import { buildRecoveryRecommendation } from "@/lib/recovery/recommendation";
import { buildTodayAdjustment } from "@/lib/recovery/today-adjustment";
import { loadDailyDecision } from "@/lib/dante-core/server/load-daily-decision";
import {
  loadTodaySession,
  localDateTimeParts,
  resolveUserTimeZone,
} from "@/lib/training/load-today-session";

import { RecoveryScoreCard } from "@/components/recovery/recovery-score-card";
import { RecoveryCheckinForm } from "@/components/recovery/recovery-checkin-form";
import { RecoveryAdjustmentPanel } from "@/components/recovery/recovery-adjustment-panel";
import { TrainingRecoveryCard } from "@/components/recovery/training-recovery-card";
import { MuscleReadinessPanel } from "@/components/dante/muscle-readiness-panel";
import { RecoveryTrendsChart } from "@/components/recovery/recovery-trends-chart";
import { RecoveryKnowledgeHub } from "@/components/recovery/recovery-knowledge-hub";
import { hasAppliedAdjustment, persistWorkoutProposal } from "@/lib/recovery/supabase-apply";
import { createRecoveryAdminClient } from "@/lib/supabase/admin";
import { proposalMutatesWorkout } from "@/lib/recovery/proposal";
import { loadRadarContext } from "@/lib/health-radar/load-radar-context";
import { buildRecoveryRadar } from "@/lib/health-radar/recovery-radar-engine";
import { DecisionCard } from "@/components/dante/decision-card";

export const dynamic = "force-dynamic";

/** Secondary material: closed by default, the page's verdict and signals come first. */
function MoreSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-3xl border border-mf-glass-border bg-white/[0.02]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-mf-glass-text">{title}</span>
          <span className="block text-xs text-mf-glass-text-muted">{hint}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-mf-glass-text-muted transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="space-y-5 px-2 pb-2 sm:px-3 sm:pb-3">{children}</div>
    </details>
  );
}

export default async function RecoveryPage() {
  const { supabase, userId } = await requireUser();
  const now = new Date();
  const timezone = await resolveUserTimeZone(supabase, userId);
  const localDate = localDateTimeParts(now, timezone).localDate;

  const [context, todaySession, { hold }] = await Promise.all([
    loadRecoveryContext(supabase, userId),
    loadTodaySession(supabase, userId, now, timezone),
    loadDailyDecision(supabase, userId, now),
  ]);
  // The Daily Brief's safety decision (as on Today): while it holds training, no card here clears a session.
  const recommendation = buildRecoveryRecommendation(
    context.todayScoreResult,
    context.trainingLoad,
    hold,
  );
  const adjustment = buildTodayAdjustment({
    userId,
    recovery: context,
    session: todaySession,
    hold,
  });
  // Applied today = a mutation record exists for today's session (workout_before_ref is the session id). Then the session
  // already carries the adjustment; issuing another proposal would stack a second cut on top of it.
  const alreadyApplied = todaySession ? (await hasAppliedAdjustment(supabase, userId, todaySession.id)) === true : false;
  let proposalReady = !alreadyApplied;
  if (!alreadyApplied && proposalMutatesWorkout(adjustment.proposal)) {
    try {
      const stored = await persistWorkoutProposal(createRecoveryAdminClient(), adjustment.proposal);
      if (!stored.ok) {
        proposalReady = false;
        console.error("[RECOVERY PROPOSAL] dashboard persist failed");
      }
    } catch {
      proposalReady = false;
      console.error("[RECOVERY PROPOSAL] dashboard persist failed");
    }
  }

  const radarInput = await loadRadarContext(supabase, userId);
  const radar = buildRecoveryRadar(radarInput);

  // The check-in comes first only when today's is missing (a failed read can't tell, so it doesn't jump the queue).
  const needsCheckin = context.today === null && !context.checkinsUnavailable;
  const lastCheckin =
    context.current.status === "STALE" && context.current.recordedDate
      ? { date: context.current.recordedDate, score: context.current.score }
      : null;
  const wearable = radar.decision.dataSource;
  const askDante =
    hold === "recovery"
      ? "My check-in flagged pain or illness today. What should I do instead of my planned training?"
      : needsCheckin
        ? "What should I log in today's recovery check-in?"
        : "Explain today's recovery and what it means for my training.";

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-1 py-2 pb-12">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-mf-glass-text">Recovery</h1>
        <p className="mt-1 text-sm leading-6 text-mf-glass-text-muted">
          Today&apos;s check-in, what it means for training, and how you&apos;ve trended.
        </p>
      </header>

      {/* 1. Today's check-in, when it's still needed */}
      {needsCheckin ? <RecoveryCheckinForm existing={null} /> : null}

      {/* 2–3. The one recovery verdict, and what it means */}
      <RecoveryScoreCard
        result={context.todayScoreResult}
        recommendation={recommendation}
        checkinUnavailable={context.checkinsUnavailable === true}
        hold={hold}
        lastCheckin={lastCheckin}
      />

      <RecoveryAdjustmentPanel
        recoveryState={adjustment.recoveryState}
        insight={adjustment.insight}
        proposal={adjustment.proposal}
        hasCheckin={context.today !== null}
        localDate={localDate}
        proposalReady={proposalReady}
        alreadyApplied={alreadyApplied}
        hold={hold}
      />

      {/* 4. Signals: training load and wearable data */}
      <TrainingRecoveryCard summary={context.trainingLoad} hold={hold} signalsOnly />

      <p className="flex items-start gap-2.5 rounded-2xl border border-mf-glass-border bg-white/[0.02] px-4 py-3 text-sm leading-6 text-mf-glass-text-muted">
        <Watch className="mt-1 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-mf-glass-text-secondary">Wearable: </span>
          {wearable.isDemoWearable
            ? "demo data only — HRV and resting heart rate shown in the radar are not from a real device."
            : wearable.wearable
              ? "connected — HRV and resting heart rate are compared with your own baseline in the radar below."
              : "not connected — HRV and resting heart rate aren't assessed; recovery comes from your daily check-in."}
        </span>
      </p>

      {/* 5. Trends */}
      <RecoveryTrendsChart data={context.trend30Days} />

      {/* 6. One contextual Dante entry point (the full chat, question drafted, nothing sent automatically) */}
      <Link
        href={`/dashboard/ai-coach?ask=${encodeURIComponent(askDante)}`}
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-mf-glass-dante/30 bg-mf-glass-dante/[0.06] px-4 py-3 transition hover:border-mf-glass-dante/50"
      >
        <MessageSquareText className="size-5 shrink-0 text-mf-glass-dante" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-mf-glass-text">Ask Dante about today</span>
          <span className="block truncate text-xs text-mf-glass-text-muted">{askDante}</span>
        </span>
      </Link>

      {/* Secondary: everything else, kept but folded */}
      {!needsCheckin ? (
        <MoreSection
          title={context.today ? "Update today's check-in" : "Today's check-in"}
          hint={context.today ? "Logged today — change it if something's different" : "Log or retry today's check-in"}
        >
          <RecoveryCheckinForm existing={context.today} />
        </MoreSection>
      ) : null}

      <MoreSection title="Recovery radar" hint="Today vs your own recent baseline — sleep, recovery score, wearable signals">
        <DecisionCard decision={radar} />
      </MoreSection>

      <MoreSection title="Per-muscle readiness" hint="Training-load estimate by muscle group">
        <MuscleReadinessPanel />
      </MoreSection>

      <MoreSection title="Recovery topics" hint="Practical, evidence-aware reading">
        <RecoveryKnowledgeHub />
      </MoreSection>

      <section className="rounded-3xl border border-mf-glass-warning/15 bg-mf-glass-warning/[0.04] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-mf-glass-warning" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-mf-glass-warning">
            Recovery Guidance, Not Medical Diagnosis
          </p>
        </div>

        <p className="mt-3 text-sm leading-6 text-mf-glass-text-muted">
          Recovery scores and Dante insights are educational tools based on
          the information available to Muscle Fitness. They are not medical
          diagnoses and should not replace qualified medical care.
        </p>

        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-mf-glass-text-muted">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-mf-glass-danger" aria-hidden="true" />
          For chest pain, severe shortness of breath, fainting,
          neurological symptoms, rapidly worsening or severe pain, severe
          illness, or a mental-health crisis, stop and seek urgent
          professional or emergency care immediately. This does not
          replace that care.
        </p>

        <Link
          href="/responsible-ai"
          className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-mf-glass-warning hover:text-mf-glass-brand"
        >
          Read our Responsible AI approach →
        </Link>
      </section>
    </div>
  );
}
