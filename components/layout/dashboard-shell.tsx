import Link from "next/link";
import type { ReactNode } from "react";

import { DashboardNav } from "@/components/layout/dashboard-nav";
import { siteConfig } from "@/config/site";

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({
  children,
}: DashboardShellProps) {
  return (
    <div
      className={[
        "min-h-svh",
        "bg-[var(--dashboard-background)]",
        "lg:grid",
        "lg:grid-cols-[260px_minmax(0,1fr)]",
      ].join(" ")}
    >
      <aside
        className={[
          "hidden bg-[var(--dashboard-surface)]",
          "lg:sticky lg:top-0 lg:flex lg:h-svh",
          "lg:flex-col lg:border-r lg:border-border",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-20 shrink-0 items-center",
            "border-b border-border px-7",
          ].join(" ")}
        >
          <Link
            href="/dashboard"
            className={[
              "text-lg font-bold",
              "tracking-[-0.025em]",
              "text-foreground",
            ].join(" ")}
          >
            {siteConfig.name}
          </Link>
        </div>

        <div className="flex-1 px-4 py-6">
          <DashboardNav />
        </div>

        <div className="border-t border-border p-4">
          <div
            className={[
              "rounded-2xl border border-border",
              "bg-muted/60 px-4 py-4",
            ].join(" ")}
          >
            <p className="text-xs font-semibold text-foreground">
              MuscleFitness
            </p>

            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Luyện tập thông minh và tiến bộ bền vững.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header
          className={[
            "sticky top-0 z-40",
            "flex h-20 items-center",
            "border-b border-border",
            "bg-[color:var(--dashboard-surface)]/95",
            "px-4 backdrop-blur",
            "sm:px-6 lg:px-8",
          ].join(" ")}
        >
          <div className="flex w-full items-center justify-between gap-4">
            <div>
              <Link
                href="/dashboard"
                className={[
                  "text-base font-bold",
                  "tracking-[-0.02em]",
                  "text-foreground lg:hidden",
                ].join(" ")}
              >
                {siteConfig.name}
              </Link>

              <p
                className={[
                  "hidden text-base font-semibold",
                  "tracking-[-0.015em]",
                  "text-foreground lg:block",
                ].join(" ")}
              >
                Khu vực thành viên
              </p>
            </div>

            <div
              className={[
                "rounded-full border border-border",
                "bg-white px-3 py-1.5",
                "text-xs font-medium text-muted-foreground",
              ].join(" ")}
            >
              Member
            </div>
          </div>
        </header>

        <div
          className={[
            "overflow-x-auto border-b border-border",
            "bg-[var(--dashboard-surface)]",
            "px-4 py-3 lg:hidden",
          ].join(" ")}
        >
          <DashboardNav orientation="horizontal" />
        </div>

        <main className="p-3 sm:p-5 lg:p-7 xl:p-8">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}