import Link from "next/link"

import { getCurrentAccount } from "@/lib/auth/current-account"

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export default async function UserChip() {
  const account = await getCurrentAccount()

  if (!account) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
      >
        Login
      </Link>
    )
  }

  const name =
    account.profile.full_name ||
    account.profile.username ||
    "Client"

  return (
    <Link
      href="/account"
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2 pr-4 transition hover:border-amber-500/40 hover:bg-white/[0.08]"
    >
      <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-400 to-orange-700 text-sm font-black text-black">
        {account.profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.profile.avatar_url}
            alt={name}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          getInitials(name)
        )}
      </div>

      <div className="hidden min-w-0 sm:block">
        <p className="truncate text-sm font-bold text-white">
          {name}
        </p>

        <p className="truncate text-xs text-zinc-500">
          {account.user.email}
        </p>
      </div>
    </Link>
  )
}