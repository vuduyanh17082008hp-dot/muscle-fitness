type LoadingStateProps = {
  title?: string;
  description?: string;
};

export function LoadingState({
  title = "Loading Muscle Fitness",
  description = "Preparing your next experience...",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="
        fixed inset-0 z-[9999]
        flex items-center justify-center
        overflow-hidden
        bg-black/90 px-4
        backdrop-blur-xl
      "
    >
      {/* Bronze background glow */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute
          left-1/2 top-1/2
          size-[420px]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          bg-[var(--color-accent)]
          opacity-[0.08]
          blur-[110px]
        "
      />

      {/* Steel grid */}
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          opacity-40
          [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)]
          [background-size:42px_42px]
        "
      />

      <div className="relative flex flex-col items-center text-center">
        {/* Main loader */}
        <div className="relative size-24">
          <div
            className="
              absolute inset-0
              animate-spin rounded-full
              border-[3px]
              border-white/10
              border-t-[var(--color-accent)]
              border-r-[var(--color-accent-light)]
            "
          />

          <div
            className="
              absolute inset-[11px]
              animate-[spin_1.7s_linear_infinite_reverse]
              rounded-full border-2
              border-white/5
              border-b-[var(--color-accent)]
            "
          />

          <div
            className="
              absolute inset-[25px]
              grid place-items-center
              rounded-[8px]
              border
              border-[var(--color-border-accent)]
              bg-[var(--color-accent-soft)]
              font-heading text-2xl
              tracking-[0.08em]
              text-[var(--color-accent-light)]
              shadow-[var(--shadow-accent)]
            "
          >
            MF
          </div>
        </div>

        <p
          className="
            mt-8 text-xs font-bold uppercase
            tracking-[0.25em]
            text-[var(--color-accent-light)]
          "
        >
          Muscle Fitness
        </p>

        <h2
          className="
            mt-3 font-heading
            text-4xl tracking-[0.06em]
            text-white sm:text-5xl
          "
        >
          {title}
        </h2>

        <p
          className="
            mt-4 max-w-md
            text-sm leading-7
            text-[var(--color-text-secondary)]
          "
        >
          {description}
        </p>

        {/* Animated loading bar */}
        <div
          className="
            mt-8 h-[3px] w-60
            overflow-hidden rounded-full
            bg-white/10
          "
        >
          <div
            className="
              h-full w-1/3
              animate-[muscle-loading_1.1s_ease-in-out_infinite]
              rounded-full
              bg-[var(--color-accent)]
              shadow-[0_0_15px_rgba(184,115,51,0.7)]
            "
          />
        </div>

        <span className="sr-only">
          Page is loading
        </span>
      </div>
    </div>
  );
}