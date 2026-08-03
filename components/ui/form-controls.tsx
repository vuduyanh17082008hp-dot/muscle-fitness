import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

export const Label = forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={cn(
        `
          block text-sm font-semibold
          text-[var(--color-text-primary)]
        `,
        className,
      )}
      {...props}
    />
  );
});

Label.displayName = "Label";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        `
          h-12 w-full min-w-0
          rounded-[var(--radius-sm)]
          border border-[var(--color-border)]
          bg-[var(--color-surface)]
          px-4 text-sm text-white
          shadow-sm outline-none
          transition duration-200
          placeholder:text-[var(--color-text-muted)]
          hover:border-[var(--color-border-light)]
          focus:border-[var(--color-accent)]
          focus:ring-2
          focus:ring-[var(--color-accent-soft)]
          disabled:cursor-not-allowed
          disabled:opacity-50
        `,
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        `
          min-h-32 w-full min-w-0 resize-y
          rounded-[var(--radius-sm)]
          border border-[var(--color-border)]
          bg-[var(--color-surface)]
          px-4 py-3 text-sm text-white
          shadow-sm outline-none
          transition duration-200
          placeholder:text-[var(--color-text-muted)]
          hover:border-[var(--color-border-light)]
          focus:border-[var(--color-accent)]
          focus:ring-2
          focus:ring-[var(--color-accent-soft)]
          disabled:cursor-not-allowed
          disabled:opacity-50
        `,
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
};

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>

      {children}

      {error ? (
        <p className="text-sm text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p
          className="
            text-xs leading-5
            text-[var(--color-text-muted)]
          "
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}