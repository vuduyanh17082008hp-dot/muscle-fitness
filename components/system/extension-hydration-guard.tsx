"use client";

import { useEffect } from "react";

/**
 * Some browser extensions inject attributes (e.g. bis_skin_checked) before React hydrates.
 * Suppress the resulting hydration mismatch noise in development.
 */
export function ExtensionHydrationGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const message = args[0];
      if (
        typeof message === "string" &&
        (message.includes("bis_skin_checked") ||
          message.includes("A tree hydrated but some attributes"))
      ) {
        return;
      }
      originalError(...args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return null;
}
