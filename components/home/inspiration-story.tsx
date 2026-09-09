import { Reveal } from "@/components/animation/reveal";
import { SectionHeading } from "@/components/ui/section-heading";

/**
 * A short, original, composite fitness story — not a real client
 * testimonial. Replaces the previous founder-autobiography experience.
 * Themes are inspired by common transformation patterns (discomfort,
 * a small first step, a plateau, discovering strength training,
 * a change in self-perception) but the text itself is original writing.
 */
const storyBeats = [
  {
    label: "Before",
    text:
      "She timed her mornings around avoiding mirrors. The gym felt like it belonged to other people — the kind who already looked like they had never struggled.",
  },
  {
    label: "The first step",
    text:
      "Nothing about the beginning was impressive. One walk after dinner. One short session on a machine nobody else was using. One decision to come back tomorrow, even though nothing had visibly changed yet.",
  },
  {
    label: "Resistance",
    text:
      "The scale slowed. The motivation that felt so reliable in week one disappeared completely. Quitting would have been easy to justify. Instead, she adjusted — sleep, food, one more set than felt comfortable — and kept going.",
  },
  {
    label: "Discovery",
    text:
      "Somewhere inside the plateau, the goal quietly changed. It stopped being about the number on the scale and became the weight on the bar — carrying groceries without effort, standing taller without deciding to.",
  },
];

export function InspirationStory() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div className="space-y-8">
        {storyBeats.map((beat, index) => (
          <Reveal key={beat.label} delay={index * 0.08}>
            <div className="flex gap-5">
              <span
                className="
                  mt-1 shrink-0 font-heading text-sm
                  tracking-[0.2em] text-accent-light
                "
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              <div>
                <p
                  className="
                    mb-2 text-xs font-bold uppercase
                    tracking-[0.22em] text-text-muted
                  "
                >
                  {beat.label}
                </p>

                <p className="max-w-xl text-base leading-8 text-text-secondary sm:text-lg">
                  {beat.text}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.2}>
        <div
          className="
            rounded-[var(--radius-lg)] border border-border-accent
            bg-accent-soft p-8 sm:p-10
          "
        >
          <p
            className="
              text-xs font-bold uppercase tracking-[0.22em]
              text-accent-light
            "
          >
            Ending
          </p>

          <p className="mt-4 font-heading text-2xl leading-snug tracking-[0.02em] text-white sm:text-3xl">
            The mirror did not change first.
          </p>

          <blockquote
            className="
              mt-6 border-l-2 border-accent pl-5 text-lg
              italic leading-8 text-text-secondary sm:text-xl
            "
          >
            &ldquo;The greatest transformation was not learning to love the
            reflection. It was becoming proud of the person who refused to
            stop.&rdquo;
          </blockquote>

          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-text-muted">
            An original Muscle Fitness story — not a client testimonial.
          </p>
        </div>
      </Reveal>
    </div>
  );
}

export function InspirationStoryHeading() {
  return (
    <SectionHeading
      eyebrow="More Than A Transformation"
      title="THE FIRST"
      highlightedText=" REP."
      description="Every client's story is different. This one is written to represent the shape most of them share."
    />
  );
}
