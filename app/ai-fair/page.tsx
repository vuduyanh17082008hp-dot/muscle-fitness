import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Dumbbell,
  ExternalLink,
  Github,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { SectionWrapper } from "@/components/layout/section-wrapper";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardGlow } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "AI Fair Submission | Muscle Fitness",
  description:
    "Muscle Fitness AI Fair submission summary: the problem, the solution, Dante's architecture, evidence sources, responsible AI approach and surprise features.",
};

const solutionPillars = [
  { icon: Dumbbell, title: "Training", detail: "Splits, volume and intensity built around your goal." },
  { icon: Utensils, title: "Nutrition", detail: "Calorie and macro targets from your real profile." },
  { icon: Activity, title: "Recovery", detail: "Readiness signals from sleep, soreness and training load." },
  { icon: Sparkles, title: "Dante", detail: "Reads all three and turns them into one plan." },
];

const surpriseFeatures = [
  "Profile-aware AI coach, not generic prompting",
  "Live USDA FoodData Central evidence lookups",
  "Gated write actions with explicit confirmation phrases",
  "Adaptive + fully custom workout builder with RIR and substitutions",
  "Recovery-aware coaching from logged readiness data",
  "Graceful degradation when an external API is unavailable",
];

export default function AiFairPage() {
  return (
    <main className="bg-background text-white">
      <SectionWrapper className="border-b border-border pt-24 sm:pt-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-accent bg-accent-soft px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-light">
          AI Fair Submission
        </div>

        <h1 className="mt-6 max-w-3xl font-heading text-4xl tracking-[0.02em] sm:text-5xl">
          Muscle Fitness: an evidence-aware AI fitness coaching platform.
        </h1>

        <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
          This page is a condensed summary of the product for judges and
          reviewers. Every claim below links to the code or document that
          backs it up &mdash; nothing here is aspirational marketing.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="https://github.com/vuduyanh17082008hp-dot/muscle-fitness"
            className={buttonStyles({ variant: "secondary" })}
          >
            <Github className="size-4" />
            Source Code
          </Link>

          <Link href="/dante" className={buttonStyles({ variant: "secondary" })}>
            Meet Dante
            <ExternalLink className="size-4" />
          </Link>
        </div>
      </SectionWrapper>

      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="The Problem"
          title="FITNESS ADVICE IS EVERYWHERE."
          highlightedText=" PERSONALIZED GUIDANCE ISN'T."
          description="Generic programs, contradictory nutrition advice, supplement misinformation, and apps that don't talk to each other."
        />
      </SectionWrapper>

      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="The Solution"
          title="ONE PROFILE."
          highlightedText=" ONE SYSTEM. ONE COACH."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {solutionPillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <Card key={pillar.title} interactive className="p-6">
                <CardGlow />
                <Icon className="size-7 text-accent-light" />
                <h3 className="mt-4 text-lg font-black uppercase tracking-[0.1em] text-white">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {pillar.detail}
                </p>
              </Card>
            );
          })}
        </div>
      </SectionWrapper>

      <SectionWrapper className="border-b border-border">
        <SectionHeading
          eyebrow="AI Architecture"
          title="HOW DANTE"
          highlightedText=" WORKS."
          description="Client profile + training/nutrition/recovery data + trusted external sources go into Dante, which reasons over both instead of inventing facts."
        />

        <PageContainer className="mt-8 px-0">
          <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-surface p-6 text-xs leading-6 text-text-secondary sm:text-sm">
{`CLIENT PROFILE
      |
      +----------------+----------------+
      |                                 |
      v                                 v
  TRAINING                          NUTRITION
      |                                 |
  workout plans                   calorie / macro targets
  logs, RIR, substitutions        meal recommendations
      |                                 |
      +----------------+----------------+
                       v
                   RECOVERY
                       |
              sleep, readiness, logs
                       |
                       v
                    DANTE
                (AI reasoning layer)
                       |
        +--------------+--------------+
        v              v              v
   training       nutrition       recovery
   adjustments      guidance       insights

  Evidence source live today: USDA FoodData Central
  Roadmap (not yet integrated): PubMed, wger, Open Food Facts, PubChem, openFDA`}
          </pre>
        </PageContainer>
      </SectionWrapper>

      <SectionWrapper className="border-b border-border" id="responsible-ai">
        <SectionHeading
          eyebrow="Responsible AI"
          title="EDUCATIONAL GUIDANCE,"
          highlightedText=" NOT MEDICAL ADVICE."
          description="Dante does not diagnose disease, prescribe medication, or replace a qualified clinician. Write actions require explicit user confirmation. Uncertainty and missing data are disclosed, not hidden."
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="https://github.com/vuduyanh17082008hp-dot/muscle-fitness/blob/main/docs/RESPONSIBLE_AI.md"
            className={buttonStyles({ variant: "secondary" })}
          >
            Full Responsible AI Document
          </Link>
          <Link
            href="https://github.com/vuduyanh17082008hp-dot/muscle-fitness/blob/main/docs/AI_DISCLOSURE.md"
            className={buttonStyles({ variant: "secondary" })}
          >
            AI / Data Source Disclosure
          </Link>
        </div>
      </SectionWrapper>

      <SectionWrapper>
        <SectionHeading
          eyebrow="Surprise Features"
          title="WHAT'S ACTUALLY"
          highlightedText=" WORKING."
        />

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {surpriseFeatures.map((feature) => (
            <div
              key={feature}
              className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm leading-6 text-text-secondary"
            >
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-light" />
              {feature}
            </div>
          ))}
        </div>

        <Link
          href="https://github.com/vuduyanh17082008hp-dot/muscle-fitness/blob/main/docs/SURPRISE_FEATURES.md"
          className={buttonStyles({ variant: "secondary", className: "mt-8" })}
        >
          Full Surprise Features List
        </Link>
      </SectionWrapper>
    </main>
  );
}
