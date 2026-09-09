import { StaggerContainer, StaggerItem } from "@/components/animation/reveal";

export const fourDPillars = [
  {
    letter: "D",
    title: "Dedication",
    text: "Show up before motivation arrives.",
  },
  {
    letter: "D",
    title: "Determination",
    text: "Continue after the first wave of motivation fades.",
  },
  {
    letter: "D",
    title: "Drive",
    text: "Remember why you began, especially on the hard days.",
  },
  {
    letter: "D",
    title: "Discipline",
    text: "Keep the promise when nobody is watching.",
  },
] as const;

export function FourDPhilosophy() {
  return (
    <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {fourDPillars.map((pillar) => (
        <StaggerItem key={pillar.title}>
          <div
            className="
              group h-full rounded-[var(--radius-md)] border border-border
              bg-surface p-6 transition duration-300
              hover:-translate-y-1 hover:border-border-accent
              hover:bg-surface-hover
            "
          >
            <span
              className="
                font-heading text-4xl tracking-[0.05em] text-accent
                transition group-hover:text-accent-light
              "
            >
              {pillar.letter}
            </span>

            <h3 className="mt-4 text-lg font-black uppercase tracking-[0.14em] text-white">
              {pillar.title}
            </h3>

            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {pillar.text}
            </p>
          </div>
        </StaggerItem>
      ))}
    </StaggerContainer>
  );
}
