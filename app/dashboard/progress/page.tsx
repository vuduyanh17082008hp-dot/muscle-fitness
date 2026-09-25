import { redirect } from "next/navigation"

import { ProgressExperience } from "@/components/progress/progress-experience"
import { loadProgressPageModel } from "@/lib/progress/load-progress-page"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function ProgressPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/dashboard/progress")}`)
  }

  let model
  try {
    model = await loadProgressPageModel(supabase, user.id)
  } catch {
    return (
      <div className="pj-page">
        <section className="rounded-[22px] border border-[#15243a] bg-[#0a1622] p-8">
          <h1 className="text-2xl font-bold text-[#e9f1fb]">Progress</h1>
          <p className="mt-3 text-[16px] text-[#7f95ad]">Training history couldn&apos;t be loaded.</p>
        </section>
      </div>
    )
  }

  return <ProgressExperience model={model} />
}
