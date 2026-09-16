"use client";

import { createContext, useContext } from "react";

export type TriggerTransition = (href: string, label?: string) => void;

/**
 * Lets any CTA in the tree ask the page-transition overlay to run before
 * navigating, without every scene reaching into PageTransition directly.
 * Default no-op means a CTA rendered outside the provider (shouldn't
 * happen, but keeps this safe) just falls through to plain <Link> nav.
 */
export const TransitionContext = createContext<TriggerTransition>(() => {});

export function useTransitionNavigate(): TriggerTransition {
  return useContext(TransitionContext);
}
