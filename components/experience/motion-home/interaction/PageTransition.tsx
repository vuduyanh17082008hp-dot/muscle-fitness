"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { gsap } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import { TransitionContext, type TriggerTransition } from "@/components/experience/motion-home/interaction/TransitionContext";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

/**
 * Full-screen circle-mask transition (spec effect #7). Real navigation
 * is never blocked by it: if the animation throws for any reason, the
 * catch still calls router.push so the CTA keeps working. Reduced
 * motion skips the animation and navigates immediately.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { reducedMotion } = useMotionCapabilities();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("Entering the system…");
  const [visible, setVisible] = useState(false);

  const triggerTransition = useCallback<TriggerTransition>(
    (href, customLabel) => {
      if (reducedMotion) {
        router.push(href);
        return;
      }

      setLabel(customLabel ?? "Entering the system…");
      setVisible(true);

      requestAnimationFrame(() => {
        const overlay = overlayRef.current;
        if (!overlay) {
          router.push(href);
          return;
        }

        try {
          gsap.fromTo(
            overlay,
            { clipPath: "circle(0% at 50% 50%)" },
            {
              clipPath: "circle(150% at 50% 50%)",
              duration: 0.9,
              ease: ease.cinematic,
              onComplete: () => router.push(href),
            },
          );
        } catch {
          router.push(href);
        }
      });
    },
    [reducedMotion, router],
  );

  const contextValue = useMemo(() => triggerTransition, [triggerTransition]);

  return (
    <TransitionContext.Provider value={contextValue}>
      {children}

      <div
        ref={overlayRef}
        aria-hidden="true"
        hidden={!visible}
        className={styles.transitionOverlay}
        style={{ clipPath: "circle(0% at 50% 50%)" }}
      >
        <span className={styles.transitionLabel}>{label}</span>
      </div>
    </TransitionContext.Provider>
  );
}
