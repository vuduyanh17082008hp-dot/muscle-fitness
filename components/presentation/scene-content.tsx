import { ArrowRight } from "lucide-react";

import { DanteAvatar } from "@/components/dante-avatar/dante-avatar";
import { SetVisionResultsPanel } from "@/components/setvision/results-panel";
import { DecisionCard } from "@/components/dante/decision-card";
import type { SceneId } from "@/lib/presentation/script";
import type { DantePoseName } from "@/components/dante-avatar/poses";
import {
  DEMO_AUTOREGULATION_DECISION,
  DEMO_EXPLANATION,
  DEMO_HAWKERLENS_RESULT,
  DEMO_PLANNED,
  DEMO_READINESS,
  DEMO_SETVISION_ANALYSIS,
  DEMO_TRACEABLE_DECISION,
} from "@/lib/presentation/demo-data";

/**
 * Visual transitions per beat (spec Part E §29). Reuses the SAME
 * production components the real product uses wherever practical
 * (SetVisionResultsPanel, DecisionCard) fed the demo fixtures from
 * lib/presentation/demo-data.ts — the presentation shows real UI,
 * not a separately mocked-up "demo skin".
 */

const DEMO_BADGE = (
  <span className="absolute right-4 top-4 z-10 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-amber-300">
    Recorded Demo
  </span>
);

function LogoScene() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-4xl font-black uppercase tracking-[0.3em] text-white sm:text-6xl">
        Muscle <span className="text-amber-500">Fitness</span>
      </h1>
    </div>
  );
}

function DanteScene({ pose }: { pose: DantePoseName }) {
  return (
    <div className="flex h-full items-center justify-center">
      <DanteAvatar appState="ready" pose={pose} className="h-full w-full max-w-md" />
    </div>
  );
}

function SetVisionScene() {
  return (
    <div className="relative mx-auto flex h-full max-w-3xl items-center px-4">
      {DEMO_BADGE}
      <div className="w-full">
        <SetVisionResultsPanel analysis={DEMO_SETVISION_ANALYSIS} />
      </div>
    </div>
  );
}

function HawkerLensScene() {
  const result = DEMO_HAWKERLENS_RESULT;

  return (
    <div className="relative mx-auto flex h-full max-w-3xl items-center px-4">
      {DEMO_BADGE}
      <article className="w-full rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-400">
          {result.dish?.replace(/_/g, " ")}
        </p>
        <div className="mt-4 space-y-2">
          {result.components.map((c) => (
            <div key={c.name} className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{c.name}</span>
              <span className="font-bold text-white">~{c.estimatedGrams}g</span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <p className="text-lg font-black text-white">{result.nutrition?.calories.estimate} kcal</p>
          <p className="text-xs text-zinc-500">
            Likely range: {result.nutrition?.calories.lower}–{result.nutrition?.calories.upper} kcal
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Confidence: {Math.round(result.overallConfidence * 100)}%
          </p>
        </div>
      </article>
    </div>
  );
}

function RecoveryScene() {
  return (
    <div className="relative mx-auto flex h-full max-w-2xl items-center px-4">
      {DEMO_BADGE}
      <article className="w-full rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">Readiness</p>
        <p className="mt-2 text-6xl font-black text-white">
          {DEMO_READINESS.readinessScore}
          <span className="text-lg text-zinc-600">/100</span>
        </p>
        <div className="mt-5 space-y-2">
          {DEMO_READINESS.muscleRecovery.map((m) => (
            <div key={m.muscle} className="flex items-center gap-3">
              <span className="w-28 text-xs font-semibold capitalize text-zinc-400">
                {m.muscle.replace(/_/g, " ")}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${m.recoveryPercent}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-bold text-white">{m.recoveryPercent}%</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm font-black uppercase text-rose-300">
          Systemic fatigue: {DEMO_READINESS.systemicFatigue}
        </p>
      </article>
    </div>
  );
}

function DanteCoreScene() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {["TRAINING", "NUTRITION", "RECOVERY"].map((label) => (
          <span
            key={label}
            className="animate-pulse rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-400"
          >
            {label}
          </span>
        ))}
      </div>
      <ArrowRight className="size-6 rotate-90 text-amber-400" aria-hidden="true" />
      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-8 py-3 text-2xl font-black uppercase tracking-[0.3em] text-amber-300">
        Dante
      </span>
    </div>
  );
}

function RecommendationScene() {
  return (
    <div className="relative mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-5 px-4">
      {DEMO_BADGE}
      <div className="flex w-full flex-wrap items-center justify-center gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Planned</p>
          <p className="mt-1 text-2xl font-black text-white">
            {DEMO_PLANNED.plannedLoadKg} kg × {DEMO_PLANNED.plannedSets} × {DEMO_PLANNED.plannedRepRange}
          </p>
        </div>
        <ArrowRight className="size-6 text-amber-400" aria-hidden="true" />
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-6 py-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Adapted</p>
          <p className="mt-1 text-2xl font-black text-white">
            {DEMO_AUTOREGULATION_DECISION.recommendedLoadKg} kg × {DEMO_AUTOREGULATION_DECISION.recommendedSets}
          </p>
        </div>
      </div>
      <div className="w-full">
        <DecisionCard decision={DEMO_TRACEABLE_DECISION} explanation={DEMO_EXPLANATION} />
      </div>
    </div>
  );
}

function ClosedLoopScene() {
  const steps = [
    "Plan: 85 kg × 4 × 6",
    "User trains — SetVision measures 31% velocity loss",
    "Dante Core: next set → 80 kg",
    "User trains again — result improves",
    "Save — next workout planning incorporates this session",
  ];

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center px-4">
      <p className="mb-6 text-center text-[11px] font-black uppercase tracking-[0.22em] text-amber-400">
        The Closed Loop
      </p>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-sm font-black text-amber-300">
              {i + 1}
            </span>
            <p className="pt-1 text-base text-zinc-200">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SceneContent({ scene }: { scene: SceneId }) {
  switch (scene) {
    case "black":
      return <div className="h-full" />;
    case "logo":
      return <LogoScene />;
    case "dante_enter":
      return <DanteScene pose="walk_in" />;
    case "dante_intro":
      return <DanteScene pose="idle_breathing" />;
    case "problem":
      return <DanteScene pose="explain_gesture" />;
    case "setvision":
      return <SetVisionScene />;
    case "hawkerlens":
      return <HawkerLensScene />;
    case "recovery":
      return <RecoveryScene />;
    case "dante_core":
      return <DanteCoreScene />;
    case "recommendation":
      return <RecommendationScene />;
    case "pose":
      return <DanteScene pose="front_double_biceps" />;
    case "handoff":
      return <DanteScene pose="handoff" />;
    case "closed_loop":
      return <ClosedLoopScene />;
    default:
      return null;
  }
}
