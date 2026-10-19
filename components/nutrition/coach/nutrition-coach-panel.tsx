"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"

import { PrimaryButton, SecondaryButton } from "@/components/ui/button"
import type { DraftOp, SwapWarning } from "@/lib/nutrition/coach/draft"
import { COACH_INGREDIENTS } from "@/lib/nutrition/coach/ingredients"
import type { NutritionIntent, NutritionTopic, PreferenceSignal } from "@/lib/nutrition/coach/conversation"
import type { FollowUpState, StructuredBlock } from "@/lib/nutrition/coach/followup"
import { QUICK_ACTIONS } from "@/lib/nutrition/coach/quick-actions"
import type { ActiveMealDraft, ContextSnapshot, CravingKey, MealDraftHistoryItem } from "@/lib/nutrition/coach/types"
import { MEAL_TYPE_LABEL, MEAL_TYPES, type MealType } from "@/lib/nutrition/food-log/types"
import { COACH_CONTEXT_CHANGED_EVENT, COACH_TURN_STARTED_EVENT } from "@/lib/coach-context-event"

import { MealDraftCard } from "./meal-draft-card"
import {
  NutritionActiveDraftMini,
  NutritionComposer,
  NutritionContextStrip,
  NutritionCoachHeader,
  NutritionMessage,
  NutritionQuickActions,
  NutritionTopicChip,
  NutritionTypingState,
  NutritionWelcome,
} from "./coach-chat-ui"

type Proposal = { draft: ActiveMealDraft; warnings: SwapWarning[]; from: string; to: string }
type ChatMessage = { role: "user" | "coach"; text: string; blocks?: StructuredBlock[] }
type Pending = { actionId: string; summary: string }

/** What the server echoes back each turn. The one-turn draft handoff is recomputed server-side every reply. */
type ConversationState = {
  lastIntent?: NutritionIntent
  currentTopic: NutritionTopic | null
  pendingMealBuild: { topic: string; approach?: string } | null
  handoff: { offer: "cheaper" | "tastier" | "more_protein" | "lower_calories" | "more_filling" | "faster" | null } | null
  signals: PreferenceSignal[]
  deactivateDraft?: boolean
  /** Ephemeral follow-up context the server echoes back (TTL-bound; the server validates and recomputes everything). */
  followUp?: FollowUpState | null
}

type DraftHistoryEntry = { item: MealDraftHistoryItem; draft: ActiveMealDraft }

const HISTORY_LIMIT = 5

const CRAVINGS: Array<{ key: CravingKey; label: string }> = [
  { key: "chocolate_cereal", label: "Chocolate cereal" },
  { key: "protein_ice_cream", label: "Protein ice cream" },
]

const GROUPS: Array<{ role: string; label: string }> = [
  { role: "protein", label: "Protein" },
  { role: "carb", label: "Carbs" },
  { role: "volume", label: "Veg & volume" },
]

const card = "rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-6"
const eyebrow = "text-[11px] font-black uppercase tracking-[0.2em] text-mf-glass-brand"

function defaultMealType(): MealType {
  const hour = new Date().getHours()
  if (hour < 10) return "breakfast"
  if (hour < 15) return "lunch"
  if (hour < 21) return "dinner"
  return "snack"
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; json: T }> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = (await response.json().catch(() => ({}))) as T
  return { status: response.status, json }
}

type CoachResponse = {
  ok: boolean
  kind?: string
  message?: string
  error?: string
  draft?: ActiveMealDraft
  closest?: ActiveMealDraft
  drafts?: ActiveMealDraft[]
  context?: ContextSnapshot
  blockedIngredientIds?: string[]
  outcome?: { applied: boolean; message: string; warnings: SwapWarning[]; proposal: ActiveMealDraft | null }
}

export function NutritionCoachPanel() {
  const router = useRouter()
  const [context, setContext] = useState<ContextSnapshot | null>(null)
  const [draft, setDraft] = useState<ActiveMealDraft | null>(null)
  const [suggestions, setSuggestions] = useState<ActiveMealDraft[]>([])
  const [blockedIds, setBlockedIds] = useState<string[]>([])
  // True from the moment a coach turn starts until the server re-derives the cards: a turn may carry a new restriction,
  // so cards fetched before it are never shown as eligible in the meantime.
  const [suggestionsStale, setSuggestionsStale] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mealType, setMealType] = useState<MealType>("dinner")
  const [pending, setPending] = useState<Pending | null>(null)
  const [similarWarning, setSimilarWarning] = useState<string | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [conv, setConv] = useState<ConversationState>({ currentTopic: null, pendingMealBuild: null, handoff: null, signals: [] })
  const [draftHistory, setDraftHistory] = useState<DraftHistoryEntry[]>([])
  const [draftInBackground, setDraftInBackground] = useState(false)
  const [typing, setTyping] = useState<string | null>(null)
  const [hints, setHints] = useState<string[]>([])
  const draftBeforeLog = useRef<ActiveMealDraft | null>(null)
  const chatEnd = useRef<HTMLLIElement | null>(null)

  /**
   * Suggestion cards are re-derived on the server from the CURRENT safety context (stored + chat-disclosed allergies), so they
   * refresh after any coach turn that may have changed it. A failed refresh clears the cards: a card fetched before a new
   * restriction must never stay on screen looking eligible.
   */
  const refreshSuggestions = useCallback(async () => {
    const [ctx, suggest] = await Promise.all([
      postJson<CoachResponse>("/api/nutrition/coach", { action: "context" }).catch(() => null),
      postJson<CoachResponse>("/api/nutrition/coach", { action: "suggest" }).catch(() => null),
    ])
    if (ctx?.json.context) setContext(ctx.json.context)
    setBlockedIds(ctx?.json.blockedIngredientIds ?? [])
    setSuggestions(suggest?.json.drafts ?? [])
    setSuggestionsStale(false)
  }, [])

  useEffect(() => {
    // Meal type follows the viewer's clock, so it is set after hydration (as before), once the first load settles.
    void (async () => {
      await refreshSuggestions()
      setMealType(defaultMealType())
    })()
    // After a coach turn the server-rendered plan / budget sections re-render too (they read the same safety context).
    const onCoachTurn = () => {
      router.refresh()
      void refreshSuggestions()
    }
    const onTurnStarted = () => setSuggestionsStale(true)
    window.addEventListener(COACH_CONTEXT_CHANGED_EVENT, onCoachTurn)
    window.addEventListener(COACH_TURN_STARTED_EVENT, onTurnStarted)
    return () => {
      window.removeEventListener(COACH_CONTEXT_CHANGED_EVENT, onCoachTurn)
      window.removeEventListener(COACH_TURN_STARTED_EVENT, onTurnStarted)
    }
  }, [refreshSuggestions, router])

  useEffect(() => {
    chatEnd.current?.scrollIntoView?.({ block: "nearest" })
  }, [chat])

  /** Moves a draft out of the active slot into the short session history (recoverable, never deleted from the food log). */
  const stash = useCallback((old: ActiveMealDraft, status: MealDraftHistoryItem["status"]) => {
    const item: MealDraftHistoryItem = { draftId: old.id, name: old.name, status, createdAt: old.sessionContextSnapshot.capturedAt, source: old.source ?? "conversation" }
    setDraftHistory((previous) => [{ item, draft: old }, ...previous.filter((entry) => entry.item.draftId !== old.id)].slice(0, HISTORY_LIMIT))
  }, [])

  const adopt = useCallback((next: ActiveMealDraft) => {
    if (draft && draft.id !== next.id && draft.status !== "LOGGED") stash(draft, "superseded")
    setDraft(next)
    setDraftInBackground(false)
    setProposal(null)
    setSkipped([])
    setPending(null)
    setSimilarWarning(null)
  }, [draft, stash])

  const run = useCallback(
    async (body: Record<string, unknown>, onDraft?: (draft: ActiveMealDraft) => void) => {
      setBusy(true)
      setNotice(null)
      try {
        const { status, json } = await postJson<CoachResponse>("/api/nutrition/coach", body)
        if (status === 401) return setNotice("Please sign in again to use the Nutrition Coach.")
        if (!json.ok && !json.draft && !json.closest) return setNotice(json.message ?? json.error ?? "I couldn't do that right now.")
        const next = json.draft ?? json.closest
        if (json.message) setNotice(json.message)
        if (next) (onDraft ?? adopt)(next)
      } catch {
        setNotice("I couldn't reach the Nutrition Coach. Please try again.")
      } finally {
        setBusy(false)
      }
    },
    [adopt],
  )

  const edit = useCallback(
    async (op: DraftOp) => {
      if (!draft) return
      setBusy(true)
      setNotice(null)
      try {
        const { json } = await postJson<CoachResponse>("/api/nutrition/coach", { action: "edit", draft, op })
        if (!json.draft || !json.outcome) return setNotice(json.error ?? "I couldn't apply that change.")
        setNotice(json.outcome.message)
        if (json.outcome.proposal && op.type === "swap") {
          setProposal({ draft: json.outcome.proposal, warnings: json.outcome.warnings, from: op.from, to: op.to })
        } else {
          setProposal(null)
        }
        setDraft(json.draft)
        setPending(null)
        setSimilarWarning(null)
      } catch {
        setNotice("I couldn't reach the Nutrition Coach. Please try again.")
      } finally {
        setBusy(false)
      }
    },
    [draft],
  )

  const handleUseAvailable = () => {
    if (selected.length === 0) return setNotice("Pick the foods you have in Choose My Food first, then try again.")
    void edit({ type: "use_available", ingredientIds: selected })
  }

  /* ---------- logging: propose -> explicit confirm ---------- */

  const proposeLog = async (acknowledgeSimilar = false) => {
    if (!draft) return
    setBusy(true)
    setNotice(null)
    try {
      const { json } = await postJson<{ ok: boolean; code?: string; message?: string; error?: string; pendingConfirmation?: { actionId: string; summary: string } }>("/api/nutrition/coach/log", { draft, mealType, acknowledgeSimilar })
      if (json.code === "STALE_CONTEXT") {
        setDraft({ ...draft, status: "STALE_CONTEXT" })
        return setNotice(json.message ?? "Your nutrition target has changed since this meal was created.")
      }
      if (json.code === "SIMILAR_MEAL_LOGGED_TODAY") return setSimilarWarning(json.message ?? "You logged a similar meal earlier today. Log again?")
      if (!json.ok || !json.pendingConfirmation) return setNotice(json.error ?? "I couldn't prepare that log.")
      setSimilarWarning(null)
      draftBeforeLog.current = draft
      setPending({ actionId: json.pendingConfirmation.actionId, summary: json.pendingConfirmation.summary })
      setDraft({ ...draft, status: "CONFIRMED" })
    } catch {
      setNotice("I couldn't reach the Nutrition Coach. Nothing was logged — please try again.")
    } finally {
      setBusy(false)
    }
  }

  const resolveLog = async (intent: "confirm" | "cancel") => {
    if (!pending || !draft) return
    setBusy(true)
    try {
      const { json } = await postJson<{ ok: boolean; error?: string; code?: string }>("/api/dante/tools/confirm", { actionId: pending.actionId, intent })
      if (intent === "confirm" && json.ok) {
        setDraft({ ...draft, status: "LOGGED" })
        setNotice("Logged — today's totals are updated.")
        // Server-rendered totals (food log, dashboard cards) and this panel's remaining macros re-read the new row.
        router.refresh()
        void refreshSuggestions()
      } else {
        const before = draftBeforeLog.current ?? { ...draft, status: "DRAFT" as const }
        setDraft(json.code === "ACTION_STALE" ? { ...before, status: "STALE_CONTEXT", acknowledgedContextVersion: null } : before)
        setNotice(intent === "cancel" ? "Cancelled — nothing was logged." : json.error ?? "That confirmation expired or failed. Nothing was logged.")
      }
      setPending(null)
    } catch {
      setNotice("I couldn't confirm that log. Nothing new was saved — please try again.")
    } finally {
      setBusy(false)
    }
  }

  /* ---------- chat ---------- */

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    setChat((previous) => [...previous, { role: "user", text: message }])
    setSuggestionsStale(true)
    setInput("")
    setHints([])
    setBusy(true)
    setTyping(typingLabel(message, conv.currentTopic))
    try {
      const active = draft && draft.status !== "LOGGED" ? draft : null
      const recentMessages = [...chat, { role: "user" as const, text: message }].slice(-6)
      const { status, json } = await postJson<{
        ok?: boolean
        reply?: string
        message?: string
        error?: string
        mealDraft?: ActiveMealDraft | null
        proposal?: ActiveMealDraft | null
        warnings?: SwapWarning[]
        conversation?: ConversationState
        structuredBlocks?: StructuredBlock[]
        followUpHints?: string[]
      }>("/api/chatbot", { message, coachMode: "nutrition", activeDraft: active, selectedFoods: selected, conversation: { ...conv, recentMessages, priorUserTurns: chat.filter((turn) => turn.role === "user").map((turn) => turn.text.slice(0, 400)).slice(-20) } })
      const reply = json.reply ?? (status === 429 ? "I'm getting a lot of requests — please try again in a moment." : (json.message ?? json.error ?? "I couldn't answer that right now."))
      setChat((previous) => [...previous, { role: "coach", text: reply, ...(json.structuredBlocks?.length ? { blocks: json.structuredBlocks } : {}) }])
      setHints(json.followUpHints ?? [])
      if (json.conversation) {
        setConv(json.conversation)
        if (active && !json.mealDraft && json.conversation.currentTopic?.type !== "MEAL") setDraftInBackground(true)
      }
      if (json.conversation?.deactivateDraft && active && !pending) {
        stash(active, "superseded")
        setDraft(null)
        setProposal(null)
      }
      const next = json.mealDraft
      if (next && next.id !== active?.id) adopt(next)
      else if (next) {
        setDraft(next)
        setPending(null)
      }
      if (json.proposal && json.warnings?.length && active) {
        const [from, to] = findSwapPair(active, json.proposal)
        if (from && to) setProposal({ draft: json.proposal, warnings: json.warnings, from, to })
      }
    } catch {
      setChat((previous) => [...previous, { role: "coach", text: "I couldn't reach the Nutrition Coach. Please try again." }])
    } finally {
      setTyping(null)
      setBusy(false)
      router.refresh()
      void refreshSuggestions()
    }
  }

  const toggleFood = (id: string) => setSelected((previous) => (previous.includes(id) ? previous.filter((x) => x !== id) : previous.length >= 10 ? previous : [...previous, id]))

  const chipLabel = topicChip(conv.currentTopic, draft)

  return (
    <section id="coach" className="scroll-mt-24 space-y-5" aria-label="Nutrition Coach">
      <div className="space-y-3 rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-4 sm:p-5">
        <NutritionCoachHeader busy={busy} />
        <NutritionContextStrip context={context} />

        {chipLabel || draftHistory.length > 0 ? <div className="flex flex-wrap items-center gap-2">
          <NutritionTopicChip label={chipLabel} />
          {draftHistory.length > 0 ? (
            <details className="text-xs text-mf-glass-text-muted">
              <summary className="cursor-pointer rounded px-1 py-0.5 hover:text-mf-glass-text focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-mf-glass-brand">Earlier drafts · {draftHistory.length}</summary>
              <div className="mt-1 flex flex-wrap gap-2">
                {draftHistory.map((entry) => (
                  <button key={entry.item.draftId} type="button" disabled={busy} className="min-h-8 rounded-full border border-mf-glass-border px-2.5 hover:text-mf-glass-text focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-mf-glass-brand" onClick={() => adopt(entry.draft)}>
                    {entry.item.name} ({entry.item.status})
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div> : null}

        {draft ? (
          <NutritionActiveDraftMini
            name={draft.name}
            calories={draft.nutrition.calories}
            protein={draft.nutrition.protein}
            background={draftInBackground}
            onEdit={() => {
              setDraftInBackground(false)
              jumpTo("coach-draft")
            }}
            onLog={draft.status === "LOGGED" ? null : () => {
              setDraftInBackground(false)
              jumpTo("coach-draft-log")
            }}
          />
        ) : null}

        <div role="status" aria-live="polite" className={notice ? "rounded-xl border border-mf-glass-border bg-white/[0.04] px-3 py-2 text-sm text-mf-glass-text-secondary" : "sr-only"}>
          {notice}
        </div>

        {chat.length === 0 && !typing ? (
          <NutritionWelcome />
        ) : (
          <ul className="max-h-[26rem] min-h-24 space-y-4 overflow-y-auto pr-1" aria-label="Conversation">
            {chat.map((message, index) => (
              <NutritionMessage key={index} role={message.role} text={message.text} blocks={index === chat.length - 1 ? message.blocks : undefined} disabled={busy} onPick={(text) => void send(text)} />
            ))}
            {typing ? <NutritionTypingState label={typing} /> : null}
            <li ref={chatEnd} aria-hidden="true" />
          </ul>
        )}

        <NutritionQuickActions actions={hints.length ? hints.map((hint) => ({ label: hint.charAt(0).toUpperCase() + hint.slice(1), message: hint })) : quickActionsFor(chat.length, conv.currentTopic, draft)} disabled={busy} onPick={(message) => void send(message)} />

        <NutritionComposer value={input} onChange={setInput} onSend={() => void send(input)} busy={busy} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* BUILD MY NEXT MEAL */}
        <div className={card}>
          <p className={eyebrow}>Build My Next Meal</p>
          <p className="mt-2 text-sm text-mf-glass-text-muted">
            {context ? (
              <>Left today: <span className="font-semibold text-mf-glass-text">{Math.round(context.caloriesRemaining)} kcal</span> · <span className="font-semibold text-mf-glass-text">{Math.round(context.proteinRemaining)}g protein</span></>
            ) : (
              "Uses your current calorie and protein targets automatically."
            )}
          </p>
          <PrimaryButton className="mt-4" disabled={busy} onClick={() => void run({ action: "build", mode: "BALANCED" })}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Build my next meal
          </PrimaryButton>
        </div>

        {/* CRAVING MAKEOVER */}
        <div className={card}>
          <p className={eyebrow}>Craving Makeover</p>
          <p className="mt-2 text-sm text-mf-glass-text-muted">Turn the food you want into a version that fits your goals.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {CRAVINGS.map((craving) => (
              <SecondaryButton key={craving.key} disabled={busy} onClick={() => void run({ action: "craving", key: craving.key })}>
                {craving.label}
              </SecondaryButton>
            ))}
          </div>
        </div>
      </div>

      {/* CHOOSE MY FOOD */}
      <div className={card}>
        <p className={eyebrow}>Choose My Food</p>
        <p className="mt-2 text-sm text-mf-glass-text-muted">Pick what you have — I&apos;ll use what works, not necessarily all of it.</p>
        <div className="mt-4 space-y-3">
          {GROUPS.map((group) => (
            <fieldset key={group.role}>
              <legend className="text-xs font-semibold uppercase tracking-wide text-mf-glass-text-muted">{group.label}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {COACH_INGREDIENTS.filter((i) => i.role === group.role && !blockedIds.includes(i.id)).map((i) => {
                  const on = selected.includes(i.id)
                  return (
                    <button key={i.id} type="button" aria-pressed={on} onClick={() => toggleFood(i.id)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-mf-glass-brand-border bg-mf-glass-brand-soft text-mf-glass-brand" : "border-mf-glass-border bg-white/5 text-mf-glass-text-secondary hover:border-white/20"}`}>
                      {i.shortName}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <SecondaryButton className="mt-4" disabled={busy || selected.length === 0} onClick={() => void run({ action: "choose", ingredientIds: selected })}>
          Build from {selected.length || "my"} selected food{selected.length === 1 ? "" : "s"}
        </SecondaryButton>
      </div>

      {/* SUGGESTED FOR YOU */}
      {suggestions.length > 0 && suggestionsStale ? (
        <div className={card} aria-live="polite">
          <p className={eyebrow}>Suggested For You</p>
          <p className="mt-3 text-sm text-mf-glass-text-muted">Updating suggestions for what you just told the coach…</p>
        </div>
      ) : suggestions.length > 0 ? (
        <div className={card}>
          <p className={eyebrow}>Suggested For You</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-col justify-between rounded-xl border border-mf-glass-border bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-bold text-mf-glass-text">{s.name}</p>
                  <p className="mt-1 text-xs text-mf-glass-text-muted">{s.ingredients.map((i) => `${i.name} ${i.grams} g`).join(" · ")}</p>
                  <p className="mt-2 text-xs font-semibold text-mf-glass-text-secondary">{Math.round(s.nutrition.calories)} kcal · {Math.round(s.nutrition.protein)}g protein</p>
                </div>
                <SecondaryButton size="sm" className="mt-3 w-fit" disabled={busy} onClick={() => adopt(s)}>Customize this meal</SecondaryButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ACTIVE MEAL DRAFT */}
      {draft && draftInBackground ? (
        <article id="coach-draft" className={`${card} scroll-mt-24 flex flex-wrap items-center justify-between gap-3`} aria-label="Active meal draft summary">
          <div>
            <p className={eyebrow}>Active draft · in the background</p>
            <p className="mt-1 font-bold text-mf-glass-text">{draft.name}</p>
            <p className="mt-1 text-xs text-mf-glass-text-muted">
              {Math.round(draft.nutrition.calories)} kcal · {Math.round(draft.nutrition.protein)}g protein · untouched while you discuss another topic
            </p>
          </div>
          <SecondaryButton size="sm" onClick={() => setDraftInBackground(false)}>Review active draft</SecondaryButton>
        </article>
      ) : draft ? (
        <div id="coach-draft" className="scroll-mt-24 space-y-3">
          <MealDraftCard
            draft={draft}
            proposal={proposal}
            skippedSuggestions={skipped}
            blockedIngredientIds={blockedIds}
            busy={busy}
            onOp={(op) => void edit(op)}
            onSkipSuggestion={(id) => setSkipped((previous) => [...previous, id])}
            onDismissProposal={() => setProposal(null)}
            onUseAvailable={handleUseAvailable}
          />

          <div id="coach-draft-log" className={`${card} scroll-mt-24`}>
            <p className={eyebrow}>Log this meal</p>
            {draft.status === "LOGGED" ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-emerald-300">
                Logged ✓
                <SecondaryButton size="sm" onClick={() => setDraft(null)}>Start another meal</SecondaryButton>
              </div>
            ) : pending ? (
              <div role="alertdialog" aria-label="Confirm food log" className="mt-3 text-sm text-mf-glass-text-secondary">
                <p>{pending.summary}</p>
                <div className="mt-3 flex gap-2">
                  <PrimaryButton size="sm" disabled={busy} onClick={() => void resolveLog("confirm")}>Confirm</PrimaryButton>
                  <SecondaryButton size="sm" disabled={busy} onClick={() => void resolveLog("cancel")}>Cancel</SecondaryButton>
                </div>
              </div>
            ) : similarWarning ? (
              <div role="alert" className="mt-3 text-sm text-amber-200">
                <p>{similarWarning}</p>
                <div className="mt-3 flex gap-2">
                  <PrimaryButton size="sm" disabled={busy} onClick={() => void proposeLog(true)}>Log again</PrimaryButton>
                  <SecondaryButton size="sm" onClick={() => setSimilarWarning(null)}>Cancel</SecondaryButton>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-xs text-mf-glass-text-muted" htmlFor="coach-meal-type">Meal</label>
                <select id="coach-meal-type" className="rounded-lg border border-mf-glass-border bg-black/30 px-2 py-1.5 text-sm text-mf-glass-text" value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
                  {MEAL_TYPES.map((type) => (
                    <option key={type} value={type}>{MEAL_TYPE_LABEL[type]}</option>
                  ))}
                </select>
                <PrimaryButton size="sm" disabled={busy || draft.status === "STALE_CONTEXT"} onClick={() => void proposeLog()}>Log this meal</PrimaryButton>
                <span className="text-xs text-mf-glass-text-muted">You&apos;ll confirm before anything is saved.</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

    </section>
  )
}

/** Subtle topic chip, only when there is a real topic. The Active Meal Draft is context, not the default topic. */
function topicChip(topic: NutritionTopic | null, draft: ActiveMealDraft | null): string | null {
  if (topic?.type === "CRAVING") return `Topic · ${topic.food ? `${topic.food} craving` : "your craving"}`
  if (topic?.type === "FOOD" && topic.food) return `Topic · ${topic.food}`
  if (draft && topic?.type === "MEAL") return `Editing · ${draft.name}`
  return null
}

function typingLabel(message: string, topic: NutritionTopic | null): string {
  if (topic?.type === "CRAVING" || /crav/i.test(message)) return "Finding a way to keep the craving..."
  if (/macro|protein|calorie|kcal/i.test(message)) return "Working around today's macros..."
  return "Thinking through your options..."
}

const actionByLabel = (label: string, display = label) => {
  const found = QUICK_ACTIONS.find((a) => a.label === label)
  return found ? [{ label: display, message: found.message }] : []
}

/** At most three contextual suggestions, all from the shared QUICK_ACTIONS so they take the exact same pipeline as typed text. */
function quickActionsFor(chatLength: number, topic: NutritionTopic | null, draft: ActiveMealDraft | null) {
  if (draft && draft.status !== "LOGGED" && topic?.type === "MEAL") {
    return [...actionByLabel("Make this meal tastier"), ...actionByLabel("Make this cheaper"), ...actionByLabel("Make this more filling")]
  }
  if (topic?.type === "CRAVING" || topic?.type === "FOOD") {
    return [...actionByLabel("Use my remaining macros", "Use today's macros"), ...actionByLabel("Meal under 500 calories"), ...actionByLabel("Build a high-protein meal", "High-protein option")]
  }
  if (chatLength === 0) {
    return [...actionByLabel("Build a high-protein meal", "Build my next meal"), ...actionByLabel("Use my remaining macros", "Use today's macros"), ...actionByLabel("Craving chocolate cereal", "Handle a craving")]
  }
  return [...actionByLabel("Use my remaining macros", "Use today's macros"), ...actionByLabel("Craving chocolate cereal", "Handle a craving")]
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" })
}

/** The ingredient pair a swap proposal changed — lets chat-initiated swaps reuse the same warning actions. */
function findSwapPair(before: ActiveMealDraft, after: ActiveMealDraft): [string, string] {
  const beforeIds = before.ingredients.map((i) => i.ingredientId)
  const afterIds = after.ingredients.map((i) => i.ingredientId)
  return [beforeIds.find((id) => !afterIds.includes(id)) ?? "", afterIds.find((id) => !beforeIds.includes(id)) ?? ""]
}
