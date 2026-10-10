"use client"

import { useState } from "react"
import { AlertTriangle, Redo2, ShieldCheck, Undo2, X } from "lucide-react"

import { PrimaryButton, SecondaryButton } from "@/components/ui/button"
import type { DraftOp, SwapWarning } from "@/lib/nutrition/coach/draft"
import { COACH_INGREDIENTS } from "@/lib/nutrition/coach/ingredients"
import type { ActiveMealDraft, Confidence, DraftStatus } from "@/lib/nutrition/coach/types"

const STATUS_LABEL: Record<DraftStatus, string> = {
  DRAFT: "Draft",
  STALE_CONTEXT: "Targets changed",
  READY: "Ready",
  CONFIRMED: "Awaiting confirmation",
  LOGGED: "Logged",
}

const CONFIDENCE_TONE: Record<Confidence, string> = {
  HIGH: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  MEDIUM: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  LOW: "border-rose-400/30 bg-rose-400/10 text-rose-300",
}

const QUICK_EDITS: Array<{ label: string; op: DraftOp }> = [
  { label: "More protein", op: { type: "more_protein" } },
  { label: "Lower calories", op: { type: "lower_calories" } },
  { label: "Cheaper", op: { type: "cheaper" } },
  { label: "Faster", op: { type: "faster" } },
  { label: "More filling", op: { type: "more_filling" } },
  { label: "Make it tastier", op: { type: "tastier" } },
]

const chip = "rounded-full border border-mf-glass-border bg-white/5 px-3 py-1.5 text-xs font-semibold text-mf-glass-text-secondary transition hover:border-white/20 hover:text-mf-glass-text disabled:opacity-50"
const BASIS_LABEL = { RAW: "raw", COOKED: "cooked", AS_SERVED: "as served" } as const
const PROVENANCE_LABEL = {
  USDA_REFERENCE: "USDA reference",
  LABEL_REFERENCE: "label reference",
  CURATED_ESTIMATE: "estimated reference",
} as const

type Props = {
  draft: ActiveMealDraft
  proposal: { draft: ActiveMealDraft; warnings: SwapWarning[]; from: string; to: string } | null
  skippedSuggestions: string[]
  busy: boolean
  onOp: (op: DraftOp) => void
  onSkipSuggestion: (ingredientId: string) => void
  onDismissProposal: () => void
  onUseAvailable: () => void
}

export function MealDraftCard({ draft, proposal, skippedSuggestions, busy, onOp, onSkipSuggestion, onDismissProposal, onUseAvailable }: Props) {
  const locked = draft.status === "CONFIRMED" || draft.status === "LOGGED"
  const disabled = busy || locked
  const suggestions = draft.suggestions.filter((s) => !skippedSuggestions.includes(s.ingredientId))
  const canUndo = draft.historyIndex > 0
  const canRedo = draft.historyIndex < draft.history.length - 1

  return (
    <article className="rounded-[20px] border border-mf-glass-border bg-mf-glass-surface p-5 sm:p-6" aria-label="Active meal draft">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-mf-glass-brand">Active Meal Draft</p>
          <h3 className="mt-1 text-xl font-bold text-mf-glass-text">{draft.name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-mf-glass-border bg-white/5 px-3 py-1 text-xs font-semibold text-mf-glass-text-secondary">{STATUS_LABEL[draft.status]}</span>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${CONFIDENCE_TONE[draft.confidence]}`}>Macro confidence: {draft.confidence}</span>
        </div>
      </header>

      {draft.status === "STALE_CONTEXT" ? (
        <div role="alert" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Your nutrition target has changed since this meal was created.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton size="sm" disabled={busy} onClick={() => onOp({ type: "refresh" })}>Refresh meal</PrimaryButton>
            <SecondaryButton size="sm" disabled={busy} onClick={() => onOp({ type: "keep" })}>Keep current draft</SecondaryButton>
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-mf-glass-border text-left text-[11px] uppercase tracking-[0.14em] text-mf-glass-text-muted">
              <th className="pb-2 font-semibold">Ingredient</th>
              <th className="pb-2 pl-3 text-right font-semibold">Grams</th>
              <th className="pb-2 pl-3 font-semibold">Swap</th>
              <th className="pb-2 pl-3"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {draft.ingredients.map((item) => {
              const current = COACH_INGREDIENTS.find((i) => i.id === item.ingredientId)
              const options = COACH_INGREDIENTS.filter((i) => i.role === current?.role && i.id !== item.ingredientId && !draft.ingredients.some((d) => d.ingredientId === i.id))
              return (
                <tr key={item.ingredientId} className="border-b border-white/5 last:border-0">
                  <td className="py-2 text-mf-glass-text-secondary">
                    <span className="block">{item.name}</span>
                    {current ? (
                      <span className="block text-[10px] uppercase tracking-wide text-mf-glass-text-muted">
                        Per 100 g {BASIS_LABEL[current.measurementBasis]} · {PROVENANCE_LABEL[current.provenance]}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <GramsInput key={`${item.ingredientId}-${item.grams}`} label={`${item.name} grams`} value={item.grams} disabled={disabled} onCommit={(grams) => onOp({ type: "set_grams", ingredientId: item.ingredientId, grams })} />
                  </td>
                  <td className="py-2 pl-3">
                    <select
                      aria-label={`Swap ${item.name}`}
                      className="max-w-[9rem] rounded-lg border border-mf-glass-border bg-black/30 px-2 py-1 text-xs text-mf-glass-text-secondary"
                      disabled={disabled || options.length === 0}
                      value=""
                      onChange={(event) => event.target.value && onOp({ type: "swap", from: item.ingredientId, to: event.target.value })}
                    >
                      <option value="">Swap…</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>{option.shortName}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <button type="button" aria-label={`Remove ${item.name}`} className="rounded-md p-1 text-mf-glass-text-muted hover:text-rose-300 disabled:opacity-40" disabled={disabled || draft.ingredients.length === 1} onClick={() => onOp({ type: "remove", ingredientId: item.ingredientId })}>
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mf-glass-border pt-4 text-sm font-semibold text-mf-glass-text-secondary">
        <span className="text-mf-glass-brand">{Math.round(draft.nutrition.calories)} kcal</span>
        <span>P {Math.round(draft.nutrition.protein)} g</span>
        <span>C {Math.round(draft.nutrition.carbs)} g</span>
        <span>F {Math.round(draft.nutrition.fat)} g</span>
        <span className="text-xs font-normal text-mf-glass-text-muted">≈ S${draft.estimatedPriceSgd.toFixed(2)} (estimate) · ~{draft.cookMinutes} min</span>
      </div>

      <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-mf-glass-text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        <span>Totals are calculated from verified ingredient data, not guessed by AI. {draft.confidenceReasons.join(" · ")}</span>
      </p>

      {draft.notes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-200" role="status">
          {draft.notes.filter((note) => !note.startsWith("Your nutrition target")).map((note) => (
            <li key={note}>• {note}</li>
          ))}
        </ul>
      ) : null}

      {proposal ? (
        <div role="alert" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          {proposal.warnings.map((warning) => (
            <div key={warning.kind} className="mb-3 last:mb-0">
              <p className="font-semibold">{warning.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {warning.actions.map((action) => (
                  <SecondaryButton key={action.fit} size="sm" disabled={busy} onClick={() => onOp({ type: "swap", from: proposal.from, to: proposal.to, fit: action.fit })}>
                    {action.label}
                  </SecondaryButton>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="mt-1 text-xs underline" onClick={onDismissProposal}>Dismiss</button>
        </div>
      ) : null}

      {draft.craving ? (
        <section className="mt-5 rounded-xl border border-mf-glass-border bg-white/[0.03] p-4 text-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-mf-glass-text-muted">Craving Makeover · {draft.craving.label}</p>
          <p className="mt-2 text-mf-glass-text-secondary">Keeps: {draft.craving.preserved.join(", ")}.</p>
          <ul className="mt-2 space-y-1 text-xs text-mf-glass-text-muted">
            {draft.craving.swaps.map((swap) => (
              <li key={swap.from}>{swap.from} → <span className="text-mf-glass-text-secondary">{swap.to}</span> — {swap.why}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-mf-glass-text-muted">
            Original (ESTIMATED): {draft.craving.original.description}, {draft.craving.original.portion} — roughly {draft.craving.original.caloriesRange[0]}–{draft.craving.original.caloriesRange[1]} kcal.
          </p>
          <ul className="mt-1 space-y-1 text-xs text-mf-glass-text-secondary">
            {draft.craving.comparison.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {suggestions.length > 0 && !locked ? (
        <section className="mt-5" aria-label="Make it better">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-mf-glass-brand">Make it better</p>
          <ul className="mt-3 space-y-3">
            {suggestions.map((s) => (
              <li key={s.ingredientId} className="rounded-xl border border-mf-glass-border bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-mf-glass-text">
                      {s.ingredientName} <span className="font-normal text-mf-glass-text-muted">· {s.grams} g</span>
                    </p>
                    <p className="text-xs text-mf-glass-text-muted">→ {s.purpose}. {s.reason}.</p>
                    <p className="mt-1 text-xs text-mf-glass-text-secondary">
                      {s.impact.calories < 10 ? "minimal calorie impact" : `+${Math.round(s.impact.calories)} kcal`}
                      {s.impact.protein >= 1 ? ` · +${Math.round(s.impact.protein)}g protein` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.necessity === "REQUIRED_FOR_TARGET" ? "border-rose-400/30 text-rose-300" : "border-mf-glass-border text-mf-glass-text-muted"}`}>
                    {s.necessity === "REQUIRED_FOR_TARGET" ? "Needed for target" : "Optional"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={chip} disabled={disabled} onClick={() => onOp({ type: "add", ingredientId: s.ingredientId, grams: s.grams })}>Add to recipe</button>
                  {s.alternatives[0] ? (
                    <button type="button" className={chip} disabled={disabled} onClick={() => onOp({ type: "add", ingredientId: s.alternatives[0] })}>Find alternative</button>
                  ) : null}
                  <button type="button" className={chip} onClick={() => onSkipSuggestion(s.ingredientId)}>Skip</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!locked ? (
        <section className="mt-5" aria-label="Customize">
          <div className="flex flex-wrap gap-2">
            {QUICK_EDITS.map((edit) => (
              <button key={edit.label} type="button" className={chip} disabled={disabled} onClick={() => onOp(edit.op)}>{edit.label}</button>
            ))}
            <button type="button" className={chip} disabled={disabled} onClick={onUseAvailable}>Use only what I have</button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mf-glass-text-muted">
            <button type="button" className={`${chip} inline-flex items-center gap-1`} disabled={disabled || !canUndo} onClick={() => onOp({ type: "undo" })}><Undo2 className="size-3.5" /> Undo</button>
            <button type="button" className={`${chip} inline-flex items-center gap-1`} disabled={disabled || !canRedo} onClick={() => onOp({ type: "redo" })}><Redo2 className="size-3.5" /> Redo</button>
            <HistoryPicker draft={draft} disabled={disabled} onRestore={(version) => onOp({ type: "restore", version })} />
          </div>
        </section>
      ) : null}
    </article>
  )
}

function HistoryPicker({ draft, disabled, onRestore }: { draft: ActiveMealDraft; disabled: boolean; onRestore: (version: number) => void }) {
  if (draft.history.length < 2) return null
  return (
    <select aria-label="Restore a previous version" className="rounded-lg border border-mf-glass-border bg-black/30 px-2 py-1 text-xs text-mf-glass-text-secondary" disabled={disabled} value="" onChange={(event) => event.target.value && onRestore(Number(event.target.value))}>
      <option value="">Versions…</option>
      {draft.history.map((version, index) => (
        <option key={version.version} value={version.version}>
          v{version.version} · {version.label}{index === draft.historyIndex ? " (current)" : ""}
        </option>
      ))}
    </select>
  )
}

function GramsInput({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (grams: number) => void }) {
  const [text, setText] = useState(String(value))
  const commit = () => {
    const grams = Number(text)
    if (Number.isFinite(grams) && grams > 0 && grams !== value) onCommit(grams)
    else setText(String(value))
  }
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className="w-16 rounded-lg border border-mf-glass-border bg-black/30 px-2 py-1 text-right text-sm font-semibold text-mf-glass-text"
      disabled={disabled}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && commit()}
    />
  )
}
