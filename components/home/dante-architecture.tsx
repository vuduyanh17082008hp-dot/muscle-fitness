import { Reveal } from "@/components/animation/reveal";

const inputs = [
  {
    title: "Client profile",
    detail: "Goal, experience, schedule, equipment, limitations.",
  },
  {
    title: "Training, nutrition & recovery data",
    detail: "Logged workouts, meals, body-weight and readiness signals.",
  },
  {
    title: "Trusted external sources",
    detail: "USDA FoodData Central today — more sources on the roadmap.",
  },
];

const outputs = [
  { title: "Training", detail: "Split, volume and intensity adjustments." },
  { title: "Nutrition", detail: "Calorie, macro and meal guidance." },
  { title: "Recovery", detail: "Readiness-aware pacing suggestions." },
];

export function DanteArchitecture() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <Reveal className="grid gap-4">
        {inputs.map((item) => (
          <div
            key={item.title}
            className="rounded-[var(--radius-md)] border border-border bg-surface p-5"
          >
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-white">
              {item.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {item.detail}
            </p>
          </div>
        ))}
      </Reveal>

      <Reveal
        delay={0.1}
        className="flex flex-col items-center justify-center gap-3 py-6 lg:py-0"
      >
        <span className="text-2xl text-accent-light lg:hidden">↓</span>
        <span className="hidden text-2xl text-accent-light lg:block">→</span>

        <div
          className="
            rounded-[var(--radius-lg)] border border-border-accent
            bg-accent-soft px-6 py-5 text-center
          "
        >
          <p className="font-heading text-2xl tracking-[0.08em] text-white">
            DANTE
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-accent-light">
            AI Reasoning Layer
          </p>
        </div>

        <span className="text-2xl text-accent-light lg:hidden">↓</span>
        <span className="hidden text-2xl text-accent-light lg:block">→</span>
      </Reveal>

      <Reveal delay={0.2} className="grid gap-4">
        {outputs.map((item) => (
          <div
            key={item.title}
            className="rounded-[var(--radius-md)] border border-border bg-surface p-5"
          >
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-accent-light">
              {item.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {item.detail}
            </p>
          </div>
        ))}
      </Reveal>
    </div>
  );
}
