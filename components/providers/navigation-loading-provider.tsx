"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type NavigationLoadingContextValue = {
  isLoading: boolean;
  startLoading: () => void;
  stopLoading: () => void;
};

const NavigationLoadingContext =
  createContext<NavigationLoadingContextValue | null>(
    null,
  );

type NavigationLoadingProviderProps = {
  children: ReactNode;
};

export function NavigationLoadingProvider({
  children,
}: NavigationLoadingProviderProps) {
  const pathname = usePathname();

  const [isLoading, setIsLoading] =
    useState(false);

  const startLoading = useCallback(() => {
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setIsLoading(false);
  }, [pathname]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsLoading(false);
    }, 10000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isLoading]);

  const value = useMemo(
    () => ({
      isLoading,
      startLoading,
      stopLoading,
    }),
    [isLoading, startLoading, stopLoading],
  );

  return (
    <NavigationLoadingContext.Provider
      value={value}
    >
      {children}

      {isLoading && <GlobalLoadingOverlay />}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  const context = useContext(
    NavigationLoadingContext,
  );

  if (!context) {
    throw new Error(
      "useNavigationLoading must be used inside NavigationLoadingProvider.",
    );
  }

  return context;
}

function GlobalLoadingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="
        fixed inset-0 z-[9999]
        flex items-center justify-center
        bg-black/90 px-4
        backdrop-blur-xl
      "
    >
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

      <div className="relative text-center">
        <div className="relative mx-auto size-24">
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
              absolute inset-6
              grid place-items-center
              rounded-md border
              border-[var(--color-border-accent)]
              bg-[var(--color-accent-soft)]
              font-heading text-2xl
              tracking-[0.08em]
              text-[var(--color-accent-light)]
            "
          >
            MF
          </div>
        </div>

        <p
          className="
            mt-8 text-xs font-bold
            uppercase tracking-[0.25em]
            text-[var(--color-accent-light)]
          "
        >
          Muscle Fitness
        </p>

        <h2
          className="
            mt-3 font-heading
            text-4xl tracking-[0.06em]
            text-white
          "
        >
          Loading
        </h2>

        <p
          className="
            mt-4 text-sm
            text-[var(--color-text-secondary)]
          "
        >
          Preparing the next step of your journey.
        </p>

        <span className="sr-only">
          Page is loading
        </span>
      </div>
    </div>
  );
}