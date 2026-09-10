"use client";

import {
  BarChart3,
  Bot,
  Dumbbell,
  LayoutDashboard,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    title: "Home",
    href: "/business",
    icon: LayoutDashboard,
  },
  {
    title: "Members",
    href: "/business/members",
    icon: Users,
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
    title: "AI",
    href: "/business/ai-insights",
    icon: Bot,
  },
];

export default function BusinessMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#090b10] lg:hidden">
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon;

          const active =
            item.href === "/business"
              ? pathname === "/business"
              : pathname.startsWith(item.href);

          return (
            <Link
              href={item.href}
              key={item.href}
              className={`flex flex-col items-center gap-1 px-2 py-3 text-[11px] transition ${
                active
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-5 w-5" />

              {item.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}