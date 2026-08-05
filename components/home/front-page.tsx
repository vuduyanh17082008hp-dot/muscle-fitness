"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  ChartLine,
  Check,
  ChevronRight,
  CircleGauge,
  Dumbbell,
  Flame,
  HeartPulse,
  Quote,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  domAnimation,
  LazyMotion,
  m,
  useReducedMotion,
} from "framer-motion";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

type SectionHeadingProps = {
  eyebrow: string;
  title: ReactNode;
  description?: string;
};

type Benefit = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const benefits: Benefit[] = [
  {
    icon: Target,
    title: "CLEAR DIRECTION",
    description:
      "Know what to train, what to eat and which target matters next.",
  },
  {
    icon: Brain,
    title: "SMARTER DECISIONS",
    description:
      "Use your profile, recovery and progress data instead of guesswork.",
  },
  {
    icon: ShieldCheck,
    title: "SUSTAINABLE STRUCTURE",
    description:
      "Build a repeatable system instead of depending on temporary motivation.",
  },
  {
    icon: TrendingUp,
    title: "VISIBLE PROGRESS",
    description:
      "Track the work consistently and understand what should change.",
  },
];

const pricingPlans = [
  {
    name: "FREE",
    label: "SGD 0",
    description: "Start building your fitness system.",
    features: [
      "Personal profile and goal setup",
      "Starting calorie and macro targets",
      "Basic workout tracking",
      "Progress dashboard access",
    ],
    button: "START FREE",
    href: "/signup",
    featured: false,
  },
  {
    name: "GROUP COACHING",
    label: "MEMBERSHIP",
    description: "Structure, accountability and team support.",
    features: [
      "Structured training programs",
      "Nutrition guidance",
      "Weekly progression targets",
      "Group accountability",
    ],
    button: "VIEW GROUP COACHING",
    href: "/signup",
    featured: true,
  },
  {
    name: "PRIVATE 1V1",
    label: "APPLICATION",
    description: "Maximum personalization and direct feedback.",
    features: [
      "Individual training structure",
      "Personal calorie and macro setup",
      "Private check-ins",
      "Plan adjustments and analysis",
    ],
    button: "APPLY FOR 1V1",
    href: "/signup",
    featured: false,
  },
];

const journeyStages = [
  {
    number: "01",
    title: "THE BEGINNING",
    description:
      "At 88 kilograms, the physical weight was visible. The insecurity, shame and frustration were not.",
  },
  {
    number: "02",
    title: "THE DECISION",
    description:
      "The turning point came when waiting became more painful than beginning.",
  },
  {
    number: "03",
    title: "THE WORK",
    description:
      "Training, controlled nutrition and difficult repetition slowly replaced excuses.",
  },
  {
    number: "04",
    title: "THE PURPOSE",
    description:
      "Reaching 68 kilograms became proof that a system could rebuild more than a body.",
  },
];

const chartHeights = [
  "42%",
  "52%",
  "47%",
  "60%",
  "56%",
  "68%",
  "64%",
  "73%",
  "78%",
  "75%",
  "86%",
  "94%",
];

function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <m.div
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{
        duration: 0.65,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </m.div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <Reveal className="max-w-4xl">
      <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
        {eyebrow}
      </p>

      <h2 className="mt-4 text-4xl font-black uppercase leading-[0.98] tracking-[-0.03em] text-[#f3eadf] sm:text-5xl lg:text-6xl">
        {title}
      </h2>

      {description && (
        <p className="mt-6 max-w-3xl text-base leading-8 text-[#b9aa98] sm:text-lg">
          {description}
        </p>
      )}
    </Reveal>
  );
}

function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#a47b48] bg-gradient-to-r from-[#d3ad77] to-[#987043] px-6 py-3 text-sm font-black tracking-[0.08em] text-[#17100a] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(190,153,101,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d3ad77]"
    >
      {children}
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  );
}

function SecondaryButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#5a4b3d] bg-[#171310]/90 px-6 py-3 text-sm font-bold tracking-[0.08em] text-[#efe3d3] transition duration-300 hover:-translate-y-1 hover:border-[#a3835e] hover:bg-[#211a16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3835e]"
    >
      {children}
      <ChevronRight size={17} aria-hidden="true" />
    </Link>
  );
}

export default function FrontPage() {
  return (
    <LazyMotion features={domAnimation}>
      <main className="min-h-screen overflow-x-hidden bg-[#0d0b0a] text-[#f3eadf]">
        {/* HERO */}
        <section className="relative isolate overflow-hidden border-b border-[#3c322a]">
          <div className="absolute inset-0 -z-30">
            <Image
              src="/images/front-page/hero.webp"
              alt=""
              fill
              priority
              quality={78}
              sizes="100vw"
              className="object-cover object-center"
            />
          </div>

          <div className="absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(8,7,6,0.97)_0%,rgba(8,7,6,0.9)_42%,rgba(8,7,6,0.45)_72%,rgba(8,7,6,0.75)_100%)]" />

          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_30%,rgba(190,153,101,0.2),transparent_28%),linear-gradient(to_top,rgba(13,11,10,1),transparent_45%)]" />

          <div className="mx-auto grid min-h-[calc(100svh-72px)] max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.12fr_.88fr] lg:px-8">
            <Reveal>
              <p className="text-xs font-black tracking-[0.28em] text-[#d2aa74]">
                BUILT FROM THE WORK NOBODY SAW
              </p>

              <h1 className="mt-6 max-w-5xl text-5xl font-black uppercase leading-[0.88] tracking-[-0.05em] sm:text-7xl lg:text-[94px]">
                DEDICATION
                <br />
                <span className="text-[#c7a06b]">MADE THE</span>
                <br />
                DIFFERENCE.
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-8 text-[#d0c0ad] sm:text-lg">
                Muscle Fitness combines training, nutrition, progress tracking
                and intelligent coaching into one system built around your
                goals.
              </p>

              <div className="mt-7 max-w-2xl border-l-4 border-[#b9915e] bg-[#17120f]/85 px-5 py-5 backdrop-blur-sm sm:px-6">
                <p className="text-lg leading-8 text-[#eadbc7]">
                  “You will always wish you started sooner. But today is the
                  youngest you will ever be.”
                </p>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <PrimaryButton href="/signup">
                  START YOUR TRANSFORMATION
                </PrimaryButton>

                <SecondaryButton href="/story">
                  READ MY STORY
                </SecondaryButton>
              </div>

              <div className="mt-10 grid max-w-2xl grid-cols-2 gap-4 border-t border-[#5a4a3c]/70 pt-6 sm:grid-cols-4">
                {[
                  ["88 KG", "THE START"],
                  ["68 KG", "THE PROOF"],
                  ["4D", "THE MINDSET"],
                  ["ONE", "SYSTEM"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <div className="text-xl font-black text-[#f1dfc7]">
                      {value}
                    </div>
                    <div className="mt-1 text-[10px] font-bold tracking-[0.15em] text-[#948676]">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal
              delay={0.15}
              className="relative mx-auto hidden w-full max-w-[460px] lg:block"
            >
              <div className="relative overflow-hidden rounded-3xl border border-[#6d5947] bg-[#15110e]/90 p-7 shadow-[0_35px_100px_rgba(0,0,0,0.55)] backdrop-blur-lg">
                <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),transparent_40%)]" />

                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.2em] text-[#a9947d]">
                      TODAY&apos;S STANDARD
                    </p>
                    <p className="mt-2 text-2xl font-black">
                      DO THE WORK ANYWAY.
                    </p>
                  </div>

                  <div className="grid h-12 w-12 place-items-center rounded-full border border-[#7d6346] bg-[#231b15]">
                    <Flame className="text-[#d3aa72]" size={22} />
                  </div>
                </div>

                <div className="relative mt-10 space-y-5">
                  {[
                    ["TRAINING", "Completed", "100%"],
                    ["NUTRITION", "On target", "92%"],
                    ["RECOVERY", "Improving", "78%"],
                  ].map(([title, status, percentage]) => (
                    <div key={title}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black tracking-[0.15em]">
                          {title}
                        </span>
                        <span className="text-[#9f907e]">{status}</span>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#352b23]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#8f6b40] to-[#d5ad76]"
                          style={{ width: percentage }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="relative mt-10 rounded-2xl border border-[#564536] bg-[#0d0b0a]/75 p-5">
                  <div className="flex items-start gap-4">
                    <CircleGauge
                      className="mt-1 shrink-0 text-[#d3aa72]"
                      size={25}
                    />

                    <div>
                      <p className="text-xs font-black tracking-[0.16em] text-[#a9957d]">
                        READINESS
                      </p>
                      <p className="mt-2 text-3xl font-black">84 / 100</p>
                      <p className="mt-2 text-sm leading-6 text-[#a99a89]">
                        Ready to train. Keep intensity controlled and complete
                        the planned work.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* TRANSFORMATION */}
        <section className="border-b border-[#352c25] bg-[#100d0b]">
          <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
            <SectionHeading
              eyebrow="THE TRANSFORMATION"
              title={
                <>
                  THE BODY CHANGED BECAUSE
                  <br />
                  <span className="text-[#c7a06b]">
                    THE COMMITMENT REMAINED.
                  </span>
                </>
              }
              description="The transformation was not one perfect decision. It was the accumulation of difficult days, controlled choices and work completed without applause."
            />

            <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-[1fr_auto_1fr]">
              <Reveal>
                <article className="flex h-full min-h-[360px] flex-col justify-between rounded-3xl border border-[#4b3d32] bg-gradient-to-br from-[#1d1713] to-[#100d0b] p-7 sm:p-9">
                  <div>
                    <p className="text-xs font-black tracking-[0.22em] text-[#918374]">
                      THE BEGINNING
                    </p>

                    <p className="mt-7 text-[88px] font-black leading-none tracking-[-0.07em] text-[#806f5e] sm:text-[120px]">
                      88
                    </p>

                    <p className="mt-1 text-xl font-black tracking-[0.15em]">
                      KILOGRAMS
                    </p>
                  </div>

                  <p className="mt-10 max-w-md leading-7 text-[#aa9a89]">
                    Struggling to run, avoiding cameras and feeling controlled
                    by insecurity.
                  </p>
                </article>
              </Reveal>

              <div className="hidden items-center lg:flex">
                <ArrowRight className="text-[#b9915e]" size={38} />
              </div>

              <Reveal delay={0.1}>
                <article className="flex h-full min-h-[360px] flex-col justify-between rounded-3xl border border-[#9a754b] bg-gradient-to-br from-[#30241a] via-[#1c1611] to-[#100d0b] p-7 shadow-[0_24px_80px_rgba(175,132,75,0.12)] sm:p-9">
                  <div>
                    <p className="text-xs font-black tracking-[0.22em] text-[#d1aa75]">
                      THE PROOF
                    </p>

                    <p className="mt-7 text-[88px] font-black leading-none tracking-[-0.07em] text-[#e0bd8d] sm:text-[120px]">
                      68
                    </p>

                    <p className="mt-1 text-xl font-black tracking-[0.15em]">
                      KILOGRAMS
                    </p>
                  </div>

                  <p className="mt-10 max-w-md leading-7 text-[#c9b8a3]">
                    A stronger body, greater confidence and proof that
                    discipline could rebuild an identity.
                  </p>
                </article>
              </Reveal>
            </div>

            <Reveal className="mt-6 grid gap-4 sm:grid-cols-3" delay={0.15}>
              {[
                ["20 KG", "TOTAL CHANGE"],
                ["8 MONTHS", "OF CONSISTENT WORK"],
                ["4D", "DEDICATION. DETERMINATION. DRIVE. DISCIPLINE."],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-[#43372e] bg-[#171310] p-6"
                >
                  <div className="text-3xl font-black text-[#d5ad76]">
                    {value}
                  </div>
                  <div className="mt-2 text-xs font-bold tracking-[0.14em] text-[#9e8f7e]">
                    {label}
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* STORY PREVIEW */}
        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <SectionHeading
            eyebrow="MY STORY"
            title="TRANSFORMATION STARTED BEFORE THE BODY CHANGED."
            description="Muscle Fitness was created from the experience of feeling lost, beginning without confidence and learning how structure can change a life."
          />

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {journeyStages.map((stage, index) => (
              <Reveal key={stage.number} delay={index * 0.06}>
                <article className="group h-full rounded-2xl border border-[#43372e] bg-gradient-to-b from-[#211a16] to-[#15110e] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#886c4c]">
                  <div className="text-xs font-black tracking-[0.2em] text-[#8e8172]">
                    {stage.number}
                  </div>

                  <h3 className="mt-8 text-2xl font-black tracking-wide text-[#ead8bf]">
                    {stage.title}
                  </h3>

                  <p className="mt-4 leading-7 text-[#ae9f8e]">
                    {stage.description}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-10">
            <SecondaryButton href="/story">
              READ THE COMPLETE STORY
            </SecondaryButton>
          </Reveal>
        </section>

        {/* BENEFITS */}
        <section className="border-y border-[#3b3129] bg-[#12100e]">
          <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
            <SectionHeading
              eyebrow="WHY MUSCLE FITNESS"
              title="STOP GUESSING. START FOLLOWING A SYSTEM."
              description="The platform is designed to connect every important part of your transformation instead of separating training, food and progress into unrelated tools."
            />

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {benefits.map((benefit, index) => {
                const Icon = benefit.icon;

                return (
                  <Reveal key={benefit.title} delay={index * 0.06}>
                    <article className="h-full rounded-2xl border border-[#493b31] bg-[#191411] p-7 transition hover:border-[#917351] hover:bg-[#211a15]">
                      <div className="grid h-12 w-12 place-items-center rounded-xl border border-[#674f38] bg-[#271e17]">
                        <Icon className="text-[#d1a66d]" size={22} />
                      </div>

                      <h3 className="mt-8 text-xl font-black tracking-[0.06em]">
                        {benefit.title}
                      </h3>

                      <p className="mt-4 leading-7 text-[#ac9d8c]">
                        {benefit.description}
                      </p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* WORKOUT FEATURE */}
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-32">
          <div>
            <SectionHeading
              eyebrow="WORKOUT SYSTEM"
              title="TRAIN WITH A PURPOSE BEHIND EVERY SET."
              description="Your training structure should reflect your experience, schedule, equipment, recovery and priority muscle groups."
            />

            <Reveal className="mt-9 space-y-4">
              {[
                "Training frequency built around your schedule",
                "Sets, repetitions and rest periods",
                "Priority muscle and weakness analysis",
                "Progressive overload and completed-session tracking",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2c2118]">
                    <Check className="text-[#d4aa71]" size={15} />
                  </div>

                  <p className="leading-7 text-[#c2b2a0]">{item}</p>
                </div>
              ))}
            </Reveal>

            <Reveal className="mt-9">
              <PrimaryButton href="/training">
                EXPLORE TRAINING
              </PrimaryButton>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="overflow-hidden rounded-3xl border border-[#65513f] bg-[#15110e] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-[#3d322a] px-6 py-5">
                <div>
                  <p className="text-[10px] font-black tracking-[0.2em] text-[#978776]">
                    TODAY&apos;S SESSION
                  </p>
                  <h3 className="mt-2 text-2xl font-black">
                    PUSH — CHEST PRIORITY
                  </h3>
                </div>

                <Dumbbell className="text-[#d3aa72]" size={27} />
              </div>

              <div className="space-y-3 p-5 sm:p-6">
                {[
                  ["BARBELL BENCH PRESS", "4 × 6–8", "120 SEC"],
                  ["INCLINE DUMBBELL PRESS", "3 × 8–10", "90 SEC"],
                  ["CABLE FLY", "3 × 12–15", "60 SEC"],
                  ["LATERAL RAISE", "4 × 12–15", "60 SEC"],
                ].map(([exercise, sets, rest], index) => (
                  <div
                    key={exercise}
                    className="grid gap-4 rounded-xl border border-[#3e332b] bg-[#1c1713] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  >
                    <div className="flex items-center gap-4">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[#564535] text-xs font-black text-[#c9a16d]">
                        {String(index + 1).padStart(2, "0")}
                      </div>

                      <p className="font-black tracking-[0.04em]">{exercise}</p>
                    </div>

                    <div>
                      <p className="text-[9px] font-bold tracking-[0.15em] text-[#807467]">
                        SETS × REPS
                      </p>
                      <p className="mt-1 text-sm font-black">{sets}</p>
                    </div>

                    <div>
                      <p className="text-[9px] font-bold tracking-[0.15em] text-[#807467]">
                        REST
                      </p>
                      <p className="mt-1 text-sm font-black">{rest}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* NUTRITION */}
        <section className="border-y border-[#3b3129] bg-[#12100e]">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-32">
            <Reveal className="order-2 lg:order-1">
              <div className="rounded-3xl border border-[#65513f] bg-[#15110e] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] sm:p-7">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.2em] text-[#978776]">
                      DAILY NUTRITION
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      PERSONAL TARGETS
                    </h3>
                  </div>

                  <Utensils className="text-[#d3aa72]" size={26} />
                </div>

                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["2,300", "KCAL"],
                    ["160 G", "PROTEIN"],
                    ["310 G", "CARBS"],
                    ["48 G", "FATS"],
                  ].map(([value, label]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-[#40352d] bg-[#1c1713] p-4"
                    >
                      <p className="text-xl font-black text-[#e0bd8d]">
                        {value}
                      </p>
                      <p className="mt-2 text-[9px] font-black tracking-[0.17em] text-[#83766a]">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-7 space-y-4">
                  {[
                    ["CALORIES", "1,760 / 2,300", "76%"],
                    ["PROTEIN", "126 / 160 G", "79%"],
                    ["WATER", "2.1 / 3.0 L", "70%"],
                  ].map(([label, value, width]) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-black tracking-[0.14em]">
                          {label}
                        </span>
                        <span className="text-[#9e8f7f]">{value}</span>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#352b23]">
                        <div
                          style={{ width }}
                          className="h-full rounded-full bg-gradient-to-r from-[#8f6b40] to-[#d5ad76]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-7 rounded-xl border border-[#44372d] bg-[#201912] p-5">
                  <p className="text-xs font-black tracking-[0.15em] text-[#d3aa72]">
                    NEXT MEAL
                  </p>
                  <p className="mt-3 font-black">
                    BASMATI RICE • CHICKEN • VEGETABLES
                  </p>
                  <p className="mt-2 text-sm text-[#9e8f7f]">
                    510 kcal • 42 g protein • 64 g carbohydrates
                  </p>
                </div>
              </div>
            </Reveal>

            <div className="order-1 lg:order-2">
              <SectionHeading
                eyebrow="SMART NUTRITION"
                title="TURN CALORIES AND MACROS INTO A PLAN YOU CAN FOLLOW."
                description="Nutrition targets are calculated from the user's profile, goal and activity before being organized into a practical daily structure."
              />

              <Reveal className="mt-9 space-y-4">
                {[
                  "Calories and complete macro breakdown",
                  "Meal plans adapted to goals and profile",
                  "Food alternatives and portion guidance",
                  "Daily intake and consistency tracking",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2c2118]">
                      <Check className="text-[#d4aa71]" size={15} />
                    </div>

                    <p className="leading-7 text-[#c2b2a0]">{item}</p>
                  </div>
                ))}
              </Reveal>

              <Reveal className="mt-9">
                <PrimaryButton href="/meal-plan">
                  EXPLORE NUTRITION
                </PrimaryButton>
              </Reveal>
            </div>
          </div>
        </section>

        {/* PROGRESS */}
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-32">
          <div>
            <SectionHeading
              eyebrow="PROGRESS TRACKING"
              title="MAKE THE WORK VISIBLE."
              description="Measure consistency, strength, bodyweight and nutrition instead of judging progress from one difficult day."
            />

            <Reveal className="mt-9 space-y-4">
              {[
                "Bodyweight and measurement history",
                "Workout completion and training volume",
                "Calorie and protein adherence",
                "Weekly trends and adjustment signals",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2c2118]">
                    <Check className="text-[#d4aa71]" size={15} />
                  </div>

                  <p className="leading-7 text-[#c2b2a0]">{item}</p>
                </div>
              ))}
            </Reveal>

            <Reveal className="mt-9">
              <SecondaryButton href="/dashboard">
                VIEW PROGRESS DASHBOARD
              </SecondaryButton>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="rounded-3xl border border-[#65513f] bg-[#15110e] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black tracking-[0.2em] text-[#978776]">
                    12-WEEK TREND
                  </p>
                  <h3 className="mt-2 text-2xl font-black">
                    CONSISTENCY SCORE
                  </h3>
                </div>

                <ChartLine className="text-[#d3aa72]" size={27} />
              </div>

              <div className="mt-8 flex h-56 items-end gap-2 rounded-2xl border border-[#3e332b] bg-[#100d0b] p-5">
                {chartHeights.map((height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="group relative flex h-full flex-1 items-end"
                  >
                    <div
                      style={{ height }}
                      className="w-full rounded-t-sm bg-gradient-to-t from-[#765633] to-[#d5ad76] opacity-75 transition group-hover:opacity-100"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  ["91%", "WORKOUTS"],
                  ["87%", "NUTRITION"],
                  ["12", "WEEK STREAK"],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-[#40352d] bg-[#1c1713] p-4 text-center"
                  >
                    <p className="text-xl font-black text-[#e0bd8d]">
                      {value}
                    </p>
                    <p className="mt-2 text-[8px] font-black tracking-[0.14em] text-[#83766a] sm:text-[9px]">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* AI COACH */}
        <section className="border-y border-[#3b3129] bg-[#12100e]">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-2 lg:px-8 lg:py-32">
            <Reveal>
              <div className="overflow-hidden rounded-3xl border border-[#65513f] bg-[#15110e] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-[#3d322a] px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-full border border-[#6c5135] bg-[#2a2017]">
                      <Bot className="text-[#d3aa72]" size={21} />
                    </div>

                    <div>
                      <h3 className="font-black">MUSCLE FITNESS COACH</h3>
                      <p className="mt-1 text-xs text-[#8f8172]">
                        Uses your profile and logged data
                      </p>
                    </div>
                  </div>

                  <span className="h-2.5 w-2.5 rounded-full bg-[#87a57a]" />
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#2c2118] px-5 py-4">
                    <p className="leading-7 text-[#eadccb]">
                      What should I train today?
                    </p>
                  </div>

                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-[#493b30] bg-[#1c1713] px-5 py-4">
                    <p className="leading-7 text-[#c7b7a4]">
                      Your chest is a priority muscle and recovery is currently
                      good. Complete the planned Push session, keep one to two
                      repetitions in reserve and log every working set.
                    </p>

                    <div className="mt-4 rounded-xl border border-[#4e3e31] bg-[#100d0b] p-4">
                      <p className="text-xs font-black tracking-[0.14em] text-[#d3aa72]">
                        TODAY&apos;S FOCUS
                      </p>
                      <p className="mt-2 font-black">
                        CHEST • SIDE DELTS • TRICEPS
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      "Adjust my calories",
                      "Check my recovery",
                      "Analyze weak points",
                    ].map((prompt) => (
                      <span
                        key={prompt}
                        className="rounded-full border border-[#493b30] px-3 py-2 text-xs text-[#a99a89]"
                      >
                        {prompt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            <div>
              <SectionHeading
                eyebrow="AI COACH PREVIEW"
                title="USE YOUR DATA TO MAKE THE NEXT DECISION."
                description="The AI Coach is designed to connect training, nutrition, recovery and progress information instead of giving generic advice without context."
              />

              <Reveal className="mt-9 space-y-4">
                {[
                  "Daily training recommendations",
                  "Nutrition and calorie adjustments",
                  "Recovery and readiness guidance",
                  "Weak-point and consistency analysis",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2c2118]">
                      <Sparkles className="text-[#d4aa71]" size={14} />
                    </div>

                    <p className="leading-7 text-[#c2b2a0]">{item}</p>
                  </div>
                ))}
              </Reveal>

              <Reveal className="mt-9">
                <PrimaryButton href="/dashboard">
                  OPEN YOUR DASHBOARD
                </PrimaryButton>
              </Reveal>
            </div>
          </div>
        </section>

        {/* COACHING */}
        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <SectionHeading
            eyebrow="COACHING OPTIONS"
            title="CHOOSE THE LEVEL OF SUPPORT YOU NEED."
            description="Use the platform independently, train with a group or receive a more individualized coaching structure."
          />

          <div className="mt-14 grid gap-5 lg:grid-cols-2">
            <Reveal>
              <article className="h-full rounded-3xl border border-[#493c31] bg-[#171310] p-7 sm:p-9">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black tracking-[0.23em] text-[#c2a06f]">
                    GROUP COACHING
                  </p>
                  <HeartPulse className="text-[#b99463]" size={25} />
                </div>

                <h3 className="mt-5 text-4xl font-black tracking-tight">
                  IRON CREW
                </h3>

                <p className="mt-5 max-w-xl leading-7 text-[#bbaa96]">
                  Train with structure, accountability and people working
                  toward stronger versions of themselves.
                </p>

                <ul className="mt-8 space-y-4">
                  {[
                    "Goal-based training programs",
                    "Nutrition guidance",
                    "Weekly targets",
                    "Community accountability",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <Check className="text-[#c49b66]" size={17} />
                      <span className="text-[#d0c0ac]">{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-9">
                  <SecondaryButton href="/signup">
                    VIEW GROUP COACHING
                  </SecondaryButton>
                </div>
              </article>
            </Reveal>

            <Reveal delay={0.08}>
              <article className="h-full rounded-3xl border border-[#96764f] bg-gradient-to-br from-[#2e241b] to-[#17120f] p-7 shadow-[0_25px_80px_rgba(168,123,70,0.1)] sm:p-9">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black tracking-[0.23em] text-[#d2aa74]">
                    PRIVATE 1V1
                  </p>
                  <Dumbbell className="text-[#d2aa74]" size={25} />
                </div>

                <h3 className="mt-5 text-4xl font-black tracking-tight">
                  PERSONAL COACHING
                </h3>

                <p className="mt-5 max-w-xl leading-7 text-[#c8b7a2]">
                  A more personal system for clients who need individualized
                  training, nutrition and direct feedback.
                </p>

                <ul className="mt-8 space-y-4">
                  {[
                    "Individual training structure",
                    "Personal calories and macros",
                    "Private progress check-ins",
                    "Ongoing plan adjustments",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <Check className="text-[#d1a66d]" size={17} />
                      <span className="text-[#d4c4b0]">{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-9">
                  <PrimaryButton href="/signup">
                    APPLY FOR PRIVATE COACHING
                  </PrimaryButton>
                </div>
              </article>
            </Reveal>
          </div>
        </section>

        {/* PRICING */}
        <section className="border-y border-[#3b3129] bg-[#12100e]">
          <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
            <SectionHeading
              eyebrow="MEMBERSHIP"
              title="START WITH THE SYSTEM. LEVEL UP WITH SUPPORT."
              description="The free plan provides a starting point. Coaching options add structure, accountability and personalization."
            />

            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {pricingPlans.map((plan, index) => (
                <Reveal key={plan.name} delay={index * 0.06}>
                  <article
                    className={`flex h-full flex-col rounded-3xl border p-7 ${
                      plan.featured
                        ? "border-[#98764f] bg-gradient-to-br from-[#2c221a] to-[#17120f] shadow-[0_24px_70px_rgba(167,123,69,0.1)]"
                        : "border-[#493b31] bg-[#171310]"
                    }`}
                  >
                    <p className="text-xs font-black tracking-[0.18em] text-[#9a8a79]">
                      {plan.label}
                    </p>

                    <h3 className="mt-4 text-3xl font-black">{plan.name}</h3>

                    <p className="mt-4 min-h-14 leading-7 text-[#b5a593]">
                      {plan.description}
                    </p>

                    <ul className="mt-8 flex-1 space-y-4">
                      {plan.features.map((feature) => (
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
                      href={plan.href}
                      className={`mt-9 inline-flex min-h-12 items-center justify-center rounded-md px-5 py-3 text-center text-xs font-black tracking-[0.1em] transition hover:-translate-y-1 ${
                        plan.featured
                          ? "bg-[#c9a16d] text-[#17100a]"
                          : "border border-[#67513d] bg-[#211a16]"
                      }`}
                    >
                      {plan.button}
                    </Link>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FUTURE RESULTS */}
        <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
          <SectionHeading
            eyebrow="THE RESULTS WE ARE BUILDING TOWARD"
            title="NOT EMPTY MOTIVATION. MEASURABLE CHANGE."
            description="Muscle Fitness is still building its client result library. These are the outcomes the system is designed to support, not fabricated testimonials or guaranteed results."
          />

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Flame,
                title: "CONSISTENCY",
                text: "More planned sessions completed across each week.",
              },
              {
                icon: Dumbbell,
                title: "STRENGTH",
                text: "Visible progression in repetitions, load and control.",
              },
              {
                icon: Utensils,
                title: "NUTRITION CONTROL",
                text: "Better understanding of portions, calories and macros.",
              },
              {
                icon: Brain,
                title: "CONFIDENCE",
                text: "Greater trust in the system and in your own decisions.",
              },
            ].map((result, index) => {
              const Icon = result.icon;

              return (
                <Reveal key={result.title} delay={index * 0.06}>
                  <article className="h-full rounded-2xl border border-[#43372e] bg-[#171310] p-7">
                    <Icon className="text-[#cda36c]" size={26} />

                    <h3 className="mt-8 text-xl font-black tracking-[0.06em]">
                      {result.title}
                    </h3>

                    <p className="mt-4 leading-7 text-[#a99a89]">
                      {result.text}
                    </p>
                  </article>
                </Reveal>
              );
            })}
          </div>

          <Reveal className="mt-12 rounded-3xl border border-[#554333] bg-[#15110e] p-7 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <Quote
                className="shrink-0 text-[#b9915e]"
                size={42}
                strokeWidth={1.5}
              />

              <blockquote className="max-w-5xl text-xl font-medium leading-9 text-[#e3d3c0] sm:text-2xl">
                “Dedication gave me direction. Determination kept me moving.
                Drive reminded me why I started. Discipline made the
                transformation possible.”
              </blockquote>
            </div>
          </Reveal>
        </section>

        {/* FINAL CTA */}
        <section className="relative isolate overflow-hidden border-t border-[#3b3129] bg-[#17120f]">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(195,151,94,0.22),transparent_42%)]" />

          <Reveal className="mx-auto max-w-7xl px-5 py-24 text-center lg:px-8 lg:py-32">
            <p className="text-xs font-black tracking-[0.26em] text-[#c29e6b]">
              YOUR FIRST REP STARTS HERE
            </p>

            <h2 className="mx-auto mt-5 max-w-5xl text-5xl font-black uppercase leading-[0.92] tracking-[-0.04em] sm:text-7xl">
              STOP WAITING FOR
              <br />
              <span className="text-[#c7a06b]">THE PERFECT TIME.</span>
            </h2>

            <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#bbaa97]">
              Create your profile, define your goal and begin building a
              stronger body, a stronger routine and a stronger standard.
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <PrimaryButton href="/signup">
                START YOUR TRANSFORMATION
              </PrimaryButton>

              <SecondaryButton href="/story">
                READ THE STORY
              </SecondaryButton>
            </div>
          </Reveal>
        </section>
      </main>
    </LazyMotion>
  );
}