"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useTransitionNavigate } from "@/components/experience/motion-home/interaction/TransitionContext";

type TransitionLinkProps = ComponentProps<typeof Link> & { transitionLabel?: string };

/**
 * A real <Link> (works with JS disabled or if the transition throws)
 * that also asks PageTransition to play the circle-mask reveal first
 * (spec #94: navigation functionality is primary, animation is not).
 */
export function TransitionLink({ href, transitionLabel, onClick, children, ...rest }: TransitionLinkProps) {
  const triggerTransition = useTransitionNavigate();

  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (typeof href !== "string") return;

        event.preventDefault();
        triggerTransition(href, transitionLabel);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
