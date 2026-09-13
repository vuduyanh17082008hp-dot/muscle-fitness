"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * BottomSheet — the reusable modal/sheet primitive (spec: "BottomSheet
 * / Modal"). Built on @radix-ui/react-dialog, the same dependency
 * already used by components/nutrition/track-food-modal.tsx — not a
 * second modal library. Slides up from the bottom on mobile (reads as
 * an app sheet, not a compressed desktop dialog) and centers as a
 * standard modal from `sm:` up.
 *
 * This is additive: existing bespoke Radix Dialog usages (like the
 * food-tracking modal) are NOT required to migrate in this pass.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  "fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-[24px] border-t border-white/10 bg-mf-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60",
                  // Desktop: centered via margin:auto on all four insets — no
                  // `transform` needed here, so it never fights framer's own
                  // transform-based y-animation below.
                  "sm:inset-0 sm:bottom-auto sm:m-auto sm:h-fit sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-[20px] sm:border sm:p-6",
                  className,
                )}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  {title ? (
                    <Dialog.Title className="text-base font-bold text-white">{title}</Dialog.Title>
                  ) : (
                    <Dialog.Title className="sr-only">Dialog</Dialog.Title>
                  )}

                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close"
                      className="grid size-8 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
                    >
                      <X className="size-4" />
                    </button>
                  </Dialog.Close>
                </div>

                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
