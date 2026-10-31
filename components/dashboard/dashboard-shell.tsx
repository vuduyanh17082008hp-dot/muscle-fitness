"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

import type {
  LucideIcon,
} from "lucide-react";

import {
  Beaker,
  BookOpen,
  Bot,
  CalendarCheck,
  CalendarDays,
  ChartNoAxesCombined,
  Dumbbell,
  Flame,
  HeartPulse,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";

import {
  logoutAction,
} from "@/app/dashboard/actions";

import { Toaster } from "react-hot-toast";

import { Wordmark } from "@/components/brand/wordmark";
import { FloatingDante } from "@/components/dashboard/floating-dante";
import { QuickCapture } from "@/components/dashboard/quick-capture";
import { isPaperRoute } from "@/lib/paper-theme";

/* =========================================================
   TYPES
========================================================= */

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  /**
   * Additional route prefixes that should also mark this nav item
   * active. Used for Muscle Intelligence (/dashboard/training-intelligence),
   * which conceptually belongs under Train but lives at a sibling
   * route rather than nested under /dashboard/workouts.
   */
  activePrefixes?: string[];
  /** Dante keeps its violet identity in the nav. */
  dante?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

type SidebarContentProps = {
  pathname: string;
  hash: string;
  activeSessionHref: string | null;
  onNavigate?: () => void;
};

/* =========================================================
   NAVIGATION (Iron & Paper)

   Five primary destinations — Today, Train, Fuel, Recovery, Dante —
   match the mobile bar. Progress, Calendar, History and Library are a
   "Track" group (sidebar on desktop, the More drawer on mobile, plus
   Today's secondary strip), so nothing that was reachable before is
   hidden. Routes are unchanged; only labels and grouping moved.
========================================================= */

const TODAY: NavItem = { label: "Today", href: "/dashboard", icon: CalendarCheck, exact: true };
const TRAIN: NavItem = { label: "Train", href: "/dashboard/workouts", icon: Dumbbell, activePrefixes: ["/dashboard/training-intelligence"] };
const FUEL: NavItem = { label: "Fuel", href: "/dashboard/nutrition", icon: Flame };
const RECOVERY: NavItem = { label: "Recovery", href: "/dashboard/recovery", icon: HeartPulse };
const DANTE: NavItem = { label: "Dante", href: "/dashboard/ai-coach", icon: Bot, dante: true };

const navSections: NavSection[] = [
  { title: "Train", items: [TODAY, TRAIN, FUEL, RECOVERY, DANTE] },
  {
    title: "Track",
    items: [
      { label: "Progress", href: "/dashboard/progress", icon: ChartNoAxesCombined },
      { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
      { label: "History", href: "/dashboard/workouts/history", icon: History },
      { label: "Library", href: "/dashboard/workouts/library", icon: BookOpen },
    ],
  },
  {
    title: "More",
    items: [
      { label: "Experiments", href: "/dashboard/experiments", icon: Beaker },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

/* =========================================================
   MOBILE PRIMARY NAV — five thumb-reachable tabs. Train becomes
   "Active" (linking to the session) only while the server reports a
   real in-progress or paused session; everything else is in More.
========================================================= */

const mobilePrimaryNav: NavItem[] = [
  { label: "Today", href: "/dashboard", icon: CalendarCheck, exact: true },
  { label: "Train", href: "/dashboard/workouts", icon: Dumbbell, activePrefixes: ["/dashboard/training-intelligence"] },
  { label: "Fuel", href: "/dashboard/nutrition", icon: Flame },
  { label: "Recovery", href: "/dashboard/recovery", icon: HeartPulse },
  { label: "Dante", href: "/dashboard/ai-coach", icon: Bot, dante: true },
];

const ALL_ITEMS = [...navSections.flatMap((section) => section.items), ...mobilePrimaryNav];

/* =========================================================
   ACTIVE ROUTE — the most specific matching item wins, so
   /dashboard/workouts/history lights History, not Train as well.
========================================================= */

function splitHref(href: string): { path: string; hash: string | null } {
  const [path, hash] = href.split("#");
  return { path, hash: hash ?? null };
}

function matchLength(pathname: string, currentHash: string, item: NavItem): number {
  const { path, hash } = splitHref(item.href);

  if (hash) {
    return pathname === path && currentHash === `#${hash}` ? path.length + 1 : -1;
  }

  if (item.exact) {
    return pathname === path ? path.length : -1;
  }

  if (pathname === path || pathname.startsWith(`${path}/`)) {
    return path.length;
  }

  const prefix = item.activePrefixes?.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return prefix ? prefix.length : -1;
}

function activeHref(pathname: string, currentHash: string): string | null {
  let best: { href: string; length: number } | null = null;
  for (const item of ALL_ITEMS) {
    const length = matchLength(pathname, currentHash, item);
    if (length >= 0 && (!best || length > best.length)) best = { href: item.href, length };
  }
  return best?.href ?? null;
}

/* =========================================================
   SIDEBAR CONTENT
========================================================= */

function SidebarContent({
  pathname,
  hash,
  activeSessionHref,
  onNavigate,
}: SidebarContentProps) {
  const current = activeHref(pathname, hash);

  return (
    <>
      <div className="flex h-16 items-center border-b border-mf-glass-border px-5">
        <Wordmark href="/dashboard" label="Muscle Fitness — Today" onClick={onNavigate} />
      </div>

      <nav
        aria-label="Dashboard navigation"
        className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
      >
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
              {section.title}
            </p>

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = current === item.href;
                const Icon = item.icon;
                const isTrain = item.href === TRAIN.href && activeSessionHref;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition ${
                      active
                        ? `bg-mf-glass-hover font-bold ${item.dante ? "text-mf-glass-dante" : "text-mf-glass-text"}`
                        : "font-medium text-mf-glass-text-secondary hover:bg-mf-glass-hover/60 hover:text-mf-glass-text"
                    }`}
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full ${item.dante ? "bg-mf-glass-dante" : "bg-mf-glass-text"}`}
                      />
                    ) : null}

                    <Icon className="size-4 shrink-0" />

                    <span className="flex-1">{item.label}</span>

                    {isTrain ? (
                      <span className="rounded border border-mf-glass-text px-1.5 py-0.5 text-xs font-bold uppercase leading-none">
                        Active
                      </span>
                    ) : null}
                  </Link>
                );
              })}

              {section.title === "Train" && activeSessionHref ? (
                <Link
                  href={activeSessionHref}
                  onClick={onNavigate}
                  className="ml-10 flex min-h-11 items-center text-sm font-semibold text-mf-glass-text underline decoration-mf-glass-border-strong underline-offset-4 hover:decoration-mf-glass-text"
                >
                  Open active session
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-mf-glass-border p-3">
        <Link
          href="/"
          onClick={
            onNavigate
          }
          className="mb-2 flex min-h-11 w-full items-center gap-3 rounded-md border border-mf-glass-border px-3 text-sm font-semibold text-mf-glass-text-secondary transition hover:border-mf-glass-border-strong hover:text-mf-glass-text"
        >
          <Home className="size-4 shrink-0" />

          Back to homepage
        </Link>

        <form
          action={
            logoutAction
          }
        >
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-mf-glass-text-muted transition hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="size-4" />

            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

/* =========================================================
   MOBILE BOTTOM NAV
========================================================= */

function MobileBottomNav({ pathname, hash, activeSessionHref }: { pathname: string; hash: string; activeSessionHref: string | null }) {
  const current = activeHref(pathname, hash);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-mf-glass-border bg-mf-glass-bg/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {mobilePrimaryNav.map((item) => {
        const isActiveSession = item.href === TRAIN.href && activeSessionHref !== null;
        const href = isActiveSession && activeSessionHref ? activeSessionHref : item.href;
        const active = current === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-xs leading-none transition ${
              active
                ? `font-bold ${item.dante ? "text-mf-glass-dante" : "text-mf-glass-text"}`
                : "font-medium text-mf-glass-text-muted"
            }`}
          >
            {active ? (
              <span aria-hidden="true" className={`absolute inset-x-4 top-0 h-[3px] rounded-b-full ${item.dante ? "bg-mf-glass-dante" : "bg-mf-glass-text"}`} />
            ) : null}
            <span className="relative">
              <Icon className="size-5 shrink-0" />
              {isActiveSession ? (
                <span aria-hidden="true" className="absolute -right-1 -top-1 size-2.5 rounded-full border border-mf-glass-text bg-mf-glass-brand" />
              ) : null}
            </span>
            <span className="max-w-full truncate">{isActiveSession ? "Active" : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* =========================================================
   DASHBOARD SHELL
========================================================= */

export function DashboardShell({
  children,
  activeSessionId = null,
}: {
  children:
    ReactNode;
  /** A real in-progress/paused session id from the server, or null. */
  activeSessionId?: string | null;
}) {
  const pathname =
    usePathname();

  const activeSessionHref = activeSessionId ? `/dashboard/workouts/session/${activeSessionId}` : null;

  const [
    mobileOpen,
    setMobileOpen,
  ] =
    useState(false);

  const [hash, setHash] = useState("");

  useEffect(() => {
    function updateHash() {
      setHash(window.location.hash);
    }

    updateHash();

    window.addEventListener("hashchange", updateHash);

    return () => {
      window.removeEventListener("hashchange", updateHash);
    };
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  function closeMobileMenu() {
    setMobileOpen(
      false,
    );
  }

  return (
    <div data-theme={isPaperRoute(pathname) ? "paper" : undefined} className="min-h-screen bg-mf-glass-bg text-mf-glass-text">
      {/* ===================================================
          DESKTOP SIDEBAR
      =================================================== */}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-mf-glass-border bg-mf-glass-surface lg:flex">
        <SidebarContent
          pathname={
            pathname
          }
          hash={hash}
          activeSessionHref={activeSessionHref}
        />
      </aside>

      {/* ===================================================
          MOBILE HEADER
      =================================================== */}

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-mf-glass-border bg-mf-glass-bg/95 px-4 backdrop-blur-xl lg:hidden">
        <Wordmark href="/dashboard" label="Muscle Fitness — Today" />

        <button
          type="button"
          onClick={() =>
            setMobileOpen(
              true,
            )
          }
          aria-label="More: Progress, Calendar, History, Library, Settings"
          aria-expanded={mobileOpen}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-mf-glass-border-strong px-3 text-sm font-semibold text-mf-glass-text"
        >
          <Menu className="size-5" />
          More
        </button>
      </header>

      {/* ===================================================
          MOBILE MENU
      =================================================== */}

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close dashboard navigation"
            tabIndex={-1}
            onClick={
              closeMobileMenu
            }
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />

          <aside className="absolute inset-y-0 left-0 flex w-[88%] max-w-80 flex-col border-r border-mf-glass-border bg-mf-glass-surface shadow-2xl">
            <button
              type="button"
              onClick={
                closeMobileMenu
              }
              aria-label="Close dashboard navigation"
              className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-md border border-mf-glass-border text-mf-glass-text-secondary"
            >
              <X className="size-4" />
            </button>

            <SidebarContent
              pathname={
                pathname
              }
              hash={hash}
              activeSessionHref={activeSessionHref}
              onNavigate={
                closeMobileMenu
              }
            />
          </aside>
        </div>
      ) : null}

      {/* ===================================================
          MAIN
      =================================================== */}

      {/* lg:pr-20 reserves the floating-controls column so they never sit on a card. */}
      <main className="min-h-screen pb-28 lg:pb-10 lg:pl-72 lg:pr-20">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
          {
            children
          }
        </div>
      </main>

      {/* ===================================================
          MOBILE BOTTOM NAV
      =================================================== */}

      <MobileBottomNav pathname={pathname} hash={hash} activeSessionHref={activeSessionHref} />

      {/* The one toast surface (Form Coach camera/pose errors used to fire with
          nothing mounted). Bottom-centre above the tab bar, never over the
          header; react-hot-toast announces through an aria-live status region. */}
      <Toaster
        position="bottom-center"
        containerStyle={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        toastOptions={{ style: { background: "var(--mf-glass-text)", color: "var(--mf-glass-bg)", fontSize: "14px", borderRadius: "10px" } }}
      />

      {/* ===================================================
          FLOATING CONTROLS (PF-02) — Centralized floating layout
          for Floating Dante and Quick Capture (+).
          Desktop only, in the gutter main reserves (lg:pr-20). Below
          lg they covered Send, chat replies and the workout bar, and
          the bottom nav plus the More drawer carry every Quick Capture
          destination and Dante.
      =================================================== */}

      <aside
        aria-label="Floating quick actions"
        className="pointer-events-none fixed bottom-6 right-6 z-40 hidden flex-col-reverse items-center gap-3 lg:flex"
      >
        <FloatingDante />
        <QuickCapture />
      </aside>
    </div>
  );
}
