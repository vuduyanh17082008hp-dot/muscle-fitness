import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flame,
  Gauge,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Training Course | Muscle Fitness",
  description:
    "Structured strength and muscle-building programs designed around progression, discipline and measurable results.",
};

const benefits = [
  {
    icon: Target,
    title: "CLEAR DIRECTION",
    description:
      "Every workout has a defined exercise order, volume target and progression goal.",
  },
  {
    icon: TrendingUp,
    title: "PROGRESSIVE OVERLOAD",
    description:
      "Track repetitions and working weight so your performance continues moving forward.",
  },
  {
    icon: CalendarDays,
    title: "WEEKLY STRUCTURE",
    description:
      "Follow a training schedule built around your available days and recovery.",
  },
  {
    icon: ShieldCheck,
    title: "RECOVERY CONTROL",
    description:
      "Balance hard training with fatigue management, rest and sustainable volume.",
  },
];

const programs = [
  {
    number: "01",
    title: "FOUNDATION",
    level: "BEGINNER",
    duration: "8 WEEKS",
    frequency: "3 DAYS / WEEK",
    description:
      "Build exercise technique, consistency and a reliable strength foundation.",
    features: [
      "Full-body training structure",
      "Exercise technique guidance",
      "Simple progression system",
      "Basic recovery targets",
    ],
    featured: false,
  },
  {
    number: "02",
    title: "MUSCLE BUILDER",
    level: "INTERMEDIATE",
    duration: "12 WEEKS",
    frequency: "4–5 DAYS / WEEK",
    description:
      "Increase training volume and develop balanced muscle with structured hypertrophy work.",
    features: [
      "Push, pull and lower-body structure",
      "Muscle-group volume targets",
      "Progressive overload tracking",
      "Fatigue and deload management",
    ],
    featured: true,
  },
  {
    number: "03",
    title: "4D PERFORMANCE",
    level: "ADVANCED",
    duration: "16 WEEKS",
    frequency: "5–6 DAYS / WEEK",
    description:
      "A higher-volume system focused on weak points, strength and advanced progression.",
    features: [
      "Priority muscle specialization",
      "Advanced progression blocks",
      "Strength and hypertrophy phases",
      "Detailed performance tracking",
    ],
    featured: false,
  },
];

const exercises = [
  {
    name: "Barbell Bench Press",
    muscle: "Chest",
    sets: "4",
    reps: "6–8",
    rest: "120 sec",
  },
  {
    name: "Incline Dumbbell Press",
    muscle: "Upper Chest",
    sets: "3",
    reps: "8–10",
    rest: "90 sec",
  },
  {
    name: "Cable Chest Fly",
    muscle: "Chest",
    sets: "3",
    reps: "12–15",
    rest: "60 sec",
  },
  {
    name: "Cable Lateral Raise",
    muscle: "Side Delts",
    sets: "4",
    reps: "12–15",
    rest: "60 sec",
  },
];

const steps = [
  {
    number: "01",
    title: "CREATE YOUR PROFILE",
    description:
      "Enter your experience, schedule, equipment and priority muscle groups.",
  },
  {
    number: "02",
    title: "SELECT YOUR PROGRAM",
    description:
      "Choose a structure that matches your current level and available time.",
  },
  {
    number: "03",
    title: "COMPLETE THE WORK",
    description:
      "Follow every planned session and record your working sets accurately.",
  },
  {
    number: "04",
    title: "TRACK AND ADJUST",
    description:
      "Use performance data to increase weight, repetitions or training quality.",
  },
];

export default function TrainingCoursePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0c0a09] text-[#f3eadf]">
      {/* HERO */}
      <section className="relative isolate overflow-hidden border-b border-[#332a24]">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_80%_30%,rgba(190,148,92,0.2),transparent_30%),linear-gradient(135deg,#18120f_0%,#0c0a09_55%,#080706_100%)]" />

        <div className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:56px_56px]" />

        <div className="mx-auto grid min-h-[calc(100svh-72px)] max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
          <div>
            <p className="text-xs font-black tracking-[0.28em] text-[#cba36e]">
              MUSCLE FITNESS TRAINING SYSTEM
            </p>

            <h1 className="mt-6 text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-7xl lg:text-[88px]">
              TRAIN WITH
              <br />
              <span className="text-[#c59b63]">PURPOSE.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-[#b9aa98] sm:text-lg">
              Structured training programs built to remove confusion, improve
              performance and turn consistent effort into measurable progress.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#a47b48] bg-gradient-to-r from-[#d3ad77] to-[#987043] px-6 py-3 text-sm font-black tracking-[0.08em] text-[#17100a] transition hover:-translate-y-1"
              >
                START TRAINING
                <ArrowRight size={17} />
              </Link>

              <Link
                href="#programs"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#5a4b3d] bg-[#171310] px-6 py-3 text-sm font-bold tracking-[0.08em] transition hover:-translate-y-1 hover:border-[#a3835e]"
              >
                VIEW PROGRAMS
                <ChevronRight size={17} />
              </Link>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-5 border-t border-[#493c32] pt-7 sm:grid-cols-4">
              {[
                ["3", "TRAINING LEVELS"],
                ["8–16", "WEEK PROGRAMS"],
                ["100%", "TRACKABLE"],
                ["4D", "MENTALITY"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="text-2xl font-black text-[#e2bd8a]">{value}</p>
                  <p className="mt-2 text-[9px] font-bold tracking-[0.16em] text-[#8f8173]">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[500px]">
            <div className="absolute -inset-10 rounded-full bg-[#b88c54]/10 blur-3xl" />

            <div className="relative overflow-hidden rounded-3xl border border-[#67513f] bg-[#15110e] shadow-[0_35px_100px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between border-b border-[#3c3129] px-5 py-5 sm:px-6">
                <div>
                  <p className="text-[10px] font-black tracking-[0.2em] text-[#948575]">
                    TODAY&apos;S TRAINING
                  </p>

                  <h2 className="mt-2 text-xl font-black sm:text-2xl">
                    PUSH — CHEST FOCUS
                  </h2>
                </div>

                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#624b35] bg-[#271e17]">
                  <Dumbbell className="text-[#d2a66c]" size={24} />
                </div>
              </div>

              <div className="space-y-3 p-5">
                {exercises.slice(0, 3).map((exercise, index) => (
                  <div
                    key={exercise.name}
                    className="rounded-xl border border-[#3d322a] bg-[#1c1713] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[#564535] text-xs font-black text-[#c9a16d]">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <div className="min-w-0">
                          <p className="font-black">{exercise.name}</p>
                          <p className="mt-1 text-xs text-[#8f8172]">
                            {exercise.muscle}
                          </p>
                        </div>
                      </div>

                      <p className="shrink-0 text-sm font-black text-[#ddba89]">
                        {exercise.sets} × {exercise.reps}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 border-t border-[#3c3129]">
                {[
                  ["58 MIN", "DURATION"],
                  ["16", "WORKING SETS"],
                  ["HIGH", "INTENSITY"],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="border-r border-[#3c3129] p-4 text-center last:border-r-0 sm:p-5"
                  >
                    <p className="text-xs font-black text-[#e0bd8d] sm:text-sm">
                      {value}
                    </p>

                    <p className="mt-2 text-[7px] font-bold tracking-[0.1em] text-[#817568] sm:text-[8px]">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="border-b border-[#332a24] bg-[#100d0b]">
        <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
            BUILT FOR PROGRESS
          </p>

          <h2 className="mt-4 text-4xl font-black uppercase leading-[0.98] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            MORE THAN A LIST
            <br />
            <span className="text-[#c7a06b]">OF EXERCISES.</span>
          </h2>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <article
                  key={benefit.title}
                  className="rounded-2xl border border-[#44372e] bg-[#181310] p-7 transition duration-300 hover:-translate-y-1 hover:border-[#896c4d]"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-xl border border-[#674f38] bg-[#271e17]">
                    <Icon className="text-[#d1a66d]" size={22} />
                  </div>

                  <h3 className="mt-7 text-lg font-black tracking-[0.05em]">
                    {benefit.title}
                  </h3>

                  <p className="mt-4 leading-7 text-[#aa9b8a]">
                    {benefit.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* PROGRAMS */}
      <section
        id="programs"
        className="scroll-mt-24 bg-[#0c0a09]"
      >
        <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
            TRAINING COURSES
          </p>

          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="text-4xl font-black uppercase leading-[0.98] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
              SELECT YOUR
              <br />
              <span className="text-[#c7a06b]">STARTING LEVEL.</span>
            </h2>

            <p className="max-w-xl leading-8 text-[#aa9b8a]">
              Start with the program that matches your current experience, not
              the one that simply looks the most difficult.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {programs.map((program) => (
              <article
                key={program.title}
                className={`relative flex h-full flex-col rounded-3xl border p-7 ${
                  program.featured
                    ? "border-[#9b784f] bg-gradient-to-br from-[#30251c] to-[#17120f] shadow-[0_25px_80px_rgba(172,127,71,0.12)]"
                    : "border-[#493b31] bg-[#171310]"
                }`}
              >
                {program.featured && (
                  <div className="absolute right-6 top-0 -translate-y-1/2 rounded-full bg-[#c9a16d] px-4 py-2 text-[9px] font-black tracking-[0.14em] text-[#17100a]">
                    MOST POPULAR
                  </div>
                )}

                <p className="text-xs font-black tracking-[0.2em] text-[#887a6c]">
                  PROGRAM {program.number}
                </p>

                <h3 className="mt-5 text-3xl font-black">{program.title}</h3>

                <p className="mt-4 leading-7 text-[#b1a18f]">
                  {program.description}
                </p>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <ProgramStat label="LEVEL" value={program.level} />
                  <ProgramStat label="DURATION" value={program.duration} />
                </div>

                <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#44372e] bg-[#100d0b] p-4">
                  <Clock3 className="text-[#cda36c]" size={17} />

                  <div>
                    <p className="text-[9px] font-black tracking-[0.16em] text-[#817468]">
                      FREQUENCY
                    </p>

                    <p className="mt-1 text-sm font-black">
                      {program.frequency}
                    </p>
                  </div>
                </div>

                <ul className="mt-8 flex-1 space-y-4">
                  {program.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        className="mt-1 shrink-0 text-[#c99e65]"
                        size={16}
                      />

                      <span className="leading-6 text-[#c8b8a5]">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className={`mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 py-3 text-xs font-black tracking-[0.1em] transition hover:-translate-y-1 ${
                    program.featured
                      ? "bg-[#c9a16d] text-[#17100a]"
                      : "border border-[#67513d] bg-[#211a16]"
                  }`}
                >
                  SELECT PROGRAM
                  <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SESSION */}
      <section className="border-y border-[#332a24] bg-[#100d0b]">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-[.9fr_1.1fr] lg:px-8 lg:py-32">
          <div>
            <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
              SESSION STRUCTURE
            </p>

            <h2 className="mt-4 text-4xl font-black uppercase leading-[0.98] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
              KNOW EXACTLY
              <br />
              <span className="text-[#c7a06b]">WHAT TO DO.</span>
            </h2>

            <p className="mt-6 max-w-xl text-base leading-8 text-[#b2a391]">
              Every session presents the exercise order, working sets,
              repetition targets, rest periods and muscle focus.
            </p>

            <div className="mt-9 space-y-4">
              {[
                "Exercise and muscle target",
                "Working sets and repetition range",
                "Rest time between sets",
                "Previous performance history",
              ].map((item) => (
                <FeatureCheck key={item}>{item}</FeatureCheck>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[#62503f] bg-[#15110e] shadow-[0_30px_90px_rgba(0,0,0,0.4)]">
            <div className="flex flex-col gap-4 border-b border-[#3b3028] px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <div>
                <p className="text-[10px] font-black tracking-[0.2em] text-[#918273]">
                  WORKOUT PREVIEW
                </p>

                <h3 className="mt-2 text-xl font-black sm:text-2xl">
                  PUSH A — CHEST PRIORITY
                </h3>
              </div>

              <span className="w-fit rounded-full border border-[#5e4934] bg-[#261d16] px-4 py-2 text-xs font-black text-[#d4ac76]">
                58 MINUTES
              </span>
            </div>

            <div className="divide-y divide-[#342b24]">
              {exercises.map((exercise, index) => (
                <div
                  key={exercise.name}
                  className="grid gap-5 px-5 py-5 sm:grid-cols-[42px_1fr_repeat(3,auto)] sm:items-center sm:px-7"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-md border border-[#544334] text-xs font-black text-[#c99e65]">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div>
                    <p className="font-black">{exercise.name}</p>
                    <p className="mt-1 text-xs text-[#8b7e70]">
                      {exercise.muscle}
                    </p>
                  </div>

                  <WorkoutValue label="SETS" value={exercise.sets} />
                  <WorkoutValue label="REPS" value={exercise.reps} />
                  <WorkoutValue label="REST" value={exercise.rest} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="bg-[#0c0a09]">
        <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
            THE PROCESS
          </p>

          <h2 className="mt-4 text-4xl font-black uppercase leading-[0.98] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
            FROM PROFILE
            <br />
            <span className="text-[#c7a06b]">TO PROGRESSION.</span>
          </h2>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <article
                key={step.number}
                className="rounded-2xl border border-[#44372e] bg-[#171310] p-7"
              >
                <p className="text-4xl font-black text-[#5f4b38]">
                  {step.number}
                </p>

                <h3 className="mt-8 text-xl font-black">{step.title}</h3>

                <p className="mt-4 leading-7 text-[#aa9b8a]">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PROGRESS */}
      <section className="border-y border-[#332a24] bg-[#100d0b]">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-32">
          <div className="rounded-3xl border border-[#62503f] bg-[#15110e] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.4)] sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black tracking-[0.2em] text-[#918273]">
                  TRAINING PERFORMANCE
                </p>

                <h3 className="mt-2 text-2xl font-black">WEEKLY PROGRESS</h3>
              </div>

              <BarChart3 className="text-[#d1a66d]" size={27} />
            </div>

            <div className="mt-9 flex h-56 items-end gap-3 rounded-2xl border border-[#3c3129] bg-[#0f0d0b] p-5">
              {["40%", "52%", "48%", "66%", "71%", "78%", "89%"].map(
                (height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="flex h-full flex-1 items-end"
                  >
                    <div
                      style={{ height }}
                      className="w-full rounded-t-md bg-gradient-to-t from-[#765633] to-[#d5ad76]"
                    />
                  </div>
                ),
              )}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["12", "WORKOUTS"],
                ["92%", "COMPLETION"],
                ["+7.5 KG", "BENCH PRESS"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-xl border border-[#40352d] bg-[#1c1713] p-4 text-center"
                >
                  <p className="text-base font-black text-[#e0bd8d] sm:text-lg">
                    {value}
                  </p>

                  <p className="mt-2 text-[7px] font-black tracking-[0.1em] text-[#83766a] sm:text-[8px]">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
              MEASURABLE PROGRESS
            </p>

            <h2 className="mt-4 text-4xl font-black uppercase leading-[0.98] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
              TRACK THE WORK.
              <br />
              <span className="text-[#c7a06b]">EARN THE RESULT.</span>
            </h2>

            <p className="mt-6 max-w-xl text-base leading-8 text-[#b2a391]">
              Review completed sessions, total volume, strength changes and
              weekly consistency from your dashboard.
            </p>

            <div className="mt-9 space-y-4">
              {[
                {
                  icon: Gauge,
                  text: "Track workout completion and weekly consistency",
                },
                {
                  icon: TrendingUp,
                  text: "Compare working weight and repetitions",
                },
                {
                  icon: Flame,
                  text: "Build training streaks and stronger habits",
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.text} className="flex items-center gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#594532] bg-[#251c15]">
                      <Icon className="text-[#cea46b]" size={20} />
                    </div>

                    <p className="leading-7 text-[#c2b2a0]">{item.text}</p>
                  </div>
                );
              })}
            </div>

            <Link
              href="/dashboard"
              className="mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#5a4b3d] bg-[#171310] px-6 py-3 text-sm font-bold tracking-[0.08em] transition hover:-translate-y-1 hover:border-[#a3835e]"
            >
              OPEN DASHBOARD
              <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-[#17120f]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(195,151,94,0.22),transparent_44%)]" />

        <div className="mx-auto max-w-7xl px-5 py-24 text-center lg:px-8 lg:py-32">
          <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
            YOUR NEXT SESSION STARTS HERE
          </p>

          <h2 className="mx-auto mt-5 text-5xl font-black uppercase leading-[0.92] tracking-[-0.04em] sm:text-7xl">
            STOP TRAINING
            <br />
            <span className="text-[#c7a06b]">WITHOUT DIRECTION.</span>
          </h2>

          <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#bbaa97]">
            Select your level, follow the plan and begin turning every training
            session into measurable progress.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#a47b48] bg-gradient-to-r from-[#d3ad77] to-[#987043] px-7 py-3 text-sm font-black tracking-[0.08em] text-[#17100a] transition hover:-translate-y-1"
            >
              START TRAINING FREE
              <ArrowRight size={17} />
            </Link>

            <Link
              href="/story"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#5a4b3d] bg-[#171310] px-7 py-3 text-sm font-bold tracking-[0.08em] transition hover:-translate-y-1 hover:border-[#a3835e]"
            >
              READ MY STORY
              <ChevronRight size={17} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function FeatureCheck({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2c2118]">
        <Check className="text-[#d4aa71]" size={15} />
      </div>

      <p className="leading-7 text-[#c2b2a0]">{children}</p>
    </div>
  );
}

function ProgramStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[#44372e] bg-[#100d0b] p-4">
      <p className="text-[9px] font-black tracking-[0.16em] text-[#817468]">
        {label}
      </p>

      <p className="mt-2 text-sm font-black text-[#dec092]">{value}</p>
    </div>
  );
}

function WorkoutValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[8px] font-black tracking-[0.14em] text-[#7f7367]">
        {label}
      </p>

      <p className="mt-1 text-sm font-black text-[#e1c08f]">{value}</p>
    </div>
  );
}