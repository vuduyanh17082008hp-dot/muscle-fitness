import { redirect } from "next/navigation"

import OnboardingWizard from "@/features/onboarding/onboarding-wizard"

import type { OnboardingDraftData } from "@/features/onboarding/schema"

import { createClient } from "@/lib/supabase/server"

export const dynamic =
  "force-dynamic"

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

export default async function OnboardingPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect(
      "/login?next=/onboarding",
    )
  }

  const [
    profileResponse,
    draftResponse,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "user_id, onboarding_completed",
      )
      .eq("user_id", user.id)
      .maybeSingle(),

    supabase
      .from("onboarding_drafts")
      .select(
        "user_id, current_step, data",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  if (profileResponse.error) {
    console.error(
      "Unable to load profile:",
      profileResponse.error,
    )
  }

  if (
    profileResponse.data
      ?.onboarding_completed
  ) {
    redirect("/dashboard")
  }

  if (draftResponse.error) {
    console.error(
      "Unable to load onboarding draft:",
      draftResponse.error,
    )
  }

  const rawDraftData =
    draftResponse.data?.data

  const initialData:
    | OnboardingDraftData
    | undefined = isRecord(
    rawDraftData,
  )
    ? (rawDraftData as unknown as OnboardingDraftData)
    : undefined

  const initialStep = Math.min(
    Math.max(
      draftResponse.data
        ?.current_step ?? 0,
      0,
    ),
    5,
  )

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <OnboardingWizard
          userId={user.id}
          initialStep={initialStep}
          initialData={initialData}
        />
      </div>
    </main>
  )
}