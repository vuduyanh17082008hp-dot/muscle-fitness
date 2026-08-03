import { cn } from "@/lib/cn";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  highlightedText?: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  highlightedText,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        "max-w-3xl",
        centered && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && (
        <div
          className={cn(
            `
              mb-5 flex items-center gap-3
              text-xs font-bold uppercase
              tracking-[0.22em]
              text-[var(--color-accent-light)]
            `,
            centered && "justify-center",
          )}
        >
          <span
            className="
              h-px w-8
              bg-[var(--color-accent)]
            "
          />

          <span>{eyebrow}</span>

          {centered && (
            <span
              className="
                h-px w-8
                bg-[var(--color-accent)]
              "
            />
          )}
        </div>
      )}

      <h2
        className="
          text-4xl tracking-[0.05em]
          sm:text-5xl lg:text-6xl
        "
      >
        {title}{" "}

        {highlightedText && (
          <span className="text-gradient-bronze">
            {highlightedText}
          </span>
        )}
      </h2>

      {description && (
        <p
          className="
            mt-6 max-w-2xl
            text-base leading-8
            text-[var(--color-text-secondary)]
            sm:text-lg
          "
        >
          {description}
        </p>
      )}
    </div>
  );
}