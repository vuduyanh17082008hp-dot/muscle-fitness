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

import {
  usePathname,
} from "next/navigation";

/* =========================================================
   TYPES
========================================================= */

type NavigationLoadingContextValue = {
  isLoading:
    boolean;

  startLoading:
    () => void;

  stopLoading:
    () => void;
};

type NavigationLoadingProviderProps = {
  children:
    ReactNode;
};

/* =========================================================
   CONTEXT
========================================================= */

const NavigationLoadingContext =
  createContext<
    NavigationLoadingContextValue | null
  >(null);

/* =========================================================
   PROVIDER
========================================================= */

export function NavigationLoadingProvider({
  children,
}: NavigationLoadingProviderProps) {
  const pathname =
    usePathname();

  /*
   * Path from which navigation started.
   *
   * We derive loading state from pathname instead
   * of synchronously calling setState inside a
   * pathname effect.
   */
  const [
    loadingFromPath,
    setLoadingFromPath,
  ] =
    useState<string | null>(
      null,
    );

  /* =======================================================
     DERIVED LOADING STATE
  ======================================================= */

  const isLoading =
    loadingFromPath !==
      null &&
    loadingFromPath ===
      pathname;

  /* =======================================================
     START
  ======================================================= */

  const startLoading =
    useCallback(() => {
      setLoadingFromPath(
        pathname,
      );
    }, [pathname]);

  /* =======================================================
     STOP
  ======================================================= */

  const stopLoading =
    useCallback(() => {
      setLoadingFromPath(
        null,
      );
    }, []);

  /* =======================================================
     SAFETY TIMEOUT
  ======================================================= */

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          setLoadingFromPath(
            null,
          );
        },

        10000,
      );

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [isLoading]);

  /* =======================================================
     CONTEXT VALUE
  ======================================================= */

  const value =
    useMemo<
      NavigationLoadingContextValue
    >(
      () => ({
        isLoading,

        startLoading,

        stopLoading,
      }),

      [
        isLoading,
        startLoading,
        stopLoading,
      ],
    );

  /* =======================================================
     PROVIDER UI
  ======================================================= */

  return (
    <NavigationLoadingContext.Provider
      value={value}
    >
      {children}

      {isLoading && (
        <GlobalLoadingOverlay />
      )}
    </NavigationLoadingContext.Provider>
  );
}

/* =========================================================
   HOOK
========================================================= */

export function useNavigationLoading() {
  const context =
    useContext(
      NavigationLoadingContext,
    );

  if (!context) {
    throw new Error(
      "useNavigationLoading must be used inside NavigationLoadingProvider.",
    );
  }

  return context;
}

/* =========================================================
   GLOBAL OVERLAY
========================================================= */

function GlobalLoadingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="
        fixed
        inset-0

        z-9999

        flex
        items-center
        justify-center

        bg-black/90

        px-4

        backdrop-blur-xl
      "
    >
      {/* =================================================
          BACKGROUND GLOW
      ================================================= */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none

          absolute
          top-1/2
          left-1/2

          size-105

          -translate-x-1/2
          -translate-y-1/2

          rounded-full

          bg-(--color-accent)

          opacity-[0.08]

          blur-[110px]
        "
      />

      {/* =================================================
          LOADING CONTENT
      ================================================= */}

      <div className="relative text-center">
        <div className="relative mx-auto size-24">
          {/* ===============================================
              SPINNER
          =============================================== */}

          <div
            aria-hidden="true"
            className="
              absolute
              inset-0

              animate-spin

              rounded-full

              border-[3px]
              border-white/10

              border-t-(--color-accent)
              border-r-(--color-accent-light)
            "
          />

          {/* ===============================================
              BRAND MARK
          =============================================== */}

          <div
            className="
              absolute
              inset-6

              grid
              place-items-center

              rounded-md

              border
              border-(--color-border-accent)

              bg-(--color-accent-soft)

              font-heading
              text-2xl

              tracking-[0.08em]

              text-(--color-accent-light)
            "
          >
            MF
          </div>
        </div>

        {/* =================================================
            BRAND
        ================================================= */}

        <p
          className="
            mt-8

            text-xs
            font-bold

            uppercase

            tracking-[0.25em]

            text-(--color-accent-light)
          "
        >
          Muscle Fitness
        </p>

        {/* =================================================
            TITLE
        ================================================= */}

        <h2
          className="
            mt-3

            font-heading

            text-4xl

            tracking-[0.06em]

            text-white
          "
        >
          Loading
        </h2>

        {/* =================================================
            DESCRIPTION
        ================================================= */}

        <p
          className="
            mt-4

            text-sm

            text-(--color-text-secondary)
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