import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Brain,
  Dumbbell,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";

import { Reveal, StaggerContainer, StaggerItem } from "@/components/animation/reveal";
import { DanteArchitecture } from "@/components/home/dante-architecture";
import { FourDPhilosophy } from "@/components/home/four-d-philosophy";
import { InspirationStory } from "@/components/home/inspiration-story";
import { PageContainer } from "@/components/layout/page-container";
import { SectionWrapper } from "@/components/layout/section-wrapper";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardGlow } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

const problems = [
  "Generic workout programs that ignore your actual recovery and schedule.",
  "Contradictory nutrition advice from a dozen different sources.",
  "Supplement and \"hack\" misinformation with no evidence behind it.",
  "Programs that never adjust when life, sleep or progress changes.",
  "Expensive one-on-one coaching most people can't access.",
  "Training, food and recovery tracked in three disconnected apps.",
];

const solutionPillars = [
  {
    icon: Dumbbell,
    title: "Training",
    detail: "Splits, volume and intensity built around your goal and schedule.",
  },
  {
    icon: Utensils,
    title: "Nutrition",
    detail: "Calorie and macro targets that match your training phase.",
  },
  {
    icon: Activity,
    title: "Recovery",
    detail: "Readiness signals from sleep, soreness and training load.",
  },
  {
    icon: Sparkles,
    title: "Dante",
    detail: "The layer that reads all three and turns them into one plan.",
  },
];

const aiFeatures = [
  {
    icon: Sparkles,
    title: "Dante AI Coach",
    points: [
      "Contextual, ongoing fitness conversation",
      "Profile-aware guidance, not generic answers",
      "Cites USDA FoodData Central for nutrition facts",
    ],
  },
  {
    icon: Dumbbell,
    title: "Adaptive Workout Builder",
    points: [
      "Recommended and fully custom splits",
      "Muscle-priority programming",
      "Sets, reps, RIR and exercise substitutions",
    ],
  },
  {
    icon: Utensils,
    title: "Smart Nutrition",
    points: [
      "Calorie & macro guidance from your profile",
      "Meal recommendations that fit real schedules",
      "Food database lookups for accurate macros",
    ],
  },
  {
    icon: Brain,
    title: "Recovery Intelligence",
    points: [
      "Readiness signals from logged training & sleep",
      "Guidance that adapts when recovery drops",
      "Flags when a plateau needs a plan change",
    ],
  },
];

export default function HomePage() {
  return (
    <main className="bg-background text-white">
      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-50 border-b border-border bg-black/80 backdrop-blur-xl">
        <PageContainer className="flex h-[var(--navbar-height)] items-center justify-between">
          <Link href="/" className="font-heading text-lg tracking-[0.14em] text-white">
            MUSCLE FITNESS
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-bold uppercase tracking-[0.14em] text-text-secondary lg:flex">
            <Link href="/story" className="transition hover:text-white">
              Story
            </Link>
            <Link href="/coach" className="transition hover:text-white">
              Dante
            </Link>
            <Link href="/training" className="transition hover:text-white">
              Training
            </Link>
            <Link href="/ai-fair" className="transition hover:text-white">
              AI Fair
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden text-xs font-bold uppercase tracking-[0.14em] text-text-secondary transition hover:text-white sm:block">
              Login
            </Link>
            <Link href="/signup" className={buttonStyles({ size: "sm" })}>
              Start Free
            </Link>
          </div>
        </PageContainer>
      </header>

      {/* =================================================
          1. HERO
      ================================================= */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-120 w-175 -translate-x-1/2 rounded-full bg-accent opacity-8 blur-[120px]"
        />

        <PageContainer className="relative flex min-h-[calc(100svh-var(--navbar-height))] flex-col items-center justify-center py-20 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-border-accent bg-accent-soft px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-light">
              AI-Powered &middot; Evidence-Aware &middot; Personalized
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-8 max-w-4xl font-heading text-5xl tracking-[0.02em] sm:text-6xl lg:text-7xl">
              AI-POWERED PERSONAL TRAINING.
              <br />
              <span className="text-gradient-bronze">BUILT AROUND YOU.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-6 max-w-2xl text-base leading-8 text-text-secondary sm:text-lg">
              Training, nutrition and recovery guidance built from your real
              profile, goals and progress &mdash; not a template.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link href="/signup" className={buttonStyles({ size: "lg" })}>
                Start Your Journey
                <ArrowRight className="size-4" />
              </Link>

              <Link href="/coach" className={buttonStyles({ variant: "secondary", size: "lg" })}>
                Meet Dante
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <p className="mt-14 font-heading text-sm tracking-[0.22em] text-text-muted">
              TODAY IS THE YOUNGEST YOU WILL EVER BE.
            </p>
          </Reveal>
        </PageContainer>
      </section>

      {/* =================================================
          2. THE PROBLEM
      ================================================= */}
      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="The Problem"
          title="FITNESS ADVICE IS EVERYWHERE."
          highlightedText=" PERSONALIZED GUIDANCE ISN'T."
          description="Most people don't fail because they lack willpower. They fail because the guidance around them doesn't fit their body, their schedule or their life."
        />

        <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {problems.map((problem) => (
            <StaggerItem key={problem}>
              <div className="h-full rounded-[var(--radius-md)] border border-border bg-surface p-5 text-sm leading-6 text-text-secondary">
                {problem}
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </SectionWrapper>

      {/* =================================================
          3. THE SOLUTION
      ================================================= */}
      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="The Solution"
          title="ONE PROFILE. ONE SYSTEM."
          highlightedText=" ONE COACH."
          description="Muscle Fitness connects training, nutrition and recovery instead of treating them as separate tools. Dante is the layer that reads all three."
        />

        <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {solutionPillars.map((pillar) => {
            const Icon = pillar.icon;

            return (
              <StaggerItem key={pillar.title}>
                <Card interactive className="h-full p-6">
                  <CardGlow />
                  <Icon className="size-8 text-accent-light" />
                  <h3 className="mt-5 text-lg font-black uppercase tracking-[0.1em] text-white">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    {pillar.detail}
                  </p>
                </Card>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </SectionWrapper>

      {/* =================================================
          4. HOW DANTE WORKS
      ================================================= */}
      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="How Dante Works"
          title="CLIENT DATA + EVIDENCE,"
          highlightedText=" NOT GUESSWORK."
          description="Dante combines your real profile and logged data with trusted external sources, then reasons over both. It is not asked to invent facts it can look up."
        />

        <div className="mt-14">
          <DanteArchitecture />
        </div>

        <p className="mt-10 max-w-2xl text-sm leading-6 text-text-muted">
          Live today: USDA FoodData Central for verified food composition.
          Additional sources (PubMed, wger, Open Food Facts) are on our
          integration roadmap &mdash; we only advertise what is actually
          connected.
        </p>
      </SectionWrapper>

      {/* =================================================
          5. AI FEATURES
      ================================================= */}
      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="AI Features"
          title="WHAT DANTE"
          highlightedText=" ACTUALLY DOES."
          description="No vague promises &mdash; these are the working capabilities you can try today."
        />

        <StaggerContainer className="mt-12 grid gap-5 sm:grid-cols-2">
          {aiFeatures.map((feature) => {
            const Icon = feature.icon;

            return (
              <StaggerItem key={feature.title}>
                <Card className="h-full p-6 sm:p-7">
                  <Icon className="size-7 text-accent-light" />
                  <h3 className="mt-4 text-xl font-black uppercase tracking-[0.06em] text-white">
                    {feature.title}
                  </h3>
                  <ul className="mt-4 space-y-2">
                    {feature.points.map((point) => (
                      <li
                        key={point}
                        className="flex gap-2 text-sm leading-6 text-text-secondary"
                      >
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </Card>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </SectionWrapper>

      {/* =================================================
          6. INSPIRATIONAL STORY
      ================================================= */}
      <SectionWrapper className="border-b border-border" id="story">
        <SectionHeading
          eyebrow="More Than A Transformation"
          title="THE FIRST"
          highlightedText=" REP."
          description="A short, original story &mdash; not a specific client's testimonial. It represents the shape a lot of transformations share."
        />

        <div className="mt-12">
          <InspirationStory />
        </div>
      </SectionWrapper>

      {/* =================================================
          7. THE 4D PHILOSOPHY
      ================================================= */}
      <SectionWrapper className="border-b border-border">
        <SectionHeading
          align="center"
          eyebrow="The Muscle Fitness Standard"
          title="THE 4D"
          highlightedText=" PHILOSOPHY."
        />

        <div className="mt-12">
          <FourDPhilosophy />
        </div>
      </SectionWrapper>

      {/* =================================================
          8. RESPONSIBLE AI
      ================================================= */}
      <SectionWrapper className="border-b border-border">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border-accent bg-accent-soft px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-light">
              <ShieldCheck className="size-3.5" />
              Responsible AI
            </div>

            <h2 className="text-3xl tracking-[0.03em] sm:text-4xl">
              Dante gives educational guidance &mdash; not medical advice.
            </h2>

            <p className="mt-5 max-w-xl text-base leading-7 text-text-secondary">
              Dante does not diagnose disease, replace medical professionals
              or tell clients to change medication. It only uses a client&apos;s
              data when it is available, surfaces its evidence sources when
              they were used, and responds cautiously to safety-sensitive
              questions.
            </p>

            <Link
              href="/ai-fair#responsible-ai"
              className={buttonStyles({ variant: "secondary", className: "mt-8" })}
            >
              Read Our Responsible AI Approach
            </Link>
          </div>

          <div className="grid gap-3">
            {[
              "No disease diagnosis or medication guidance",
              "No fabricated studies or invented evidence",
              "Uncertainty and missing data are disclosed, not hidden",
              "Safety-sensitive questions get cautious, human-directed guidance",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm leading-6 text-text-secondary"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </SectionWrapper>

      {/* =================================================
          9. FINAL CTA
      ================================================= */}
      <SectionWrapper>
        <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-border-accent bg-accent-soft px-6 py-16 text-center sm:px-12">
          <h2 className="font-heading text-4xl tracking-[0.03em] sm:text-5xl">
            YOUR NEXT REP STARTS HERE.
          </h2>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link href="/signup" className={buttonStyles({ size: "lg" })}>
              Build My Profile
              <ArrowRight className="size-4" />
            </Link>

            <Link href="/coach" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              Ask Dante
            </Link>
          </div>

          <p className="mt-10 font-heading text-sm tracking-[0.22em] text-text-muted">
            TODAY IS THE YOUNGEST YOU WILL EVER BE.
          </p>
        </div>
      </SectionWrapper>
    </main>
  );
}
