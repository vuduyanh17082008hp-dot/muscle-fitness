import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { proposalMutatesWorkout, type WorkoutAdjustmentProposal } from "@/lib/recovery/proposal"

/**
 * What actually happened to today's workout, from the rows — never from the conversation. PROPOSED != APPLIED:
 *   APPLIED = a workout_mutation_records row exists for today's session (the user tapped Apply and the write committed);
 *   PENDING = a still-valid, mutating proposal was issued for today's session but not applied;
 *   NONE    = nothing was changed or suggested.
 * Hackathon repair F-03: "Why did you change today's workout?" is answered from this, so a failed or never-pressed Apply
 * is never explained as a change.
 */
export type AdjustmentChangeLine = { exercise: string; beforeSets: number | null; afterSets: number | null; skipped: boolean }
export type TodayAdjustmentStatus =
  | { status: "APPLIED"; appliedAt: string; changes: AdjustmentChangeLine[]; reason: string | null }
  | { status: "PENDING"; changes: AdjustmentChangeLine[]; reason: string | null }
  | { status: "NONE"; hasSession: boolean }

function changeLines(proposal: WorkoutAdjustmentProposal): AdjustmentChangeLine[] {
  return proposal.changes
    .filter((change) => change.action !== "KEEP")
    .map((change) => ({
      exercise: change.exerciseName ?? "Exercise",
      beforeSets: change.before?.targetSets ?? null,
      afterSets: change.after?.targetSets ?? null,
      skipped: change.after?.isSkipped === true,
    }))
}

const reasonOf = (proposal: WorkoutAdjustmentProposal) => proposal.changes.find((change) => change.action !== "KEEP")?.reasonDisplay ?? null

/**
 * `supabase` = the user's client (mutation records are readable under RLS); `admin` = the service-role client, used only to
 * read this same user's proposal snapshots (that table has no user policy). Returns null when a read fails: callers must
 * then say they could not check, never guess.
 */
export async function loadTodayAdjustmentStatus(args: {
  supabase: SupabaseClient
  admin: SupabaseClient
  userId: string
  sessionId: string | null
  now: Date
}): Promise<TodayAdjustmentStatus | null> {
  if (!args.sessionId) return { status: "NONE", hasSession: false }
  const mutation = await args.supabase
    .from("workout_mutation_records")
    .select("proposal_id, applied_at")
    .eq("user_id", args.userId)
    .eq("workout_before_ref", args.sessionId)
    .order("applied_at", { ascending: false })
    .limit(1)
  if (mutation.error) return null
  const applied = (mutation.data ?? [])[0] as { proposal_id: string; applied_at: string } | undefined

  const proposalQuery = args.admin.from("recovery_workout_proposals").select("snapshot").eq("user_id", args.userId)
  const proposals = applied
    ? await proposalQuery.eq("proposal_id", applied.proposal_id).limit(1)
    : await proposalQuery.eq("workout_ref", args.sessionId).gt("expires_at", args.now.toISOString()).order("created_at", { ascending: false }).limit(1)
  if (proposals.error) return null
  const proposal = ((proposals.data ?? [])[0] as { snapshot?: WorkoutAdjustmentProposal } | undefined)?.snapshot ?? null

  if (applied) return { status: "APPLIED", appliedAt: applied.applied_at, changes: proposal ? changeLines(proposal) : [], reason: proposal ? reasonOf(proposal) : null }
  if (proposal && proposal.subjectRef === args.userId && proposalMutatesWorkout(proposal)) {
    return { status: "PENDING", changes: changeLines(proposal), reason: reasonOf(proposal) }
  }
  return { status: "NONE", hasSession: true }
}

/** "Why did you change / adjust / cut today's workout?" (EN + folded VI). Presupposes a change; the reply checks it. */
export const WHY_WORKOUT_CHANGED_ASK =
  /\b(?:why|how come|what)\b[^.?!]{0,40}\b(?:chang|adjust|modif|reduc|cut|trim|lower|edit|alter|shorten)\w*\b[^.?!]{0,40}\b(?:workout|session|plan|training|sets?|program(?:me)?)\b|\b(?:tai sao|vi sao|sao)\b[^.?!]{0,40}\b(?:doi|thay doi|dieu chinh|giam|sua|cat)\b[^.?!]{0,40}\b(?:buoi tap|bai tap|ke hoach|lich tap|so set|set)\b/

function describe(changes: AdjustmentChangeLine[], vi: boolean): string {
  const lines = changes.slice(0, 6).map((line) =>
    line.skipped
      ? vi ? `${line.exercise}: bỏ qua` : `${line.exercise}: skipped`
      : `${line.exercise} ${line.beforeSets ?? "?"} → ${line.afterSets ?? "?"} ${vi ? "set" : "sets"}`,
  )
  return lines.join(", ")
}

/** Deterministic, state-faithful answer. Never claims an execution history the rows do not show. */
export function renderAdjustmentStatusReply(status: TodayAdjustmentStatus | null, language: "en" | "vi"): string {
  const vi = language === "vi"
  if (status === null) {
    return vi
      ? "Mình không kiểm tra được kế hoạch hôm nay lúc này, nên không thể nói là nó đã được thay đổi. Trang Phục hồi cho biết trạng thái thật."
      : "I couldn't check today's plan just now, so I can't tell you it was changed. The Recovery page shows its real state."
  }
  if (status.status === "APPLIED") {
    const what = status.changes.length ? describe(status.changes, vi) : null
    return vi
      ? `Buổi tập hôm nay đã được điều chỉnh vì bạn đã bấm Áp dụng đề xuất trên trang Phục hồi — mình không tự thay đổi.${what ? ` Thay đổi: ${what}.` : ""}${status.reason ? ` Lý do: ${status.reason}` : ""}`
      : `Today's workout was adjusted because you applied my suggestion on the Recovery page — I didn't change it on my own.${what ? ` What changed: ${what}.` : ""}${status.reason ? ` Why: ${status.reason}` : ""}`
  }
  if (status.status === "PENDING") {
    const what = describe(status.changes, vi)
    return vi
      ? `Buổi tập hôm nay chưa bị thay đổi. Mình mới đề xuất (${what})${status.reason ? ` vì: ${status.reason}` : ""} — không có gì thay đổi cho đến khi bạn bấm Áp dụng trên trang Phục hồi.`
      : `Today's workout hasn't been changed. I suggested an adjustment (${what})${status.reason ? ` because: ${status.reason}` : ""} — nothing changes until you tap Apply on the Recovery page.`
  }
  if (!status.hasSession) {
    return vi
      ? "Hôm nay không có buổi tập nào được lên lịch, và mình chưa thay đổi gì."
      : "There's no workout scheduled for today, and I haven't changed anything."
  }
  return vi
    ? "Buổi tập hôm nay chưa được thay đổi — nó vẫn như kế hoạch ban đầu, và hôm nay không có điều chỉnh nào được đề xuất hay áp dụng."
    : "Today's workout hasn't been changed — it's still as planned. No adjustment was suggested or applied today."
}
