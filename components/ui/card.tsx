import type {
  HTMLAttributes,
  ReactNode,
} from "react";

import { cn } from "@/lib/cn";

export interface CardProps
  extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({
  className,
  interactive = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        [
          "relative",
          "overflow-hidden",
          "rounded-[var(--radius-md)]",
          "border",
          "border-[var(--color-border)]",
          "bg-[var(--color-surface)]",
          "shadow-[var(--shadow-card)]",
        ].join(" "),
        interactive &&
          [
            "transition",
            "duration-300",
            "hover:-translate-y-1",
            "hover:border-[var(--color-border-accent)]",
            "hover:bg-[var(--color-surface-hover)]",
            "hover:shadow-[var(--shadow-card-hover)]",
          ].join(" "),
        className,
      )}
      {...props}
    />
  );
}

export function CardGlow() {
  return (
    <div
      aria-hidden="true"
      className="
        pointer-events-none
        absolute
        -right-20
        -top-20
        size-48
        rounded-full
        bg-[var(--color-accent)]
        opacity-[0.07]
        blur-3xl
      "
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative space-y-3 p-5 sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        [
          "font-heading",
          "text-2xl",
          "tracking-[0.06em]",
          "text-white",
          "sm:text-3xl",
        ].join(" "),
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        [
          "text-sm",
          "leading-7",
          "text-[var(--color-text-secondary)]",
          "sm:text-[0.95rem]",
        ].join(" "),
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative px-5 pb-5 sm:px-6 sm:pb-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        [
          "relative",
          "flex",
          "items-center",
          "border-t",
          "border-[var(--color-border)]",
          "px-5",
          "py-4",
          "sm:px-6",
        ].join(" "),
        className,
      )}
      {...props}
    />
  );
}

export type StatCardProps = {
  label: string;
  value: string;
  description?: ReactNode;
};

export function StatCard({
  label,
  value,
  description,
}: StatCardProps) {
  return (
    <Card
      interactive
      className="h-full p-5 sm:p-6"
    >
      <CardGlow />

      <div className="relative">
        <p
          className="
            text-xs
            font-bold
            uppercase
            tracking-[0.18em]
            text-[var(--color-text-muted)]
          "
        >
          {label}
        </p>

        <p
          className="
            mt-4
            font-heading
            text-4xl
            tracking-[0.04em]
            text-[var(--color-accent-light)]
            sm:text-5xl
          "
        >
          {value}
        </p>

        {description && (
          <div
            className="
              mt-3
              text-sm
              leading-6
              text-[var(--color-text-secondary)]
            "
          >
            {description}
          </div>
        )}
      </div>
    </Card>
  );
}