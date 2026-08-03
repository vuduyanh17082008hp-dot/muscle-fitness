import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type ErrorMessageProps = {
  title?: string;
  message?: string;
  details?: string;
  children?: ReactNode;
  className?: string;
};

export function ErrorMessage({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  details,
  children,
  className,
}: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={cn(
        `
          relative w-full max-w-xl
          overflow-hidden
          rounded-[var(--radius-md)]
          border border-red-500/30
          bg-[var(--color-surface)]
          p-6
          shadow-[var(--shadow-card)]
          sm:p-8
        `,
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          -right-16 -top-16
          size-40 rounded-full
          bg-red-500
          opacity-[0.08]
          blur-3xl
        "
      />

      <div className="relative">
        <div
          className="
            grid size-12 place-items-center
            rounded-[var(--radius-sm)]
            border border-red-500/40
            bg-red-500/10
            text-xl font-bold text-red-400
          "
        >
          !
        </div>

        <p
          className="
            mt-6 text-xs font-bold
            uppercase tracking-[0.2em]
            text-red-400
          "
        >
          System error
        </p>

        <h1
          className="
            mt-3 font-heading
            text-4xl tracking-[0.05em]
            text-white sm:text-5xl
          "
        >
          {title}
        </h1>

        <p
          className="
            mt-4 text-sm leading-7
            text-[var(--color-text-secondary)]
            sm:text-base
          "
        >
          {message}
        </p>

        {details && (
          <details
            className="
              mt-5 rounded-[var(--radius-sm)]
              border border-[var(--color-border)]
              bg-black/30 p-4
            "
          >
            <summary
              className="
                cursor-pointer text-xs font-bold
                uppercase tracking-[0.12em]
                text-[var(--color-text-muted)]
              "
            >
              Technical details
            </summary>

            <pre
              className="
                mt-3 overflow-x-auto
                whitespace-pre-wrap break-words
                text-xs leading-6 text-red-300
              "
            >
              {details}
            </pre>
          </details>
        )}

        {children && (
          <div
            className="
              mt-7 flex flex-col gap-3
              sm:flex-row
            "
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}