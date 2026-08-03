import type { ReactNode } from "react"

import Link from "next/link"

import { requireCompletedOnboarding } from "@/lib/auth/guard"

type DashboardLayoutProps = {
  children: ReactNode
}

const navigation = [
  {
    href: "/dashboard",
    label: "Overview",
  },
  {
    href: "/training",
    label: "Training",
  },
  {
    href: "/nutrition",
    label: "Nutrition",
  },
  {
    href: "/progress",
    label: "Progress",
  },
  {
    href: "/coach",
    label: "AI Coach",
  },
]

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const { user, profile } =
    await requireCompletedOnboarding("/dashboard")

  const metadataName =
    typeof user.userMetadata.full_name === "string"
      ? user.userMetadata.full_name
      : null

  const metadataAvatar =
    typeof user.userMetadata.avatar_url === "string"
      ? user.userMetadata.avatar_url
      : null

  const displayName =
    profile?.full_name ||
    metadataName ||
    user.email?.split("@")[0] ||
    "Athlete"

  const avatarUrl =
    profile?.avatar_url ||
    metadataAvatar

  const initial =
    displayName.charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/10 text-sm font-black text-amber-500">
              MF
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-white">
                Muscle Fitness
              </p>

              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                Performance system
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-white">
                {displayName}
              </p>

              <p className="text-xs text-zinc-500">
                {user.email ?? "Authenticated user"}
              </p>
            </div>

            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-10 w-10 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 font-bold text-amber-500">
                {initial}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-white/10 bg-[#090909] p-5 lg:block">
          <nav className="space-y-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-xl border border-transparent px-4 py-3 text-sm font-semibold text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500">
              Current account
            </p>

            <p className="mt-3 text-sm font-semibold text-white">
              {displayName}
            </p>

            <p className="mt-1 break-all text-xs leading-5 text-zinc-500">
              {user.email ?? "No email available"}
            </p>

            <p className="mt-3 text-xs text-zinc-600">
              Role: {profile?.role ?? "client"}
            </p>
          </div>
        </aside>

        <div className="min-w-0">
          <nav className="flex gap-2 overflow-x-auto border-b border-white/10 bg-[#090909] px-4 py-3 lg:hidden">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-400"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {children}
        </div>
      </div>
    </div>
  )
}