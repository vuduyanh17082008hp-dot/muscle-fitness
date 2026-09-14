"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Shared desktop/mobile breakpoint hook — extracted from
 * components/dashboard/floating-dante.tsx so the Muscle Atlas's
 * Selected Muscle Panel can use the exact same desktop/mobile branch
 * logic (anchored panel vs. BottomSheet) rather than a second copy.
 *
 * Built on `useSyncExternalStore` — React's own primitive for reading
 * a value from a browser API that changes over time — rather than a
 * `useState` + `useEffect` pair. Its `getServerSnapshot` argument is
 * used by React for BOTH the server render and the client's initial
 * hydration render, so the two are guaranteed identical (`false`)
 * with no window read during render at all; the real value then takes
 * over via `getSnapshot`/`subscribe` once mounted. This is the
 * SSR-safe pattern for "subscribe to matchMedia" — not a workaround.
 */
function subscribe(query: MediaQueryList, callback: () => void): () => void {
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function useIsDesktop(breakpointPx = 1024): boolean {
  const getSnapshot = useCallback(() => {
    return window.matchMedia(`(min-width: ${breakpointPx}px)`).matches;
  }, [breakpointPx]);

  const subscribeToQuery = useCallback(
    (callback: () => void) => subscribe(window.matchMedia(`(min-width: ${breakpointPx}px)`), callback),
    [breakpointPx],
  );

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribeToQuery, getSnapshot, getServerSnapshot);
}
