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
} from "framer-motion";

import {
  ArrowRight,
  LogIn,
} from "lucide-react";

import type {
  NavItem,
} from "@/lib/site-config";

import {
  cn,
} from "@/lib/cn";

import {
  buttonStyles,
} from "@/components/ui/button";

/* =========================================================
   TYPES
========================================================= */

type MobileMenuProps = {
  open: boolean;

  setOpen:
    Dispatch<
      SetStateAction<boolean>
    >;

  pathname: string;

  items:
    readonly NavItem[];

  loginHref: string;

  startHref: string;
};

/* =========================================================
   ACTIVE PATH
========================================================= */

function isActivePath(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(
    href,
  );
}

/* =========================================================
   MOBILE MENU
========================================================= */

export function MobileMenu({
  open,
  setOpen,
  pathname,
  items,
  loginHref,
  startHref,
}: MobileMenuProps) {
  /* =======================================================
     BODY SCROLL LOCK
  ======================================================= */

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [open]);

  /* =======================================================
     ESCAPE KEY
  ======================================================= */

  useEffect(() => {
    function closeWithEscape(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
        "Escape"
      ) {
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

  /* =======================================================
     CLOSE MENU
  ======================================================= */

  function closeMenu() {
    setOpen(false);
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-navigation"
          className="
            fixed
            inset-x-0
            bottom-0
            top-(--navbar-height)

            z-40

            overflow-y-auto

            border-t
            border-(--color-border)

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

            ease: [
              0.22,
              1,
              0.36,
              1,
            ],
          }}
        >
          {/* ===============================================
              BACKGROUND GRID
          =============================================== */}

          <div className="section-grid" />

          <div
            className="
              relative

              flex
              min-h-full
              flex-col

              px-4
              pt-5
              pb-8

              sm:px-6
            "
          >
            {/* =============================================
                NAVIGATION
            ============================================= */}

            <nav
              aria-label="Mobile navigation"
              className="space-y-1"
            >
              {items.map(
                (
                  item,
                  index,
                ) => {
                  const active =
                    isActivePath(
                      pathname,
                      item.href,
                    );

                  return (
                    <motion.div
                      key={
                        item.href
                      }
                      initial={{
                        opacity: 0,
                        x: -18,
                      }}
                      animate={{
                        opacity: 1,
                        x: 0,
                      }}
                      transition={{
                        duration:
                          0.35,

                        delay:
                          0.04 *
                          index,
                      }}
                    >
                      <Link
                        href={
                          item.href
                        }
                        aria-current={
                          active
                            ? "page"
                            : undefined
                        }
                        onClick={
                          closeMenu
                        }
                        className={cn(
                          `
                            flex
                            min-h-14

                            items-center
                            justify-between

                            rounded-sm

                            border

                            px-4

                            font-heading
                            text-2xl

                            tracking-[0.07em]

                            transition
                            duration-200
                          `,

                          active
                            ? `
                                border-(--color-border-accent)

                                bg-(--color-accent-soft)

                                text-(--color-accent-light)
                              `
                            : `
                                border-transparent

                                text-white

                                hover:border-(--color-border)

                                hover:bg-white/4
                              `,
                        )}
                      >
                        <span>
                          {
                            item.label
                          }
                        </span>

                        <span
                          className="
                            text-sm
                            font-body

                            text-(--color-text-muted)
                          "
                        >
                          0
                          {
                            index +
                            1
                          }
                        </span>
                      </Link>
                    </motion.div>
                  );
                },
              )}
            </nav>

            {/* =============================================
                CTA AREA
            ============================================= */}

            <div
              className="
                mt-auto

                grid
                gap-3

                border-t
                border-(--color-border)

                pt-6

                sm:grid-cols-2
              "
            >
              <Link
                href={
                  loginHref
                }
                onClick={
                  closeMenu
                }
                className={buttonStyles(
                  {
                    variant:
                      "secondary",

                    size:
                      "lg",

                    fullWidth:
                      true,
                  },
                )}
              >
                <LogIn className="size-4" />

                Login
              </Link>

              <Link
                href={
                  startHref
                }
                onClick={
                  closeMenu
                }
                className={buttonStyles(
                  {
                    variant:
                      "primary",

                    size:
                      "lg",

                    fullWidth:
                      true,
                  },
                )}
              >
                Start Journey

                <ArrowRight className="size-4" />
              </Link>
            </div>

            {/* =============================================
                FOOTER
            ============================================= */}

            <p
              className="
                mt-6

                text-center
                text-xs

                uppercase

                tracking-[0.16em]

                text-(--color-text-muted)
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