"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  siteConfig,
  type NavigationItem,
} from "@/config/site"

function isActiveRoute(
  pathname: string,
  href: string,
): boolean {
  if (href === "/") {
    return pathname === "/"
  }

  if (href.includes("#")) {
    return false
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  )
}

/**
 * Có cả named export và default export.
 *
 * Hai cách import dưới đây đều hoạt động:
 *
 * import SiteHeader from "@/components/layout/site-header"
 *
 * import { SiteHeader } from "@/components/layout/site-header"
 */
export function SiteHeader() {
  const pathname = usePathname()

  const marketingNavigation =
    siteConfig.navigation.marketing ?? []

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/85 text-white backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-black text-amber-500">
            MF
          </div>

          <div className="hidden sm:block">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-white">
              Muscle Fitness
            </p>

            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              Discipline built daily
            </p>
          </div>
        </Link>

        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 lg:flex"
        >
          {marketingNavigation.map(
            (item: NavigationItem) => {
              const active = isActiveRoute(
                pathname,
                item.href,
              )

              return (
                <Link
                  key={`${item.title}-${item.href}`}
                  href={item.href}
                  aria-current={
                    active ? "page" : undefined
                  }
                  className={
                    active
                      ? "rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                      : "rounded-lg px-4 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-white"
                  }
                >
                  {item.title}
                </Link>
              )
            },
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/5 hover:text-white sm:inline-flex"
          >
            Log in
          </Link>

          <Link
            href="/register"
            className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-400"
          >
            Start now
          </Link>
        </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="flex gap-2 overflow-x-auto border-t border-white/5 px-4 py-3 lg:hidden"
      >
        {marketingNavigation.map(
          (item: NavigationItem) => {
            const active = isActiveRoute(
              pathname,
              item.href,
            )

            return (
              <Link
                key={`mobile-${item.title}-${item.href}`}
                href={item.href}
                aria-current={
                  active ? "page" : undefined
                }
                className={
                  active
                    ? "shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400"
                    : "shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-white"
                }
              >
                {item.title}
              </Link>
            )
          },
        )}
      </nav>
    </header>
  )
}

export default SiteHeader