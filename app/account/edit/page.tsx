import {
  ArrowLeft,
  ShieldCheck,
} from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import { ProfileForm } from "@/components/account/profile-form"
import { getCurrentAccount } from "@/lib/auth/current-account"

export const dynamic = "force-dynamic"

export default async function EditAccountPage() {
  const account =
    await getCurrentAccount()

  /*
   * Không redirect dashboard.
   * Chỉ yêu cầu login khi không có session.
   */
  if (!account) {
    redirect(
      "/login?next=/account/edit"
    )
  }

  const {
    profile,
    fitnessProfile,
  } = account

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/account"
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Return to profile"
            >
              <ArrowLeft size={18} />
            </Link>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-500">
                Account centre
              </p>

              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Edit profile
              </h1>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300">
            <ShieldCheck size={15} />
            Secure account update
          </div>
        </header>

        <ProfileForm
          initialData={{
            email:
              account.user.email ?? "",

            fullName:
              profile.full_name ?? "",

            username:
              profile.username ?? "",

            phone:
              profile.phone ?? "",

            dateOfBirth:
              fitnessProfile?.date_of_birth ??
              "",

            gender:
              fitnessProfile?.gender ?? "",

            heightCm:
              fitnessProfile?.height_cm ??
              null,

            weightKg:
              fitnessProfile?.weight_kg ??
              null,

            timezone:
              fitnessProfile?.timezone ??
              "Asia/Singapore",

            goal:
              fitnessProfile?.goal ?? "",
          }}
        />
      </div>
    </main>
  )
}