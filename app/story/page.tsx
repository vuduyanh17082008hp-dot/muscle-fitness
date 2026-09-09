import type { Metadata } from "next";
import Link from "next/link";

import { FourDPhilosophy } from "@/components/home/four-d-philosophy";
import { InspirationStory } from "@/components/home/inspiration-story";
import { PageContainer } from "@/components/layout/page-container";
import { SectionWrapper } from "@/components/layout/section-wrapper";
import { buttonStyles } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";

export const metadata: Metadata = {
  title: "The First Rep | Muscle Fitness",
  description:
    "A short, original fitness story about starting small, hitting a plateau, and discovering that strength changes more than the body.",
};

export default function StoryPage() {
  return (
    <main className="bg-background text-white">
      <SectionWrapper className="border-b border-border pt-24 sm:pt-28">
        <SectionHeading
          eyebrow="More Than A Transformation"
          title="THE FIRST"
          highlightedText=" REP."
          description="This is not one client's biography. It's a short, original story written to represent the shape a lot of transformations share &mdash; and it's why Muscle Fitness exists."
        />

        <div className="mt-14">
          <InspirationStory />
        </div>
      </SectionWrapper>

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

      <SectionWrapper>
        <PageContainer className="flex flex-col items-center text-center">
          <p className="font-heading text-sm tracking-[0.22em] text-text-muted">
            TODAY IS THE YOUNGEST YOU WILL EVER BE.
          </p>

          <Link href="/signup" className={buttonStyles({ size: "lg", className: "mt-8" })}>
            Start Your Journey
          </Link>
        </PageContainer>
      </SectionWrapper>
    </main>
  );
}
