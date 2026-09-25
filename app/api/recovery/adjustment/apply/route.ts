import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { applyErrorMessage, applyWorkoutAdjustment } from "@/lib/recovery/apply-proposal"
import { createSupabaseMutationStore, createSupabaseSessionWriter } from "@/lib/recovery/supabase-apply"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const prescriptionSchema = z.object({
  targetSets: z.number().nullable(),
  repMin: z.number().nullable(),
  repMax: z.number().nullable(),
  isSkipped: z.boolean(),
})

const proposalSchema = z.object({
  proposalId: z.string(),
  subjectRef: z.string(),
  workoutRef: z.string(),
  planVersionRef: z.string(),
  recoveryStateRef: z.string(),
  safetyEvaluationRef: z.string(),
  createdAtRef: z.string(),
  expiresAtRef: z.string().optional(),
  status: z.enum(["NO_CHANGE", "MINOR_ADJUSTMENT", "MODERATE_ADJUSTMENT", "REST_RECOMMENDED"]),
  decisionState: z.enum(["RESOLVED", "CONDITIONAL", "INSUFFICIENT_INFORMATION"]),
  evidenceRefs: z.array(z.string()),
  changes: z.array(
    z.object({
      changeId: z.string(),
      exerciseId: z.string().optional(),
      sessionExerciseId: z.string().optional(),
      exerciseName: z.string(),
      action: z.enum(["KEEP", "REDUCE_SETS", "REDUCE_LOAD", "REDUCE_RPE", "REPLACE", "REMOVE", "REST"]),
      before: prescriptionSchema.optional(),
      after: prescriptionSchema.optional(),
      reasonCode: z.string().optional(),
      reasonDisplay: z.string().optional(),
      evidenceRefs: z.array(z.string()),
      constraintRefs: z.array(z.string()).optional(),
    }),
  ),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: applyErrorMessage("UNAUTHENTICATED") }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 })
  }

  const parsed = z.object({ proposal: proposalSchema }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid adjustment proposal." }, { status: 400 })
  }

  const result = await applyWorkoutAdjustment({
    actorUserId: user.id,
    proposal: parsed.data.proposal,
    sessions: createSupabaseSessionWriter(supabase),
    mutations: createSupabaseMutationStore(supabase),
  })

  if (!result.ok) {
    const status =
      result.error === "FORBIDDEN" ? 403 : result.error === "UNAUTHENTICATED" ? 401 : 409
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
