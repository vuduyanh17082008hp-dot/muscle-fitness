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
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  CheckSquare2,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  Home,
  LayoutDashboard,
  Layers3,
  LogOut,
  Menu,
  MessageSquareText,
  PieChart,
  Settings,
  Sparkles,
  Utensils,
  X,
  Zap,
} from "lucide-react";

import {
  logoutAction,
} from "@/app/dashboard/actions";

/* =========================================================
   TYPES
========================================================= */

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

type SidebarContentProps = {
  pathname: string;
  hash: string;
  onNavigate?: () => void;
};

/* =========================================================
   NAVIGATION

   Grouped to match the Muscle Fitness client information
   architecture: Overview, Your Plan (training + nutrition),
   Tracking, Coaching, Account.
========================================================= */

const navSections: NavSection[] = [
  {
    title: "Overview",

    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
      {
        label: "Today",
        href: "/dashboard/today",
        icon: Zap,
      },
    ],
  },

  {
    title: "Your Plan",

    items: [
      {
        label: "Training Plan",
        href: "/dashboard/workouts",
        icon: Dumbbell,
      },
      {
        label: "Training Split",
        href: "/dashboard/split",
        icon: Layers3,
      },
      {
        label: "Nutrition Plan",
        href: "/dashboard/nutrition",
        icon: Utensils,
      },
      {
        label: "Macro Targets",
        href: "/dashboard/nutrition#macros",
        icon: PieChart,
      },
      {
        label: "Recovery",
        href: "/dashboard/recovery",
        icon: HeartPulse,
      },
    ],
  },

  {
    title: "Tracking",

    items: [
      {
        label: "Progress",
        href: "/dashboard/progress",
        icon: ChartNoAxesCombined,
      },
      {
        label: "Check-in",
        href: "/dashboard/check-in",
        icon: CheckSquare2,
      },
    ],
  },

  {
    title: "Coaching",

    items: [
      {
        label: "AI Coach",
        href: "/dashboard/ai-coach",
        icon: Bot,
      },
      {
        label: "Messages",
        href: "/dashboard/messages",
        icon: MessageSquareText,
      },
      {
        label: "Calendar",
        href: "/dashboard/calendar",
        icon: CalendarDays,
      },
    ],
  },

  {
    title: "Account",

    items: [
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
      },
    ],
  },
];

/* =========================================================
   ACTIVE ROUTE
========================================================= */

function splitHref(href: string): { path: string; hash: string | null } {
  const [path, hash] = href.split("#");
  return { path, hash: hash ?? null };
}

function isActive(
  pathname: string,
  currentHash: string,
  item: NavItem,
): boolean {
  const { path, hash } = splitHref(item.href);

  if (hash) {
    return pathname === path && currentHash === `#${hash}`;
  }

  if (item.exact) {
    return pathname === path;
  }

  return (
    pathname === path ||
    pathname.startsWith(`${path}/`)
  );
}

/* =========================================================
   SIDEBAR CONTENT
========================================================= */

function SidebarContent({
  pathname,
  hash,
  onNavigate,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex h-20 items-center border-b border-white/10 px-5">
        <Link
          href="/dashboard"
          onClick={
            onNavigate
          }
          className="flex items-center gap-3"
        >
          <span className="grid size-10 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300 shadow-[0_0_35px_rgba(251,191,36,0.12)]">
            <Dumbbell className="size-5" />
          </span>

          <span>
            <span className="block text-sm font-black tracking-[0.16em] text-white">
              MUSCLE FITNESS
            </span>

            <span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Client OS
            </span>
          </span>
        </Link>
      </div>

      <nav
        aria-label="Dashboard navigation"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-5"
      >
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">
              {section.title}
            </p>

            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(pathname, hash, item);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
                        : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/4 hover:text-white"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />

                    <span className="flex-1">{item.label}</span>

                    <ChevronRight
                      className={`size-4 transition ${
                        active
                          ? "translate-x-0 opacity-100"
                          : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"
                      }`}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/"
          onClick={
            onNavigate
          }
          className="mb-3 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-200"
        >
          <Home className="size-4 shrink-0" />

          Back to homepage
        </Link>

        <Link
          href="/dashboard/ai-coach"
          onClick={
            onNavigate
          }
          className="mb-3 flex items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-400/10 p-3 text-sm text-violet-100 transition hover:bg-violet-400/15"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-violet-300/10">
            <Sparkles className="size-4" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block font-bold">
              Ask Dante
            </span>

            <span className="block truncate text-xs text-violet-200/60">
              Use your real profile data
            </span>
          </span>
        </Link>

        <form
          action={
            logoutAction
          }
        >
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300"
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
   DASHBOARD SHELL
========================================================= */

export function DashboardShell({
  children,
}: {
  children:
    ReactNode;
}) {
  const pathname =
    usePathname();

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

  function closeMobileMenu() {
    setMobileOpen(
      false,
    );
  }

  return (
    <div className="min-h-screen bg-[#08090b] text-zinc-100">
      {/* ===================================================
          DESKTOP SIDEBAR
      =================================================== */}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-white/10 bg-[#0b0d10]/95 backdrop-blur-xl lg:flex">
        <SidebarContent
          pathname={
            pathname
          }
          hash={hash}
        />
      </aside>

      {/* ===================================================
          MOBILE HEADER
      =================================================== */}

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#08090b]/90 px-4 backdrop-blur-xl lg:hidden">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5"
        >
          <span className="grid size-9 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
            <Dumbbell className="size-4" />
          </span>

          <span className="truncate text-xs font-black tracking-[0.16em]">
            MUSCLE FITNESS
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/"
            aria-label="Back to homepage"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-amber-400/30 hover:text-amber-200"
          >
            <Home className="size-3.5" />

            Home
          </Link>

          <button
            type="button"
            onClick={() =>
              setMobileOpen(
                true,
              )
            }
            aria-label="Open dashboard navigation"
            className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/4 text-zinc-300"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      {/* ===================================================
          MOBILE MENU
      =================================================== */}

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close dashboard navigation"
            onClick={
              closeMobileMenu
            }
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />

          <aside className="absolute inset-y-0 left-0 flex w-[88%] max-w-80 flex-col border-r border-white/10 bg-[#0b0d10] shadow-2xl">
            <button
              type="button"
              onClick={
                closeMobileMenu
              }
              aria-label="Close dashboard navigation"
              className="absolute right-3 top-5 z-10 grid size-9 place-items-center rounded-lg border border-white/10 bg-white/4 text-zinc-400"
            >
              <X className="size-4" />
            </button>

            <SidebarContent
              pathname={
                pathname
              }
              hash={hash}
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

      <main className="min-h-screen lg:pl-72">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
          {
            children
          }
        </div>
      </main>
    </div>
  );
}
