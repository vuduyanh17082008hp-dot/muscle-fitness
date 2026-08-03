import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger";

export type ButtonSize =
  | "sm"
  | "md"
  | "lg"
  | "icon";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "border-[var(--color-accent)]",
    "bg-[var(--color-accent)]",
    "text-black",
    "shadow-[var(--shadow-accent)]",
    "hover:-translate-y-0.5",
    "hover:border-[var(--color-accent-light)]",
    "hover:bg-[var(--color-accent-light)]",
    "hover:shadow-[var(--shadow-accent-strong)]",
    "active:translate-y-0",
  ].join(" "),

  secondary: [
    "border-[var(--color-border-light)]",
    "bg-white/[0.035]",
    "text-white",
    "hover:-translate-y-0.5",
    "hover:border-[var(--color-border-accent)]",
    "hover:bg-[var(--color-accent-soft)]",
    "hover:text-[var(--color-accent-light)]",
    "active:translate-y-0",
  ].join(" "),

  ghost: [
    "border-transparent",
    "bg-transparent",
    "text-[var(--color-text-secondary)]",
    "hover:bg-white/[0.055]",
    "hover:text-white",
  ].join(" "),

  danger: [
    "border-red-500/60",
    "bg-red-600",
    "text-white",
    "hover:-translate-y-0.5",
    "hover:bg-red-500",
    "active:translate-y-0",
  ].join(" "),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-7 text-sm",
  icon: "size-11 p-0",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    [
      "relative",
      "inline-flex",
      "shrink-0",
      "items-center",
      "justify-center",
      "gap-2",
      "overflow-hidden",
      "rounded-[var(--radius-sm)]",
      "border",
      "font-bold",
      "uppercase",
      "tracking-[0.1em]",
      "transition",
      "duration-200",
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-[var(--color-accent)]",
      "focus-visible:ring-offset-2",
      "focus-visible:ring-offset-black",
      "disabled:pointer-events-none",
      "disabled:translate-y-0",
      "disabled:opacity-60",
    ].join(" "),
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    className,
  );
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingText?: string;
  loadingIcon?: ReactNode;
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonProps
>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    loadingText = "Loading...",
    loadingIcon,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      className={buttonStyles({
        variant,
        size,
        fullWidth,
        className,
      })}
      {...props}
    >
      {loading ? (
        <>
          {loadingIcon ?? (
            <LoadingSpinner
              size="sm"
              label={loadingText}
            />
          )}

          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

Button.displayName = "Button";