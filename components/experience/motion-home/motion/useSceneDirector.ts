"use client";

import { useEffect, type RefObject } from "react";
import { gsap, ScrollTrigger } from "@/components/experience/motion-home/motion/gsapSetup";

/**
 * Tracks which [data-chapter] section is active as the user scrolls, for
 * the chapter nav / progress indicator. Deliberately does NOT set React
 * state per scroll frame (spec: no React state update on every scroll
 * frame) — onToggle only fires at threshold crossings, and the caller's
 * onChange is expected to be a cheap, infrequent state update.
 *
 * Every ScrollTrigger created here is scoped to this hook's own gsap
 * context and killed on unmount — never touches ScrollTrigger.getAll().
 */
export function useSceneDirector(
  rootRef: RefObject<HTMLElement | null>,
  onChange: (chapterId: string) => void,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      const sections = root.querySelectorAll<HTMLElement>("[data-chapter]");

      sections.forEach((section) => {
        const id = section.dataset.chapter;
        if (!id) return;

        ScrollTrigger.create({
          trigger: section,
          start: "top center",
          end: "bottom center",
          onToggle: (self) => {
            if (self.isActive) onChange(id);
          },
        });
      });
    }, root);

    return () => ctx.revert();
  }, [rootRef, onChange]);
}
