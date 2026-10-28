import Link from "next/link"
import { redirect } from "next/navigation"

import { Utensils } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { loadFoodLogForDate, resolveLocalToday } from "@/lib/nutrition/food-log/load-food-log-context"

import { NUTRITION_TABS } from "./tabs"
import { NutritionCoachPanel } from "@/components/nutrition/coach/nutrition-coach-panel"
import { NutritionTracker } from "@/components/nutrition/nutrition-tracker"
import { NutritionSectionReveal } from "@/components/nutrition/nutrition-motion"
import { SectionTabs } from "@/components/dashboard/section-tabs"
import { PrimaryButton } from "@/components/ui/button"

export const dynamic = "force-dynamic"

/**
 * Nutrition Today: what you've eaten against today's targets, and the coach.
 * Plan settings, energy model, macro targets, budget and the gram-based meal
 * plan live at /dashboard/nutrition/plan.
 */
export default async function NutritionTodayPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/dashboard/nutrition")
  }

  const { plan, missingRequiredFields } = await loadNutritionContext(supabase, user.id)

  /* =======================================================
     MISSING PROFILE DATA — DO NOT FABRICATE A PLAN
  ======================================================= */

  if (!plan) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-[24px] border border-mf-glass-border bg-gradient-to-br from-mf-glass-elevated via-mf-glass-surface to-mf-glass-bg p-8">
          <span className="inline-grid size-14 place-items-center rounded-2xl border border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand">
            <Utensils className="size-6" />
          </span>

          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-mf-glass-brand">
            Nutrition Intelligence
          </p>

          <h1 className="mt-2 text-3xl font-black tracking-tight text-mf-glass-text sm:text-4xl">
            Your Nutrition Plan
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-mf-glass-text-muted">
            We could not build a nutrition plan yet because some
            required profile information is missing:{" "}
            <span className="text-mf-glass-text-secondary">
              {missingRequiredFields.join(", ")}
            </span>
            .
          </p>

          <PrimaryButton asChild className="mt-6 w-fit">
            <Link href="/onboarding?edit=1">Complete your profile</Link>
          </PrimaryButton>
        </header>
      </div>
    )
  }

  const { target } = plan
  const localDate = await resolveLocalToday(supabase, user.id)
  const foodLog = await loadFoodLogForDate(supabase, user.id, localDate)

  return (
    <div className="mx-auto max-w-3xl space-y-8 overflow-x-clip pb-16">
      <SectionTabs tabs={NUTRITION_TABS} />

      <div id="today" className="scroll-mt-24">
        <NutritionSectionReveal>
          <NutritionTracker
            userId={user.id}
            initialEntries={foodLog.entries}
            initialDate={localDate}
            initialUnavailable={foodLog.unavailable === true}
            target={{
              calories: target.calories,
              protein: target.protein,
              carbs: target.carbs,
              fat: target.fat,
            }}
          />
        </NutritionSectionReveal>
      </div>

      <NutritionSectionReveal>
        <NutritionCoachPanel />
      </NutritionSectionReveal>
    </div>
  )
}
