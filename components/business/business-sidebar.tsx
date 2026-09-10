"use client";

import {
  Activity,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Dumbbell,
  LayoutDashboard,
  Settings,
  UserRoundCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type BusinessSidebarProps = {
  businessName: string;
  role: string;
};

const navigation = [
  {
    title: "Overview",
    href: "/business",
    icon: LayoutDashboard,
  },
  {
    title: "Members",
    href: "/business/members",
    icon: Users,
  },
  {
    title: "Trainers",
    href: "/business/trainers",
    icon: UserRoundCog,
  },
  {
    title: "Programs",
    href: "/business/programs",
    icon: Dumbbell,
  },
  {
    title: "Analytics",
    href: "/business/analytics",
    icon: BarChart3,
  },
  {
    title: "AI Insights",
    href: "/business/ai-insights",
    icon: Bot,
  },
  {
    title: "Settings",
    href: "/business/settings",
    icon: Settings,
  },
];

export default function BusinessSidebar({
  businessName,
  role,
}: BusinessSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-white/10 bg-[#090b10] lg:flex lg:flex-col">
      {/* ======================================================
          BRAND
      ====================================================== */}

      <div className="border-b border-white/10 px-6 py-6">
        <Link
          href="/business"
          className="flex items-center gap-3"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-black">
            <Activity className="h-6 w-6" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-base font-bold text-white">
              Muscle Fitness
            </p>

            <p className="text-xs text-zinc-500">
              Business Portal
            </p>
          </div>
        </Link>
      </div>

      {/* ======================================================
          WORKSPACE
      ====================================================== */}

      <div className="px-4 py-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-zinc-500">
            <BriefcaseBusiness className="h-4 w-4" />

            <span className="text-xs uppercase tracking-wider">
              Workspace
            </span>
          </div>

          <p className="truncate font-semibold text-white">
            {businessName}
          </p>

          <p className="mt-1 text-xs capitalize text-zinc-500">
            {role}
          </p>
        </div>
      </div>

      {/* ======================================================
          NAVIGATION
      ====================================================== */}

      <nav className="flex-1 space-y-1 px-4">
        {navigation.map((item) => {
          const Icon = item.icon;

          const active =
            item.href === "/business"
              ? pathname === "/business"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* ======================================================
          PORTAL SWITCH + LOGOUT
      ====================================================== */}

      <div className="space-y-2 border-t border-white/10 p-4">
        <Link
          href="/dashboard"
          className="flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          Switch to Client Portal
        </Link>

        <Link
          href="/admin/logout"
          className="flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-zinc-500 transition hover:bg-white/10 hover:text-white"
        >
          Sign Out
        </Link>
      </div>
    </aside>
  );
}