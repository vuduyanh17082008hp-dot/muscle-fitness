import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cancelPendingAction, confirmPendingAction, readPendingActionStatus } from "@/lib/dante-core/tools/pending-actions"
import { boundedDependency, EARLY_READ_MS, type TurnBudget } from "@/lib/dante-core/turn-budget"
import type { MealType } from "@/lib/nutrition/food-log/types"

import { loadCoachContext } from "./context"
import { isResetMessage, LOG_REQUEST } from "./conversation"
import { draftIdentity, isExplicitConfirm, isLive, isLogCancel, isLogConfirm, MEAL_TYPE_QUESTION, mealLabelFor, mealTypeIn, pickCompeting, type LogActionStage, type PendingLog } from "./log-action"
import { assembleDraft } from "./draft"
import { findIngredientByText } from "./ingredients"
import { proposeDraftLog } from "./propose-log"
import { resolveConstraints } from "./service"
import type { ActiveMealDraft, CoachContext } from "./types"

/**
 * One chat turn of the meal-log lifecycle (see log-action.ts). Returns null when the turn is not about the pending log —
 * the normal coach flow then answers it and the pending log is carried forward (a topic switch never drops it).
 *
 * Every write goes through the existing pending-action path: proposeDraftLog (validation + dante_tool_actions row) →
 * confirmPendingAction (atomic CAS, runs log_meal_draft exactly once, action UUID = food-log idempotency key). A reply
 * says "logged" only after the server confirmed the write, and every number in it is server-computed or re-read.
 */

export type LogTurnResult = {
  reply: string
  pendingLog: PendingLog | null
  /** Stages this turn passed through, in order (diagnostics; the last one is where the action is now). */
  trace: LogActionStage[]
  foodLogChanged: boolean
  foodLogId?: string
  /** A draft this turn created ("log 200g chicken breast"): the client must show it so the confirm binds to it. */
  draft?: ActiveMealDraft
}

type Input = {
  supabase: SupabaseClient
  userId: string
  message: string
  now: Date
  budget: TurnBudget
  ctx: CoachContext
  /** The meal draft in view (null when none, or when the conversation owns the focus). */
  draft: ActiveMealDraft | null
  pending: PendingLog | null | undefined
  /** A live "apply this change?" modification proposal: a bare "yes" could mean either. */
  competingProposal: boolean
  /** "log option 3": the option picked from the list on screen (already resolved by the caller). */
  candidate?: ActiveMealDraft | null
}

const PROPOSE_WAIT_MS = 8_000
const CONFIRM_WAIT_MS = 12_000
const READBACK_WAIT_MS = 2 * EARLY_READ_MS
const AWAIT_TTL_MS = 10 * 60_000
const VI = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i

/** "Log 200g chicken breast for lunch": an eaten-food entry named by amount + food, with no draft needed. */
const DIRECT_LOG = /^\s*(?:please\s+)?(?:log|add|track|record|ghi)\s+(\d{1,5}(?:[.,]\d+)?)\s*(?:g|grams?|gr)\s+(?:of\s+)?(.+?)(?:\s+(?:for|as|to|into|in|at|vào)\s+.*)?\s*[.!]*$/iu
/** A request to put a meal on a FUTURE day / the meal plan. There is no per-meal plan persistence: never log it as eaten. */
const FUTURE_PLAN = /\b(?:tomorrow|tmr|next (?:week|day)|(?:meal|weekly) plan|plan (?:it|this|that) for|schedule)\b|ngày mai|kế hoạch/iu
const PLAN_VERB = /\b(?:log|add|save|put|schedule|plan|track|record)\b|(?<![\p{L}])(?:ghi|thêm|lưu)(?![\p{L}])/iu

export async function handleLogTurn(input: Input): Promise<LogTurnResult | null> {
  const { supabase, userId, message, now, budget, ctx, competingProposal } = input
  let draft = input.draft
  const pending = isLive(input.pending, now) ? input.pending : null
  const lang: "en" | "vi" = VI.test(message) ? "vi" : (pending?.lang ?? "en")
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en)

  // Planned ≠ eaten. Saving a meal to a future day isn't supported here: say so, save nothing, keep any pending log.
  if (FUTURE_PLAN.test(message) && PLAN_VERB.test(message)) {
    return {
      reply: t(
        "I can't save a meal to a future day or to your meal plan from chat — that isn't supported yet, so nothing was saved. If you've already eaten it, say “log this” and I'll add it to today's food log.",
        "Mình chưa thể lưu món vào ngày khác hay kế hoạch bữa ăn từ chat — tính năng này chưa có, nên chưa lưu gì. Nếu bạn đã ăn rồi, nói “ghi món này” để mình thêm vào nhật ký ăn hôm nay.",
      ),
      pendingLog: pending,
      trace: [],
      foodLogChanged: false,
    }
  }

  // "Log 200g chicken breast for lunch": a one-ingredient draft from the curated catalogue (server-computed macros), run
  // through the same propose → confirm lifecycle as "log this". Unknown food / bad amount → nothing saved.
  let createdDraft: ActiveMealDraft | undefined = input.candidate ?? undefined
  if (createdDraft) draft = createdDraft
  const direct = input.candidate ? null : message.match(DIRECT_LOG)
  if (direct) {
    const food = direct[2].trim()
    const grams = Number(direct[1].replace(",", "."))
    const ingredient = findIngredientByText(food)
    const nothing = (en: string, vi: string): LogTurnResult => ({ reply: t(en, vi), pendingLog: pending, trace: [], foodLogChanged: false })
    if (!ingredient) return nothing(`I don't have verified nutrition data for “${food}”, so I won't guess its numbers — nothing was saved. Use Add Food search to log it.`, `Mình không có dữ liệu dinh dưỡng đã kiểm chứng cho “${food}”, nên sẽ không đoán — chưa lưu gì. Hãy dùng Thêm món để ghi.`)
    if (!Number.isFinite(grams) || grams < 1 || grams > 3000) return nothing(`${direct[1]} g isn't a portion I can log — nothing was saved. Give an amount between 1 and 3000 g.`, `${direct[1]} g không phải khẩu phần hợp lệ — chưa lưu gì. Hãy nhập từ 1 đến 3000 g.`)
    const base = resolveConstraints(ctx)
    // Eaten food isn't held to a meal-building budget: no ceiling, so no "constraint violation" notes on a plain log.
    const constraints = base ? { ...base, calorieCeiling: null } : { calorieCeiling: null, calorieCeilingStrict: false, calorieCeilingSource: "context" as const, proteinTarget: 0, proteinTargetSource: "context" as const, maxPriceSgd: null, maxCookMinutes: null, availableIds: null }
    createdDraft = assembleDraft({ ctx, family: "logged", source: "conversation", name: `${Math.round(grams)} g ${ingredient.name}`, items: [{ ingredientId: ingredient.id, grams: Math.round(grams) }], constraints })
    draft = createdDraft
  }
  const asksLog = Boolean(direct) || Boolean(input.candidate) || LOG_REQUEST.test(message)
  const withDraft = (r: LogTurnResult | null): LogTurnResult | null => (r && createdDraft ? { ...r, draft: createdDraft } : r)
  return withDraft(await lifecycle())

  async function lifecycle(): Promise<LogTurnResult | null> {
  if (!pending && !asksLog) {
    // "confirm" with nothing waiting (after a cancel, or never asked): say so — never re-voice the meal as a fresh turn.
    if (draft && !competingProposal && isExplicitConfirm(message)) {
      return { reply: t("Nothing is waiting to be logged right now, so I haven't saved anything. Say “log this” and I'll ask which meal it was.", "Hiện không có gì đang chờ ghi nên mình chưa lưu gì. Nói “ghi món này” và mình sẽ hỏi đó là bữa nào."), pendingLog: null, trace: [], foodLogChanged: false }
    }
    return null
  }

  const label = (type: MealType) => mealLabelFor(type, lang)
  const named = mealTypeIn(message)
  const short = message.trim().split(/\s+/).length <= 8
  const trace: LogActionStage[] = []
  const mentionsLog = /\blog\b|(?<![\p{L}])ghi(?![\p{L}])/iu.test(message)
  const r = Math.round

  const result = (reply: string, pendingLog: PendingLog | null, extra: Partial<LogTurnResult> = {}): LogTurnResult => ({ reply, pendingLog, trace, foodLogChanged: false, ...extra })
  const base = (d: ActiveMealDraft, mealType: MealType | null) => ({ draftId: d.id, mealName: d.name, fingerprint: draftIdentity(d), mealType, lang })
  const awaiting = (d: ActiveMealDraft, missing: NonNullable<PendingLog["missing"]>, mealType: MealType | null, reply: string) => {
    trace.push("AWAITING_REQUIRED_INPUT")
    return result(reply, { stage: "AWAITING_REQUIRED_INPUT", missing, ...base(d, mealType), expiresAt: new Date(now.getTime() + AWAIT_TTL_MS).toISOString() })
  }
  const askMealType = (d: ActiveMealDraft) => awaiting(d, "mealType", null, MEAL_TYPE_QUESTION[lang](d.name))
  /** A terminal (failed/expired) action can't be confirmed again: keep the meal + slot, drop the action, and a "yes" makes a NEW one. */
  const retryOf = (p: PendingLog): PendingLog => {
    trace.push("AWAITING_REQUIRED_INPUT")
    return { stage: "AWAITING_REQUIRED_INPUT", missing: "retry", draftId: p.draftId, mealName: p.mealName, fingerprint: p.fingerprint, mealType: p.mealType, lang, ambiguity: null, expiresAt: new Date(now.getTime() + AWAIT_TTL_MS).toISOString() }
  }
  // "lunch, confirm" names the slot AND confirms; the slot word alone is not a confirmation.
  const withoutSlot = message.replace(/(?:\b(?:for |as )?(?:breakfast|lunch|dinner|supper|snack)\b|bữa (?:sáng|trưa|tối|phụ))/giu, " ").trim()
  const confirmsToo = withoutSlot !== "" && isLogConfirm(withoutSlot)

  /** An unconfirmed action the user moved away from: cancel it so it can never be confirmed later (best effort — it also expires). */
  const supersede = async (old: PendingLog | null) => {
    if (old?.actionId && old.stage === "READY_FOR_CONFIRMATION") await boundedDependency(budget, "log_cancel", () => cancelPendingAction(supabase, userId, old.actionId!))
  }

  const verify = async (foodLogId: string, fallback: PendingLog): Promise<LogTurnResult> => {
    trace.push("EXECUTED")
    const read = await boundedDependency(budget, "log_readback", () => loadCoachContext(supabase, userId, now), READBACK_WAIT_MS)
    const after = read.status === "OK" && read.value.ok ? read.value.ctx : null
    const meal = after?.todayMeals?.find((summary) => summary.rows.some((row) => row.id === foodLogId))
    const row = meal?.rows.find((entry) => entry.id === foodLogId)
    const done = { ...fallback, missing: null, ambiguity: null, foodLogId, expiresAt: new Date(now.getTime() + AWAIT_TTL_MS).toISOString() }
    if (!after || !meal || !row) {
      return result(
        t(`The server confirmed “${fallback.mealName}” was saved to today's food log, but I couldn't re-read today's totals just now — refresh to see them.`, `Máy chủ đã xác nhận lưu “${fallback.mealName}” vào nhật ký ăn hôm nay, nhưng mình chưa đọc lại được tổng hôm nay — hãy tải lại để xem.`),
        { ...done, stage: "EXECUTED" },
        { foodLogChanged: true, foodLogId },
      )
    }
    trace.push("VERIFIED")
    const s = after.snapshot
    const kcalLeft = r(s.caloriesRemaining)
    const proteinLeft = r(s.proteinRemaining)
    const left = t(
      kcalLeft >= 0 ? `You now have ${kcalLeft} kcal and ${Math.max(0, proteinLeft)} g protein left today.` : `You're now ${-kcalLeft} kcal over today's target${proteinLeft > 0 ? `, with ${proteinLeft} g protein still to go` : ""}.`,
      kcalLeft >= 0 ? `Hôm nay bạn còn ${kcalLeft} kcal và ${Math.max(0, proteinLeft)} g protein.` : `Bạn đã vượt mục tiêu hôm nay ${-kcalLeft} kcal${proteinLeft > 0 ? `, protein còn thiếu ${proteinLeft} g` : ""}.`,
    )
    const where = label(meal.meal)
    return result(
      t(
        `Logged “${row.food}” as ${where} in today's food log — ${r(row.calories)} kcal and ${r(row.protein)} g protein, computed by the server from the ingredients. ${left}`,
        `Đã ghi “${row.food}” vào ${where} trong nhật ký ăn hôm nay — ${r(row.calories)} kcal và ${r(row.protein)} g protein, do máy chủ tính từ nguyên liệu. ${left}`,
      ),
      { ...done, stage: "VERIFIED", mealType: meal.meal },
      { foodLogChanged: true, foodLogId },
    )
  }

  const confirm = async (p: PendingLog): Promise<LogTurnResult> => {
    trace.push("CONFIRMED")
    const outcome = await boundedDependency(budget, "log_confirm", () => confirmPendingAction(supabase, { supabase, userId, now, timezone: ctx.snapshot.timezone, cache: new Map() }, p.actionId!), CONFIRM_WAIT_MS)
    if (outcome.status !== "OK") {
      trace.push("UNKNOWN_OUTCOME")
      return result(
        t(`I couldn't confirm whether “${p.mealName}” was saved — the server didn't answer in time. I won't log it twice: say “confirm” again in a moment and I'll check what happened.`, `Mình chưa xác nhận được “${p.mealName}” đã lưu hay chưa — máy chủ không phản hồi kịp. Mình sẽ không ghi trùng: lát nữa hãy nói “xác nhận” để mình kiểm tra.`),
        { ...p, stage: "UNKNOWN_OUTCOME", ambiguity: null },
      )
    }
    const value = outcome.value
    if (value.ok) {
      trace.push("SERVER_VALIDATED")
      const foodLogId = (value.result as { foodLogId?: string } | null)?.foodLogId
      return foodLogId ? verify(foodLogId, p) : result(t("The server accepted the log, but didn't return the entry. Refresh to check today's food log.", "Máy chủ đã nhận, nhưng không trả về mục đã ghi. Hãy tải lại nhật ký ăn để kiểm tra."), null, { foodLogChanged: true })
    }
    if (value.status === "already_handled") return resolveHandled(p)
    if (value.status === "expired") {
      trace.push("EXPIRED")
      return result(t(`That confirmation expired, so nothing was logged. Say “yes” and I'll prepare “${p.mealName}” again.`, `Xác nhận đã hết hạn nên chưa ghi gì. Nói “có” để mình chuẩn bị lại “${p.mealName}”.`), retryOf(p))
    }
    if (value.status === "not_found") {
      trace.push("FAILED")
      return result(t("I can't find that pending log any more, so nothing was logged. Ask me to log the meal again.", "Mình không còn thấy yêu cầu ghi đó nên chưa ghi gì. Hãy bảo mình ghi lại món này."), null)
    }
    trace.push("FAILED")
    // A confirmation can never override an allergy/exclusion or a changed target: those end the action.
    if (value.code === "ACTION_FORBIDDEN" || value.code === "ACTION_STALE") return result(t(`${value.error} Nothing was logged.`, `${value.error} Chưa ghi gì.`), null)
    return result(t(`Nothing was logged — the save failed (${value.error}). Say “yes” to try again.`, `Chưa ghi gì — lưu thất bại (${value.error}). Nói “có” để thử lại.`), retryOf(p))
  }

  /** The action is no longer pending: find out what actually happened before saying anything about it. */
  const resolveHandled = async (p: PendingLog): Promise<LogTurnResult> => {
    const read = await boundedDependency(budget, "log_status", () => readPendingActionStatus(supabase, userId, p.actionId!))
    const row = read.status === "OK" ? read.value : null
    if (row?.status === "executed") {
      const foodLogId = (row.result as { foodLogId?: string } | null)?.foodLogId
      if (foodLogId && p.stage === "UNKNOWN_OUTCOME") return verify(foodLogId, p)
      return result(t(`“${p.mealName}” is already logged — nothing new was saved.`, `“${p.mealName}” đã được ghi rồi — không lưu thêm.`), { ...p, stage: "VERIFIED", ambiguity: null, ...(foodLogId ? { foodLogId } : {}) })
    }
    if (row?.status === "cancelled") {
      trace.push("REJECTED")
      return result(t("That log was cancelled, so nothing was logged.", "Yêu cầu ghi đã bị hủy nên chưa ghi gì."), null)
    }
    if (row?.status === "confirmed") {
      trace.push("UNKNOWN_OUTCOME")
      return result(t("That log is still being saved. Say “confirm” again in a moment and I'll check.", "Yêu cầu đang được lưu. Lát nữa nói “xác nhận” để mình kiểm tra."), { ...p, stage: "UNKNOWN_OUTCOME" })
    }
    trace.push("FAILED")
    return result(t(`Nothing was logged for “${p.mealName}”. Say “yes” to try again.`, `Chưa ghi “${p.mealName}”. Nói “có” để thử lại.`), retryOf(p))
  }

  const propose = async (d: ActiveMealDraft, mealType: MealType, options: { acknowledgeSimilar?: boolean; thenConfirm?: boolean } = {}): Promise<LogTurnResult> => {
    trace.push("PROPOSED")
    const res = await boundedDependency(budget, "log_propose", () => proposeDraftLog(supabase, userId, { name: d.name, ingredients: d.ingredients, sessionContextSnapshot: d.sessionContextSnapshot, acknowledgedContextVersion: d.acknowledgedContextVersion }, mealType, { acknowledgeSimilar: options.acknowledgeSimilar, ctx }), PROPOSE_WAIT_MS)
    if (res.status !== "OK") return awaiting(d, "retry", mealType, t(`I couldn't prepare that log just now, so nothing was saved. Say “yes” to try again.`, `Mình chưa chuẩn bị được yêu cầu ghi nên chưa lưu gì. Nói “có” để thử lại.`))
    const proposal = res.value
    if (!proposal.ok) {
      switch (proposal.code) {
        case "SIMILAR_MEAL_LOGGED_TODAY":
          return awaiting(d, "similarAck", mealType, t(`You logged a similar meal earlier today. Log “${d.name}” as ${label(mealType)} again? (yes / no)`, `Hôm nay bạn đã ghi một món tương tự. Ghi thêm “${d.name}” vào ${label(mealType)} nữa không? (có / không)`))
        case "BLOCKED_INGREDIENT":
          trace.push("REJECTED")
          return result(t(`${proposal.message} I won't log it — a confirmation can't override an allergy or exclusion.`, `${proposal.message} Mình sẽ không ghi — xác nhận không thể bỏ qua dị ứng hay món bị loại trừ.`), null)
        case "STALE_CONTEXT":
          trace.push("REJECTED")
          return result(t(`${proposal.message} Refresh the meal, then ask me to log it.`, `${proposal.message} Hãy làm mới món, rồi bảo mình ghi lại.`), null)
        case "CONTEXT_UNAVAILABLE":
          return awaiting(d, "retry", mealType, t(`${proposal.message} Nothing was saved.`, `${proposal.message} Chưa lưu gì.`))
      }
    }
    trace.push("READY_FOR_CONFIRMATION")
    const ready: PendingLog = { stage: "READY_FOR_CONFIRMATION", missing: null, ambiguity: null, ...base(d, mealType), actionId: proposal.pending.actionId, expiresAt: proposal.pending.expiresAt }
    if (options.thenConfirm) return confirm(ready)
    const n = proposal.nutrition
    return result(
      t(
        `Ready to log “${d.name}” as ${label(mealType)} in today's food log: about ${r(n.calories)} kcal and ${r(n.protein)} g protein (server-computed from the ingredients). Nothing is saved until you confirm — say “confirm” to log it, or “cancel”.`,
        `Sẵn sàng ghi “${d.name}” vào ${label(mealType)} trong nhật ký ăn hôm nay: khoảng ${r(n.calories)} kcal và ${r(n.protein)} g protein (máy chủ tính từ nguyên liệu). Chưa lưu gì cho đến khi bạn xác nhận — nói “xác nhận” để ghi, hoặc “hủy”.`,
      ),
      ready,
    )
  }

  // 1. An explicit log request ("log this", "log it for lunch", "ghi món này").
  if (asksLog) {
    // "log it" answering our own "confirm?" is the confirmation, as long as nothing about the meal changed.
    if (pending?.stage === "READY_FOR_CONFIRMATION" && (!named || named === pending.mealType) && (!draft || (draft.id === pending.draftId && draftIdentity(draft) === pending.fingerprint))) return confirm(pending)
    if (pending?.stage === "UNKNOWN_OUTCOME") return resolveHandled(pending)
    if (!draft) return null // nothing to log: the existing "no active meal draft" reply answers
    await supersede(pending)
    return named ? propose(draft, named) : askMealType(draft)
  }
  if (!pending) return null

  // 2. Cancel / reset. A logged entry is not undone from here — that's a delete, with its own confirmation.
  if (pending.stage !== "VERIFIED" && pending.stage !== "EXECUTED" && (isLogCancel(message) || isResetMessage(message))) {
    if (pending.actionId) {
      const cancelled = await boundedDependency(budget, "log_cancel", () => cancelPendingAction(supabase, userId, pending.actionId!))
      // Not cancellable = no longer pending: it may have run. Say what actually happened.
      if (cancelled.status === "OK" && !cancelled.value.ok && cancelled.value.status === "already_handled") return resolveHandled(pending)
    }
    trace.push("REJECTED")
    if (isResetMessage(message) && !isLogCancel(message)) return null // the reset itself is answered by the normal flow; the pending log ends with it
    return result(t(`Cancelled — nothing was logged. “${pending.mealName}” is still here if you want to change it.`, `Đã hủy — chưa ghi gì. “${pending.mealName}” vẫn còn đây nếu bạn muốn chỉnh.`), null)
  }

  // 3. A meal-type answer ("lunch", "for dinner", "bữa trưa").
  if (named && short && (pending.stage === "AWAITING_REQUIRED_INPUT" || pending.stage === "READY_FOR_CONFIRMATION")) {
    if (!draft || draft.id !== pending.draftId) {
      await supersede(pending)
      trace.push("EXPIRED")
      return result(t(`“${pending.mealName}” isn't the meal on screen any more, so I won't log it. Open the meal you want and say “log this”.`, `“${pending.mealName}” không còn là món đang hiển thị nên mình sẽ không ghi. Mở món bạn muốn và nói “ghi món này”.`), null)
    }
    if (pending.stage === "READY_FOR_CONFIRMATION" && named === pending.mealType && confirmsToo) return confirm(pending)
    await supersede(pending)
    return propose(draft, named, { acknowledgeSimilar: pending.missing === "similarAck", thenConfirm: confirmsToo })
  }

  // 4. "confirm" / "yes" / "the earlier one".
  const pick = pending.ambiguity === "other_draft" ? pickCompeting(message) : null
  if (!isLogConfirm(message) && !pick) return null

  switch (pending.stage) {
    case "VERIFIED":
    case "EXECUTED":
      return result(t(`“${pending.mealName}” is already logged${pending.mealType ? ` as ${label(pending.mealType)}` : ""} — nothing new was saved.`, `“${pending.mealName}” đã được ghi rồi${pending.mealType ? ` vào ${label(pending.mealType)}` : ""} — không lưu thêm.`), pending)
    case "UNKNOWN_OUTCOME":
      return resolveHandled(pending)
    case "AWAITING_REQUIRED_INPUT": {
      const d = draft && draft.id === pending.draftId ? draft : null
      if (!d) {
        trace.push("EXPIRED")
        return result(t(`“${pending.mealName}” isn't the meal on screen any more, so I won't log it. Open the meal you want and say “log this”.`, `“${pending.mealName}” không còn là món đang hiển thị nên mình sẽ không ghi. Mở món bạn muốn và nói “ghi món này”.`), null)
      }
      // A required field is still missing: ask for it, never restart the recommendation.
      if (pending.missing === "mealType" || !pending.mealType) return askMealType(d)
      // "Log again?" / "try again?" were asked about this exact meal and slot: the yes is the confirmation.
      return propose(d, pending.mealType, { acknowledgeSimilar: pending.missing === "similarAck", thenConfirm: true })
    }
    case "READY_FOR_CONFIRMATION": {
      if (pending.ambiguity === "other_draft" && draft && draft.id !== pending.draftId) {
        if (pick === "earlier") return confirm(pending)
        if (pick === "current") {
          await supersede(pending)
          return pending.mealType ? propose(draft, pending.mealType) : askMealType(draft)
        }
      }
      if (draft && draft.id !== pending.draftId) {
        return result(
          t(`Two meals are in play: “${pending.mealName}” is waiting to be logged as ${pending.mealType ? label(pending.mealType) : "a meal"}, and “${draft.name}” is on screen now. Log the earlier one, or this one?`, `Có hai món: “${pending.mealName}” đang chờ ghi vào ${pending.mealType ? label(pending.mealType) : "một bữa"}, và “${draft.name}” đang hiển thị. Ghi món lúc nãy, hay món này?`),
          { ...pending, ambiguity: "other_draft" },
        )
      }
      if (competingProposal && !mentionsLog) {
        return result(
          t(`Two things are waiting for you: logging “${pending.mealName}” as ${pending.mealType ? label(pending.mealType) : "a meal"}, and the change I proposed. Say “log it” to log the meal, or “apply it” for the change.`, `Có hai việc đang chờ: ghi “${pending.mealName}” vào ${pending.mealType ? label(pending.mealType) : "một bữa"}, và thay đổi mình vừa đề xuất. Nói “ghi” để ghi món, hoặc “apply it” để áp dụng thay đổi.`),
          { ...pending, ambiguity: "modification" },
        )
      }
      if (draft && draftIdentity(draft) !== pending.fingerprint) {
        // The meal was edited after the proposal: the old action would log the old portions. Re-propose and ask again.
        await supersede(pending)
        if (!pending.mealType) return askMealType(draft)
        const again = await propose(draft, pending.mealType)
        return { ...again, reply: t(`The meal changed since I prepared that log, so I didn't save the old version. ${again.reply}`, `Món đã thay đổi sau khi mình chuẩn bị, nên mình không lưu bản cũ. ${again.reply}`) }
      }
      return confirm(pending)
    }
  }
}
}
