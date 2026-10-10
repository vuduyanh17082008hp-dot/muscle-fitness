import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { createRecoveryAdminClient } from "@/lib/supabase/admin"
import { applyErrorMessage, applyWorkoutAdjustment } from "@/lib/recovery/apply-proposal"
import {
  createSupabaseCanonicalCommit,
  createSupabaseMutationStore,
  createSupabaseProposalStore,
  createSupabaseSessionWriter,
} from "@/lib/recovery/supabase-apply"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const applyRequestSchema = z
  .object({
    proposalId: z.string().min(1),
    confirm: z.literal(true),
  })
  .strict()

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: applyErrorMessage("UNAUTHENTICATED") }, { status: 401 })
  }

  let admin
  try {
    admin = createRecoveryAdminClient()
  } catch {
    return NextResponse.json({ error: applyErrorMessage("APPLY_FAILED") }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const parsed = applyRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid adjustment confirmation." }, { status: 400 })
  }

  const result = await applyWorkoutAdjustment({
    actorUserId: user.id,
    proposalId: parsed.data.proposalId,
    sessions: createSupabaseSessionWriter(supabase),
    mutations: createSupabaseMutationStore(supabase),
    proposals: createSupabaseProposalStore(admin),
    commit: createSupabaseCanonicalCommit(admin),
  })

  if (!result.ok) {
    const status =
      result.error === "FORBIDDEN"
        ? 403
        : result.error === "UNAUTHENTICATED"
          ? 401
          : result.error === "PROPOSAL_NOT_FOUND" || result.error === "NOT_FOUND"
            ? 404
            : 409
    return NextResponse.json({ error: result.message, code: result.error }, { status })
  }

  return NextResponse.json({
    success: true,
    alreadyApplied: result.alreadyApplied,
    mutation: result.mutation,
    message: result.alreadyApplied
      ? "This adjustment has already been applied."
      : "Today's plan is updated.",
  })
}
