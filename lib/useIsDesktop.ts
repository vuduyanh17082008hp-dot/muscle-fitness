"use client";

import { useEffect, useState } from "react";

/**
 * Shared desktop/mobile breakpoint hook — extracted from
 * components/dashboard/floating-dante.tsx so the Muscle Atlas's
 * Selected Muscle Panel can use the exact same desktop/mobile branch
 * logic (anchored panel vs. BottomSheet) rather than a second copy.
 */
export function useIsDesktop(breakpointPx = 1024): boolean {
  // Lazy initializer reads matchMedia directly on mount. Callers that
  // render different DOM before/after hydration based on this value
  // should confirm that value isn't part of their SSR'd output (as
  // floating-dante.tsx's is not) to avoid a hydration mismatch.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${breakpointPx}px)`).matches : false,
  );

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${breakpointPx}px)`);

    function handleChange(event: MediaQueryListEvent) {
      setIsDesktop(event.matches);
    }

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [breakpointPx]);

  return isDesktop;
}
