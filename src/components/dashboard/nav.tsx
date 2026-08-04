"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  History,
  LayoutDashboard,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/workouts", label: "Open workout", icon: Dumbbell },
  { href: "/dashboard/plans", label: "Plan builder", icon: CalendarDays },
  { href: "/dashboard/exercises", label: "Exercise library", icon: BookOpen },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/progress", label: "Progression", icon: Activity },
  { href: "/docs/workout-system", label: "Hướng dẫn 09", icon: ClipboardList },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-ink/10 bg-bone md:min-h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="px-5 py-5">
        <Link
          href="/"
          className="font-display text-xl tracking-[0.04em] text-ink"
        >
          Muscle Fitness
        </Link>
        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-steel">
          Dự án 09 · Workout
        </p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-6">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === href
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm transition ${
                active
                  ? "bg-ink text-lime"
                  : "text-steel hover:bg-mist hover:text-ink"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
