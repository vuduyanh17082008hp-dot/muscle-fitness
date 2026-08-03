import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Dumbbell,
  Flame,
  ShieldCheck,
  Target,
  Utensils,
} from "lucide-react";

import {
  Reveal,
  StaggerContainer,
  StaggerItem,
} from "@/components/animation/reveal";
import { PageContainer } from "@/components/layout/page-container";
import { SectionWrapper } from "@/components/layout/section-wrapper";
import {
  Button,
  buttonStyles,
} from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardGlow,
  CardHeader,
  CardTitle,
  StatCard,
} from "@/components/ui/card";
import {
  FormField,
  Input,
  Textarea,
} from "@/components/ui/form-controls";
import { SectionHeading } from "@/components/ui/section-heading";

const features = [
  {
    title: "Training System",
    description:
      "Personalized training built around your experience, recovery, schedule and performance goals.",
    icon: Dumbbell,
  },
  {
    title: "Nutrition Plan",
    description:
      "Practical meal structures with calories and macro targets that match your transformation phase.",
    icon: Utensils,
  },
  {
    title: "Mindset",
    description:
      "A system designed to build consistency, accountability and discipline beyond temporary motivation.",
    icon: Brain,
  },
];

export default function DesignSystemPage() {
  return (
    <>
      <section
        className="
          relative min-h-[calc(100svh-var(--navbar-height))]
          overflow-hidden
          border-b border-[var(--color-border)]
        "
      >
        <div className="section-grid" />

        <div
          aria-hidden="true"
          className="
            absolute left-1/2 top-0
            h-[480px] w-[700px]
            -translate-x-1/2
            rounded-full
            bg-[var(--color-accent)]
            opacity-[0.08] blur-[120px]
          "
        />

        <PageContainer
          className="
            relative flex min-h-[calc(100svh-var(--navbar-height))]
            items-center py-16 sm:py-20
          "
        >
          <div className="max-w-5xl">
            <Reveal>
              <div
                className="
                  mb-6 inline-flex items-center
                  gap-2 rounded-full
                  border border-[var(--color-border-accent)]
                  bg-[var(--color-accent-soft)]
                  px-4 py-2
                  text-xs font-bold uppercase
                  tracking-[0.16em]
                  text-[var(--color-accent-light)]
                "
              >
                <Flame className="size-4" />
                Muscle Fitness Design System
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <h1
                className="
                  max-w-5xl text-[3.7rem]
                  tracking-[0.035em]
                  sm:text-7xl
                  lg:text-[7.5rem]
                "
              >
                Built Through{" "}
                <span className="text-gradient-bronze">
                  Discipline
                </span>
              </h1>
            </Reveal>

            <Reveal delay={0.16}>
              <p
                className="
                  mt-7 max-w-2xl
                  text-base leading-8
                  text-[var(--color-text-secondary)]
                  sm:text-lg
                "
              >
                A unified visual system for every
                page of Muscle Fitness—hardcore,
                modern, responsive and focused on
                transformation.
              </p>
            </Reveal>

            <Reveal
              delay={0.24}
              className="
                mt-9 flex flex-col gap-3
                sm:flex-row
              "
            >
              <Link
                href="/onboarding"
                className={buttonStyles({
                  variant: "primary",
                  size: "lg",
                  className:
                    "w-full sm:w-auto",
                })}
              >
                Start Your Journey
                <ArrowRight className="size-4" />
              </Link>

              <Link
                href="/story"
                className={buttonStyles({
                  variant: "secondary",
                  size: "lg",
                  className:
                    "w-full sm:w-auto",
                })}
              >
                Read My Story
              </Link>
            </Reveal>
          </div>
        </PageContainer>
      </section>

      <SectionWrapper>
        <Reveal>
          <SectionHeading
            eyebrow="Brand Foundation"
            title="One Identity."
            highlightedText="Every Page."
            description="Every section follows the same visual language: steel surfaces, bronze accents, high-contrast typography and disciplined spacing."
          />
        </Reveal>

        <StaggerContainer
          className="
            mt-12 grid gap-5
            sm:grid-cols-2
            lg:grid-cols-4
          "
        >
          <StaggerItem>
            <StatCard
              label="Primary Background"
              value="#070707"
              description="Deep black foundation."
            />
          </StaggerItem>

          <StaggerItem>
            <StatCard
              label="Accent"
              value="Bronze"
              description="Premium visual emphasis."
            />
          </StaggerItem>

          <StaggerItem>
            <StatCard
              label="Heading"
              value="Bebas"
              description="Strong and condensed."
            />
          </StaggerItem>

          <StaggerItem>
            <StatCard
              label="Body"
              value="Inter"
              description="Readable across devices."
            />
          </StaggerItem>
        </StaggerContainer>
      </SectionWrapper>

      <SectionWrapper
        className="
          border-y border-[var(--color-border)]
          bg-white/[0.015]
        "
      >
        <Reveal>
          <SectionHeading
            eyebrow="Buttons"
            title="Clear Actions."
            highlightedText="No Confusion."
            description="Every action has a clear priority and consistent interaction state."
          />
        </Reveal>

        <Reveal
          delay={0.1}
          className="
            mt-10 flex flex-wrap
            items-center gap-4
          "
        >
          <Button size="lg">
            Primary Button
          </Button>

          <Button
            variant="secondary"
            size="lg"
          >
            Secondary Button
          </Button>

          <Button
            variant="ghost"
            size="lg"
          >
            Ghost Button
          </Button>

          <Button
            variant="danger"
            size="lg"
          >
            Danger Button
          </Button>

          <Button disabled size="lg">
            Disabled
          </Button>
        </Reveal>
      </SectionWrapper>

      <SectionWrapper>
        <Reveal>
          <SectionHeading
            eyebrow="Core Features"
            title="Structured For"
            highlightedText="Transformation."
            description="The same card system can be reused for training, meal plans, dashboards, pricing and testimonials."
            align="center"
          />
        </Reveal>

        <StaggerContainer
          className="
            mt-12 grid gap-6
            md:grid-cols-3
          "
        >
          {features.map(
            ({
              title,
              description,
              icon: Icon,
            }) => (
              <StaggerItem key={title}>
                <Card
                  interactive
                  className="h-full"
                >
                  <CardGlow />

                  <CardHeader>
                    <div
                      className="
                        grid size-12 place-items-center
                        rounded-[var(--radius-sm)]
                        border
                        border-[var(--color-border-accent)]
                        bg-[var(--color-accent-soft)]
                        text-[var(--color-accent-light)]
                      "
                    >
                      <Icon className="size-5" />
                    </div>

                    <CardTitle>{title}</CardTitle>

                    <CardDescription>
                      {description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent>
                    <Link
                      href="/"
                      className="
                        group inline-flex
                        items-center gap-2
                        text-xs font-bold uppercase
                        tracking-[0.14em]
                        text-[var(--color-accent-light)]
                      "
                    >
                      Explore System

                      <ArrowRight
                        className="
                          size-4 transition
                          group-hover:translate-x-1
                        "
                      />
                    </Link>
                  </CardContent>
                </Card>
              </StaggerItem>
            ),
          )}
        </StaggerContainer>
      </SectionWrapper>

      <SectionWrapper
        className="
          border-y border-[var(--color-border)]
          bg-[var(--color-background-soft)]
        "
      >
        <div
          className="
            grid gap-12
            lg:grid-cols-[0.9fr_1.1fr]
            lg:items-center
          "
        >
          <Reveal>
            <SectionHeading
              eyebrow="Form System"
              title="Readable."
              highlightedText="Focused."
              description="Inputs maintain strong contrast and stay inside the screen on desktop, tablet and mobile."
            />

            <div
              className="
                mt-8 space-y-4
                text-sm
                text-[var(--color-text-secondary)]
              "
            >
              <div className="flex gap-3">
                <ShieldCheck
                  className="
                    mt-0.5 size-5 shrink-0
                    text-[var(--color-accent)]
                  "
                />

                <p>
                  High contrast labels and input
                  values.
                </p>
              </div>

              <div className="flex gap-3">
                <Target
                  className="
                    mt-0.5 size-5 shrink-0
                    text-[var(--color-accent)]
                  "
                />

                <p>
                  Clear focus, error and disabled
                  states.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <Card className="p-5 sm:p-7">
              <CardGlow />

              <form className="relative space-y-5">
                <div
                  className="
                    grid gap-5
                    sm:grid-cols-2
                  "
                >
                  <FormField
                    label="Full name"
                    htmlFor="design-name"
                  >
                    <Input
                      id="design-name"
                      name="name"
                      placeholder="Enter your name"
                    />
                  </FormField>

                  <FormField
                    label="Current weight"
                    htmlFor="design-weight"
                  >
                    <Input
                      id="design-weight"
                      name="weight"
                      type="number"
                      placeholder="69 kg"
                    />
                  </FormField>
                </div>

                <FormField
                  label="Transformation goal"
                  htmlFor="design-goal"
                  hint="Describe the result you want to achieve."
                >
                  <Textarea
                    id="design-goal"
                    name="goal"
                    placeholder="Build muscle, improve strength and remain lean..."
                  />
                </FormField>

                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                >
                  Create My Plan
                  <ArrowRight className="size-4" />
                </Button>
              </form>
            </Card>
          </Reveal>
        </div>
      </SectionWrapper>

      <SectionWrapper>
        <Reveal>
          <Card
            className="
              overflow-hidden
              border-[var(--color-border-accent)]
            "
          >
            <div
              className="
                relative grid gap-8
                p-6 sm:p-10
                lg:grid-cols-[1fr_auto]
                lg:items-center lg:p-14
              "
            >
              <CardGlow />

              <div className="relative">
                <p
                  className="
                    text-xs font-bold uppercase
                    tracking-[0.2em]
                    text-[var(--color-accent-light)]
                  "
                >
                  Responsive check
                </p>

                <h2
                  className="
                    mt-4 text-4xl
                    sm:text-5xl lg:text-6xl
                  "
                >
                  Test From{" "}
                  <span className="text-gradient-bronze">
                    320px
                  </span>{" "}
                  Upward
                </h2>

                <p
                  className="
                    mt-5 max-w-2xl
                    leading-8
                    text-[var(--color-text-secondary)]
                  "
                >
                  Resize the browser and verify
                  that the navbar, text, cards,
                  forms and buttons remain inside
                  the viewport.
                </p>
              </div>

              <Link
                href="/"
                className={buttonStyles({
                  variant: "primary",
                  size: "lg",
                  className:
                    "relative w-full lg:w-auto",
                })}
              >
                Return Home
              </Link>
            </div>
          </Card>
        </Reveal>
      </SectionWrapper>
    </>
  );
}