"use client";

import {
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
} from "motion/react";
import {
  ArrowRight,
  LogIn,
} from "lucide-react";

import type { NavItem } from "@/lib/site-config";
import { cn } from "@/lib/cn";
import {
  buttonStyles,
} from "@/components/ui/button";

type MobileMenuProps = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  pathname: string;
  items: readonly NavItem[];
  loginHref: string;
  startHref: string;
};

function isActivePath(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function MobileMenu({
  open,
  setOpen,
  pathname,
  items,
  loginHref,
  startHref,
}: MobileMenuProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  useEffect(() => {
    function closeWithEscape(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener(
      "keydown",
      closeWithEscape,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        closeWithEscape,
      );
    };
  }, [setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-navigation"
          className="
            fixed inset-x-0 bottom-0
            top-[var(--navbar-height)]
            z-40 overflow-y-auto
            border-t border-[var(--color-border)]
            bg-[rgba(7,7,7,0.98)]
            backdrop-blur-2xl
            lg:hidden
          "
          initial={{
            opacity: 0,
            y: -12,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            y: -12,
          }}
          transition={{
            duration: 0.25,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="section-grid" />

          <div
            className="
              relative flex min-h-full
              flex-col px-4 pb-8 pt-5
              sm:px-6
            "
          >
            <nav
              aria-label="Mobile navigation"
              className="space-y-1"
            >
              {items.map((item, index) => {
                const active = isActivePath(
                  pathname,
                  item.href,
                );

                return (
                  <motion.div
                    key={item.href}
                    initial={{
                      opacity: 0,
                      x: -18,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                    }}
                    transition={{
                      duration: 0.35,
                      delay: 0.04 * index,
                    }}
                  >
                    <Link
                      href={item.href}
                      aria-current={
                        active ? "page" : undefined
                      }
                      onClick={() => setOpen(false)}
                      className={cn(
                        `
                          flex min-h-14 items-center
                          justify-between
                          rounded-[var(--radius-sm)]
                          border px-4
                          font-heading text-2xl
                          tracking-[0.07em]
                          transition duration-200
                        `,
                        active
                          ? `
                              border-[var(--color-border-accent)]
                              bg-[var(--color-accent-soft)]
                              text-[var(--color-accent-light)]
                            `
                          : `
                              border-transparent
                              text-white
                              hover:border-[var(--color-border)]
                              hover:bg-white/[0.04]
                            `,
                      )}
                    >
                      <span>{item.label}</span>

                      <span
                        className="
                          text-sm font-body
                          text-[var(--color-text-muted)]
                        "
                      >
                        0{index + 1}
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </nav>

            <div
              className="
                mt-auto grid gap-3
                border-t border-[var(--color-border)]
                pt-6 sm:grid-cols-2
              "
            >
              <Link
                href={loginHref}
                onClick={() => setOpen(false)}
                className={buttonStyles({
                  variant: "secondary",
                  size: "lg",
                  fullWidth: true,
                })}
              >
                <LogIn className="size-4" />
                Login
              </Link>

              <Link
                href={startHref}
                onClick={() => setOpen(false)}
                className={buttonStyles({
                  variant: "primary",
                  size: "lg",
                  fullWidth: true,
                })}
              >
                Start Journey
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <p
              className="
                mt-6 text-center text-xs
                uppercase tracking-[0.16em]
                text-[var(--color-text-muted)]
              "
            >
              Built through discipline
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}