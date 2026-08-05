"use client"

import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Pencil,
  UserRound,
} from "lucide-react"
import Link from "next/link"

import { useAuth } from "@/app/context/AuthContext"

function readMetadataString(
  value: unknown
): string | null {
  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    return value.trim()
  }

  return null
}

function getInitials(
  name: string
): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase()
    )
    .join("")
}

export function UserMenu() {
  const {
    user,
    loading,
  } = useAuth()

  if (loading) {
    return (
      <div className="h-11 w-40 animate-pulse rounded-xl bg-white/5" />
    )
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-amber-400 to-orange-600 px-5 text-sm font-black text-black"
      >
        Login
      </Link>
    )
  }

  const metadata =
    user.user_metadata as Record<
      string,
      unknown
    >

  const emailUsername =
    user.email?.split("@")[0] ??
    "Client"

  const displayName =
    readMetadataString(
      metadata.full_name
    ) ??
    readMetadataString(
      metadata.name
    ) ??
    emailUsername

  const avatarUrl =
    readMetadataString(
      metadata.avatar_url
    ) ??
    readMetadataString(
      metadata.picture
    )

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-2 pr-3 transition hover:border-amber-500/30 hover:bg-white/[0.075] [&::-webkit-details-marker]:hidden">
        <div className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-400 to-orange-700 text-xs font-black text-black">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={displayName}
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            getInitials(displayName) ||
            "MF"
          )}
        </div>

        <div className="hidden min-w-0 sm:block">
          <p className="max-w-32 truncate text-left text-xs font-black text-white">
            {displayName}
          </p>

          <p className="max-w-32 truncate text-left text-[11px] text-zinc-500">
            {user.email}
          </p>
        </div>

        <ChevronDown
          size={15}
          className="text-zinc-500 transition group-open:rotate-180"
        />
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#111111] p-2 shadow-2xl shadow-black/60">
        <div className="border-b border-white/10 px-3 py-3">
          <p className="truncate text-sm font-black text-white">
            {displayName}
          </p>

          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {user.email}
          </p>
        </div>

        <nav className="py-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <LayoutDashboard
              size={17}
              className="text-zinc-500"
            />

            Dashboard
          </Link>

          <Link
            href="/account"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <UserRound
              size={17}
              className="text-amber-400"
            />

            View profile
          </Link>

          <Link
            href="/account/edit"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <Pencil
              size={17}
              className="text-orange-400"
            />

            Edit profile
          </Link>
        </nav>

        <div className="border-t border-white/10 pt-2">
          <form
            action="/auth/signout"
            method="post"
          >
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10"
            >
              <LogOut size={17} />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </details>
  )
}