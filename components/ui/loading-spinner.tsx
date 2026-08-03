import { cn } from "@/lib/cn";

type LoadingSpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

const sizes = {
  sm: "size-4 border-2",
  md: "size-6 border-2",
  lg: "size-10 border-[3px]",
};

export function LoadingSpinner({
  size = "md",
  className,
  label = "Loading",
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        `
          inline-block shrink-0
          animate-spin rounded-full
          border-current border-r-transparent
        `,
        sizes[size],
        className,
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}