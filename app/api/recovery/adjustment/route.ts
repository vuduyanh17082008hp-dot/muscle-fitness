import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { loadRecoveryContext } from "@/lib/recovery/load-recovery-context"
import { buildTodayAdjustment } from "@/lib/recovery/today-adjustment"
import { hasAppliedAdjustment, persistWorkoutProposal } from "@/lib/recovery/supabase-apply"
import { createRecoveryAdminClient } from "@/lib/supabase/admin"
import { proposalMutatesWorkout } from "@/lib/recovery/proposal"
import { loadTodaySession } from "@/lib/training/load-today-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [recovery, session] = await Promise.all([
      loadRecoveryContext(supabase, user.id),
      loadTodaySession(supabase, user.id),
    ])
    const adjustment = buildTodayAdjustment({
      userId: user.id,
      recovery,
      session,
    })
    // One adjustment per session: once applied, no further (stacking) proposal is issued.
    const alreadyApplied = session ? (await hasAppliedAdjustment(supabase, user.id, session.id)) === true : false
    if (!alreadyApplied && proposalMutatesWorkout(adjustment.proposal)) {
      const stored = await persistWorkoutProposal(createRecoveryAdminClient(), adjustment.proposal)
      if (!stored.ok) {
        return NextResponse.json(
          { error: "Your check-in was saved, but today's plan couldn't be adjusted right now." },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      recoveryState: adjustment.recoveryState,
      safetyScope: adjustment.safetyScope,
      proposal: adjustment.proposal,
      insight: adjustment.insight,
      hasCheckin: recovery.today !== null,
      alreadyApplied,
    })
  } catch (error) {
    console.error("[RECOVERY ADJUSTMENT] generate failed", error)
    return NextResponse.json(
      { error: "Your check-in was saved, but today's plan couldn't be adjusted right now." },
      { status: 500 },
    )
  }
}
