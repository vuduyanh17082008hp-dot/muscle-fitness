"use client";

import {
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  ChartNoAxesCombined,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserRound,
  Utensils,
  X,
} from "lucide-react";

import { logoutAction } from "@/app/dashboard/actions";
import { useAuth } from "@/app/context/AuthContext";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "AI Coach",
    href: "/ai-coach",
    icon: Bot,
  },
  {
    label: "Workouts",
    href: "/dashboard/workouts",
    icon: Dumbbell,
  },
  {
    label: "Nutrition",
    href: "/dashboard/nutrition",
    icon: Utensils,
  },
  {
    label: "Progress",
    href: "/dashboard/progress",
    icon: ChartNoAxesCombined,
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`)
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function NavPills({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto"
      aria-label="Primary"
    >
      {navItems.map((item) => {
        const active = isActive(pathname, item);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200 ${
              active
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-light)]"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileMenu() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <div className="size-10 animate-pulse rounded-full bg-white/5" />
    );
  }

  const metadata = (user?.user_metadata ?? {}) as Record<
    string,
    unknown
  >;
  const displayName =
    (typeof metadata.full_name === "string" &&
      metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    user?.email?.split("@")[0] ||
    "Athlete";

  const initials = getInitials(displayName);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Open profile menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-[var(--color-accent-light)] transition-colors hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent-soft)]"
      >
        {initials || <UserRound className="size-4" />}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close profile menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121214] py-1 shadow-xl">
            <p className="truncate px-3 py-2 text-xs text-zinc-500">
              {user?.email ?? displayName}
            </p>
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-200 transition-colors hover:bg-white/[0.04]"
            >
              <UserRound className="size-4" />
              Account
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-200 transition-colors hover:bg-white/[0.04]"
            >
              <Settings className="size-4" />
              Settings
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#050505] text-[var(--color-text-primary)]">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#080808]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between gap-4 px-4 md:px-6 xl:px-8">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-2.5"
          >
            <span className="grid size-9 place-items-center rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent-light)]">
              <Dumbbell className="size-4" aria-hidden />
            </span>
            <span className="truncate text-sm font-black tracking-[0.14em] text-white">
              MUSCLE FITNESS
            </span>
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <NavPills
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>

          <div className="flex items-center gap-2">
            <ProfileMenu />
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-300 md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-[min(88%,20rem)] flex-col border-l border-white/[0.08] bg-[#0B0B0C] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Navigate
              </p>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="grid size-9 place-items-center rounded-lg border border-white/[0.08] text-zinc-400"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`inline-flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-light)]"
                        : "text-zinc-300 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-6 md:py-8 xl:px-8">
        {children}
      </main>
    </div>
  );
}
