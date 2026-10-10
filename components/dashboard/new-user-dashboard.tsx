import Link from "next/link";
import { Bot, ArrowRight, CheckCircle2, Circle } from "lucide-react";

export type NewUserDashboardProps = {
  displayName: string;
  hasProfileGoal: boolean;
  hasWorkoutPlan: boolean;
  hasNutritionTarget: boolean;
};

export function NewUserDashboard({
  displayName,
  hasProfileGoal,
  hasWorkoutPlan,
  hasNutritionTarget,
}: NewUserDashboardProps) {
  const steps = [
    {
      title: "Athlete Baseline",
      desc: "Set your primary fitness goal, age, and biological metrics.",
      completed: hasProfileGoal,
      href: "/dashboard/settings",
      actionText: "Complete Baseline",
    },
    {
      title: "Training Structure",
      desc: "Generate or assign your custom training split and target volume.",
      completed: hasWorkoutPlan,
      href: "/dashboard/workouts/plans",
      actionText: "Setup Training Plan",
    },
    {
      title: "Nutrition Target",
      desc: "Configure target calories and protein targets matching your goal.",
      completed: hasNutritionTarget,
      href: "/dashboard/nutrition",
      actionText: "Configure Nutrition",
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <div className="space-y-6">
      {/* 1. Welcome & Orientation */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-6 sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-wider text-mf-glass-brand">
          Welcome to Muscle Fitness
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
          Welcome, {displayName}. Let&apos;s build your foundation.
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mf-glass-text-muted">
          Your adaptive performance intelligence system learns from your real logs. Complete the 3 quick setup steps below so Dante can tailor your training adaptations and daily targets.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <div className="h-2 w-44 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-mf-glass-brand transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-mf-glass-text">
            {completedCount} of {steps.length} complete
          </span>
        </div>
      </section>

      {/* 2. Setup Progress Cards */}
      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((step, idx) => (
          <div
            key={step.title}
            className="flex flex-col justify-between rounded-xl border border-white/10 bg-mf-glass-surface p-5"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-mf-glass-text-muted">
                  Step 0{idx + 1}
                </span>
                {step.completed ? (
                  <CheckCircle2 className="size-4 text-emerald-400" />
                ) : (
                  <Circle className="size-4 text-zinc-600" />
                )}
              </div>

              <h3 className="mt-3 text-base font-bold text-white">{step.title}</h3>
              <p className="mt-1 text-xs text-mf-glass-text-muted">{step.desc}</p>
            </div>

            <div className="mt-5 pt-3 border-t border-white/5">
              <Link
                href={step.href}
                className={`inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition ${
                  step.completed
                    ? "border border-white/10 bg-white/[0.04] text-mf-glass-text hover:bg-white/[0.08]"
                    : "bg-mf-glass-brand text-mf-glass-brand-ink hover:bg-mf-glass-brand-hover"
                }`}
              >
                <span>{step.completed ? "Review Setup" : step.actionText}</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        ))}
      </section>

      {/* 3. Meet Dante */}
      <section className="rounded-2xl border border-white/10 bg-[#121422] p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-mf-violet/10 text-mf-violet border border-mf-violet/20">
              <Bot className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Meet Dante: Your Evidence-Aware Coach</h3>
              <p className="mt-1 text-xs text-zinc-400 max-w-xl">
                Dante adjusts workout volume based on your recovery, answers nutrition questions, and analyzes fatigue trends. You are always in control of any plan modifications.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/ai-coach"
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-mf-violet/30 bg-mf-violet/10 px-4 py-2 text-xs font-bold text-white hover:bg-mf-violet/20"
          >
            Introduce Yourself <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
