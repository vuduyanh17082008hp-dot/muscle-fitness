"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  siteConfig,
  type NavigationItem,
} from "@/config/site";

type DashboardNavProps = {
  orientation?: "vertical" | "horizontal";
};

function isActiveRoute(
  pathname: string,
  item: NavigationItem,
): boolean {
  if (item.href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname.startsWith(item.href);
}

export function DashboardNav({
  orientation = "vertical",
}: DashboardNavProps) {
  const pathname = usePathname();

  const isHorizontal = orientation === "horizontal";

  return (
    <nav
      aria-label="Điều hướng dashboard"
      className={
        isHorizontal
          ? "flex min-w-max items-center gap-2"
          : "flex flex-col gap-2"
      }
    >
      {siteConfig.navigation.dashboard.map((item) => {
        const active = isActiveRoute(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "relative flex min-h-11 items-center",
              "whitespace-nowrap rounded-xl px-4",
              "text-sm font-medium",
              "transition-colors duration-200",

              active
                ? [
                    "bg-[var(--sidebar-active)]",
                    "text-foreground",
                    "shadow-[inset_0_0_0_1px_var(--border)]",
                  ].join(" ")
                : [
                    "text-muted-foreground",
                    "hover:bg-muted",
                    "hover:text-foreground",
                  ].join(" "),

              isHorizontal ? "justify-center" : "",
            ].join(" ")}
          >
            {active && !isHorizontal ? (
              <span
                aria-hidden="true"
                className={[
                  "absolute left-0 top-1/2",
                  "h-5 w-0.5 -translate-y-1/2",
                  "rounded-full bg-primary",
                ].join(" ")}
              />
            ) : null}

            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}