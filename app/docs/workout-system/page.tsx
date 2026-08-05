import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Workout System | Muscle Fitness",
  description:
    "Learn how the Muscle Fitness workout system creates, schedules, and tracks your training.",
};

const systemSteps = [
  {
    number: "01",
    title: "Complete your fitness profile",
    description:
      "Enter your goal, training experience, available equipment, preferred schedule, and priority muscles.",
  },
  {
    number: "02",
    title: "Receive your workout plan",
    description:
      "Muscle Fitness builds a structured workout plan based on your personal information and training goal.",
  },
  {
    number: "03",
    title: "Follow your daily sessions",
    description:
      "Open your dashboard to see today's exercises, sets, repetitions, rest periods, and coaching notes.",
  },
  {
    number: "04",
    title: "Record your performance",
    description:
      "Log the weight, repetitions, completed sets, effort level, and notes for every exercise.",
  },
  {
    number: "05",
    title: "Track progressive overload",
    description:
      "Your previous workout data helps you understand when to increase weight, repetitions, or training volume.",
  },
  {
    number: "06",
    title: "Adjust and improve",
    description:
      "Your plan can be updated as your strength, recovery, schedule, and fitness goals change.",
  },
];

const coreFeatures = [
  "Personalised workout programming",
  "Daily exercise instructions",
  "Sets, repetitions, weight and rest tracking",
  "Workout history",
  "Progressive overload guidance",
  "Weekly training adherence",
  "Recovery and performance monitoring",
  "Mobile-friendly workout logging",
];

export default function WorkoutSystemDocumentationPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(180,83,9,0.18),transparent_38%)]">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-12 lg:py-28">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 transition hover:text-white"
          >
            <span aria-hidden="true">←</span>
            Return to homepage
          </Link>

          <div className="mt-12 max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-500">
              Muscle Fitness Documentation
            </p>

            <h1 className="mt-5 text-4xl font-black uppercase tracking-tight sm:text-5xl lg:text-7xl">
              The Workout
              <span className="block text-amber-500">System</span>
            </h1>

            <p className="mt-7 max-w-3xl text-base leading-8 text-neutral-300 sm:text-lg">
              The Muscle Fitness workout system turns your personal fitness
              information into a structured training experience. It helps you
              understand what to train, how to perform each session, and how to
              improve over time.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/workouts"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-amber-500 px-7 py-3 text-sm font-bold uppercase tracking-wider text-black transition hover:bg-amber-400"
              >
                Open Workouts
              </Link>

              <Link
                href="/dashboard"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-7 py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:border-white/30 hover:bg-white/10"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-12">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-500">
              How it works
            </p>

            <h2 className="mt-4 text-3xl font-black uppercase tracking-tight sm:text-4xl">
              From profile to progress
            </h2>

            <p className="mt-5 max-w-xl leading-7 text-neutral-400">
              Each part of the system is connected. Your profile creates the
              foundation, your workout logs record your performance, and your
              progress data helps guide future training decisions.
            </p>
          </div>

          <div className="grid gap-4">
            {systemSteps.map((step) => (
              <article
                key={step.number}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-amber-500/40 hover:bg-white/[0.05]"
              >
                <div className="flex gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 font-black text-amber-500">
                    {step.number}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {step.title}
                    </h3>

                    <p className="mt-2 leading-7 text-neutral-400">
                      {step.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-12">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-500">
              Core features
            </p>

            <h2 className="mt-4 text-3xl font-black uppercase tracking-tight sm:text-4xl">
              Everything needed to train with purpose
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {coreFeatures.map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-white/10 bg-neutral-950 p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-black"
                  >
                    ✓
                  </span>

                  <p className="font-medium leading-6 text-neutral-200">
                    {feature}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-8 lg:px-12">
        <div className="overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/15 via-neutral-900 to-neutral-950 p-8 sm:p-12">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-500">
              Dedication. Determination. Drive. Discipline.
            </p>

            <h2 className="mt-5 text-3xl font-black uppercase tracking-tight sm:text-5xl">
              Your progress is built one session at a time.
            </h2>

            <p className="mt-6 max-w-2xl leading-7 text-neutral-300">
              Consistency matters more than perfection. Follow the plan, record
              your performance honestly, recover properly, and continue moving
              forward.
            </p>

            <Link
              href="/workouts"
              className="mt-9 inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-7 py-3 text-sm font-bold uppercase tracking-wider text-black transition hover:bg-neutral-200"
            >
              Start Training
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}