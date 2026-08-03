import { Quote } from "lucide-react";

export type StoryQuoteCategory =
  | "personal"
  | "transformation"
  | "bodybuilding"
  | "influencer"
  | "lesson";

export type StoryQuoteData = {
  text: string;
  author?: string;
  role?: string;
  category?: StoryQuoteCategory;
};

type StoryQuoteProps = {
  quote?: StoryQuoteData;
  fullWidth?: boolean;
  className?: string;
};

const fallbackQuote: StoryQuoteData = {
  text: "The scale measured what I lost. It could never measure everything I gained.",
  author: "Vũ Duy Anh",
  role: "Personal Experience",
  category: "personal",
};

const categoryLabels: Record<StoryQuoteCategory, string> = {
  personal: "Personal Reflection",
  transformation: "Transformation",
  bodybuilding: "Bodybuilding Lesson",
  influencer: "Voice That Shaped Me",
  lesson: "Lesson Learned",
};

export default function StoryQuote({
  quote,
  fullWidth = false,
  className = "",
}: StoryQuoteProps) {
  // Prevent a crash if quote is missing or undefined.
  const safeQuote = quote ?? fallbackQuote;
  const safeCategory = safeQuote.category ?? "personal";

  return (
    <section
      className={[
        "relative isolate overflow-hidden border-y border-[#c5a66a]/20",
        "bg-[#0d0b09] px-6 py-24 sm:px-10 lg:py-32",
        className,
      ].join(" ")}
      aria-label="Story quotation"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_center,rgba(197,166,106,0.12),transparent_60%)]"
      />

      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 -z-10 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#c5a66a]/60 to-transparent"
      />

      <div
        aria-hidden="true"
        className="absolute -left-20 top-1/2 -z-10 h-64 w-64 -translate-y-1/2 rounded-full bg-[#7f1d1d]/10 blur-3xl"
      />

      <div
        className={`mx-auto ${
          fullWidth ? "max-w-7xl" : "max-w-4xl"
        }`}
      >
        <figure className="relative text-center">
          <Quote
            aria-hidden="true"
            className="mx-auto mb-8 h-10 w-10 text-[#c5a66a]/80"
            strokeWidth={1.4}
          />

          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.35em] text-[#c5a66a]">
            {categoryLabels[safeCategory]}
          </p>

          <blockquote>
            <p
              className={[
                "mx-auto font-serif font-medium leading-tight text-[#f3eadf]",
                fullWidth
                  ? "max-w-6xl text-3xl sm:text-5xl lg:text-6xl"
                  : "max-w-3xl text-3xl sm:text-4xl",
              ].join(" ")}
            >
              “{safeQuote.text}”
            </p>
          </blockquote>

          {(safeQuote.author || safeQuote.role) && (
            <figcaption className="mt-10">
              <div className="mx-auto mb-5 h-px w-14 bg-[#c5a66a]/70" />

              {safeQuote.author && (
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#f3eadf]">
                  {safeQuote.author}
                </p>
              )}

              {safeQuote.role && (
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[#a89e91]">
                  {safeQuote.role}
                </p>
              )}
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  );
}