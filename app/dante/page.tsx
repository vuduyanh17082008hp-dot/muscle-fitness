import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Database,
  Dumbbell,
  ShieldCheck,
  Utensils,
} from "lucide-react";

import { Reveal } from "@/components/animation/reveal";
import { DanteArchitecture } from "@/components/home/dante-architecture";
import { SectionWrapper } from "@/components/layout/section-wrapper";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardGlow } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "Dante | Muscle Fitness",
  description:
    "Meet Dante, the Muscle Fitness AI coaching intelligence — profile-aware training, nutrition and recovery guidance grounded in real client data and external evidence.",
};

const reads = [
  {
    icon: Dumbbell,
    title: "Your training",
    detail:
      "Active plan, today's session, logged sets, RIR and recent adherence.",
  },
  {
    icon: Utensils,
    title: "Your nutrition",
    detail:
      "Calorie and macro targets, logged meals, food preferences and allergies.",
  },
  {
    icon: Activity,
    title: "Your recovery",
    detail:
      "Body-weight trend and readiness signals from your logged history.",
  },
  {
    icon: Database,
    title: "External evidence",
    detail:
      "Live USDA FoodData Central lookups for verified food composition.",
  },
];

const limits = [
  "Does not diagnose disease or interpret symptoms as a diagnosis",
  "Does not prescribe or adjust medication",
  "Will not design performance-enhancing-drug protocols",
  "Cannot create reminders or tickets without your typed confirmation",
  "Says when data is missing instead of inventing it",
];

export default function DantePage() {
  return (
    <main className="bg-background text-white">
      <SectionWrapper className="border-b border-border pt-24 sm:pt-28">
        <Reveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-border-accent bg-accent-soft px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-light">
            Dante &middot; Muscle Fitness Intelligence
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <h1 className="mt-6 max-w-3xl font-heading text-4xl tracking-[0.02em] sm:text-5xl lg:text-6xl">
            YOUR TRAINING. YOUR DATA.
            <br />
            <span className="text-gradient-bronze">YOUR COACH.</span>
          </h1>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mt-6 max-w-2xl text-base leading-8 text-text-secondary sm:text-lg">
            Dante is the AI coaching layer built into Muscle Fitness &mdash;
            not a generic chatbot bolted onto the site. It reads your real
            profile and logged data, combines it with external evidence, and
            answers with guidance that fits you specifically.
          </p>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link href="/signup" className={buttonStyles({ size: "lg" })}>
              Start Your Journey
              <ArrowRight className="size-4" />
            </Link>

            <Link
              href="/ai-coach"
              className={buttonStyles({ variant: "secondary", size: "lg" })}
            >
              Open Dante Chat
            </Link>
          </div>
        </Reveal>
      </SectionWrapper>

      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="What Dante Reads"
          title="CONTEXT FIRST,"
          highlightedText=" ANSWER SECOND."
          description="Dante calls real data tools before it answers, so the same question gets a different answer for two different clients."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {reads.map((item) => {
            const Icon = item.icon;

            return (
              <Card key={item.title} interactive className="p-6">
                <CardGlow />
                <Icon className="size-7 text-accent-light" />
                <h2 className="mt-4 text-lg font-black uppercase tracking-[0.1em] text-white">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {item.detail}
                </p>
              </Card>
            );
          })}
        </div>
      </SectionWrapper>

      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="How It Works"
          title="CLIENT DATA + EVIDENCE,"
          highlightedText=" NOT GUESSWORK."
        />

        <div className="mt-14">
          <DanteArchitecture />
        </div>
      </SectionWrapper>

      <SectionWrapper>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border-accent bg-accent-soft px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-light">
              <ShieldCheck className="size-3.5" />
              What Dante will not do
            </div>

            <h2 className="text-3xl tracking-[0.03em] sm:text-4xl">
              Educational guidance &mdash; not medical advice.
            </h2>

            <p className="mt-5 max-w-xl text-base leading-7 text-text-secondary">
              Dante is a coaching tool, not a clinician. For persistent pain,
              injury, pregnancy-related questions or any diagnosed condition,
              it points you to a qualified professional instead of guessing.
            </p>

            <Link
              href="/ai-fair#responsible-ai"
              className={buttonStyles({ variant: "secondary", className: "mt-8" })}
            >
              Read Our Responsible AI Approach
            </Link>
          </div>

          <div className="grid gap-3">
            {limits.map((limit) => (
              <div
                key={limit}
                className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm leading-6 text-text-secondary"
              >
                {limit}
              </div>
            ))}
          </div>
        </div>
      </SectionWrapper>
    </main>
  );
}
