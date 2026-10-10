"use client"

/**
 * Presentation-only pieces of the Nutrition Coach chat. No data fetching, no routing:
 * the container (nutrition-coach-panel.tsx) owns all state and calls.
 */

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Send, Sparkles } from "lucide-react"

import type { StructuredBlock } from "@/lib/nutrition/coach/followup"

// globals.css sets unlayered `font: inherit` on controls, `border-color` on *, and an outline on :focus-visible,
// all of which beat Tailwind utilities: control font comes from the wrapper; outline/border overrides need `!`.
const focusRing = "focus-visible:outline-none! focus-visible:ring-2 focus-visible:ring-mf-glass-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#101112]"

/** Small rounded coach: lime leaf-sprout on a dark face. Decorative; the name is always next to it. */
export function NutritionCoachAvatar({ size = 32, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full border border-mf-glass-brand-border bg-[#14170d] ${glow ? "shadow-[0_0_14px_rgba(216,255,32,0.22)]" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.8} height={size * 0.8} fill="none">
        <path d="M16 8c0-3 2-4.5 5-4.5 0 3-2 4.5-5 4.5Z" fill="#d8ff20" />
        <path d="M16 8v2" stroke="#d8ff20" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="6.5" y="10" width="19" height="15" rx="7.5" fill="#1e2314" stroke="#d8ff20" strokeOpacity=".45" />
        <circle cx="12.3" cy="17" r="1.5" fill="#f3f5e8" />
        <circle cx="19.7" cy="17" r="1.5" fill="#f3f5e8" />
        <path d="M13.2 20.8c1.6 1.3 3.9 1.3 5.6 0" stroke="#d8ff20" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="9.6" cy="20.2" r="1.1" fill="#c47a3d" fillOpacity=".55" />
        <circle cx="22.4" cy="20.2" r="1.1" fill="#c47a3d" fillOpacity=".55" />
      </svg>
    </span>
  )
}

export function NutritionCoachHeader({ busy }: { busy: boolean }) {
  return (
    <header className="flex items-center gap-3">
      <NutritionCoachAvatar size={36} glow />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-black leading-tight text-mf-glass-text">Nutrition Coach</h2>
        <p className="truncate text-xs text-mf-glass-text-muted">Meals, cravings &amp; macros</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-mf-glass-text-muted">
        <span className={`size-1.5 rounded-full bg-mf-glass-brand ${busy ? "motion-safe:animate-pulse" : ""}`} aria-hidden="true" />
        {busy ? "Working" : "Ready"}
      </span>
    </header>
  )
}

/** Compact "Today" line that expands into calories, protein and goal. Secondary by design. */
export function NutritionContextStrip({ context }: { context: { caloriesRemaining: number; proteinRemaining: number; caloriesTarget: number; proteinTarget: number; goal: string | null } | null }) {
  if (!context) return null
  return (
    <details className="group rounded-xl border border-mf-glass-border bg-white/[0.02] text-xs text-mf-glass-text-muted">
      <summary className={`flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-1.5 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <span className="font-semibold text-mf-glass-text-secondary">Today</span>
        <span className="min-w-0 flex-1 truncate">
          {Math.round(context.caloriesRemaining)} kcal left · {Math.round(context.proteinRemaining)}g protein left
        </span>
        <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="grid grid-cols-3 gap-2 border-t border-mf-glass-border px-3 py-2">
        <div><dt>Calories</dt><dd className="font-semibold text-mf-glass-text">{Math.round(context.caloriesRemaining)} / {Math.round(context.caloriesTarget)}</dd></div>
        <div><dt>Protein</dt><dd className="font-semibold text-mf-glass-text">{Math.round(context.proteinRemaining)} / {Math.round(context.proteinTarget)}g</dd></div>
        <div><dt>Goal</dt><dd className="truncate font-semibold capitalize text-mf-glass-text">{context.goal ? context.goal.replace(/_/g, " ") : "—"}</dd></div>
      </dl>
    </details>
  )
}

export function NutritionTopicChip({ label }: { label: string | null }) {
  if (!label) return null
  return <span className="inline-flex max-w-full items-center truncate rounded-full border border-mf-glass-brand-border bg-mf-glass-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-mf-glass-brand">{label}</span>
}

/** Plain text with "•" / "-" lines rendered as a list. Never HTML. */
function MessageBody({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let items: string[] = []
  const flush = () => {
    if (items.length) blocks.push(<ul key={`l${blocks.length}`} className="my-1.5 space-y-1">{items.map((item, i) => <li key={i} className="flex gap-2"><span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-mf-glass-brand" aria-hidden="true" /><span>{item}</span></li>)}</ul>)
    items = []
  }
  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[•\-*]\s+(.*)$/)
    if (bullet) items.push(bullet[1])
    else {
      flush()
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{line}</p>)
    }
  }
  flush()
  return <div className="space-y-2.5">{blocks}</div>
}

const chip = `inline-flex min-h-8 items-center rounded-full border border-mf-glass-border px-2.5 text-xs font-semibold text-mf-glass-text-secondary transition hover:border-mf-glass-brand-border hover:text-mf-glass-text disabled:opacity-50 ${focusRing}`
const kcal = (n: number) => `${Math.round(n)} kcal`

/** Compact, typed results under a coach message. Built from structured data — never parsed out of prose. */
export function NutritionBlocks({ blocks, disabled, onPick }: { blocks: StructuredBlock[]; disabled: boolean; onPick: (message: string) => void }) {
  if (blocks.length === 0) return null
  return (
    <div className="mt-2 space-y-2">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "INGREDIENT_LIST":
            return (
              <dl key={index} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl border border-mf-glass-border bg-white/[0.03] px-3 py-2 text-xs" aria-label={`Ingredients of ${block.mealName}`}>
                {block.items.map((item) => (
                  <div key={item.name} className="contents"><dt className="min-w-0 truncate text-mf-glass-text-secondary">{item.name}</dt><dd className="font-semibold text-mf-glass-text">{item.grams} g</dd></div>
                ))}
              </dl>
            )
          case "MACRO_SUMMARY":
            return (
              <p key={index} className="flex flex-wrap gap-x-3 gap-y-0.5 rounded-xl border border-mf-glass-border bg-white/[0.03] px-3 py-2 text-xs text-mf-glass-text-secondary">
                <span className="font-semibold text-mf-glass-text">{kcal(block.macros.calories)}</span>
                <span>{Math.round(block.macros.protein)}g protein</span><span>{Math.round(block.macros.carbs)}g carbs</span><span>{Math.round(block.macros.fat)}g fat</span>
                <span className="text-mf-glass-text-muted">confidence {block.confidence.toLowerCase()}</span>
              </p>
            )
          case "OPTION_LIST":
            return (
              <ol key={index} className="space-y-1" aria-label="Options">
                {block.options.map((option, i) => (
                  <li key={option.id}>
                    <button type="button" disabled={disabled} onClick={() => onPick(`option ${i + 1}`)} className={`flex w-full items-center gap-2 rounded-xl border border-mf-glass-border bg-white/[0.03] px-3 py-1.5 text-left text-xs hover:border-mf-glass-brand-border disabled:opacity-50 ${focusRing}`}>
                      <span className="font-black text-mf-glass-brand">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-mf-glass-text">{option.label}</span>
                      <span className="text-mf-glass-text-muted">{kcal(option.calories)} · {Math.round(option.protein)}g</span>
                    </button>
                  </li>
                ))}
              </ol>
            )
          case "MEAL_COMPARISON":
            return (
              <table key={index} className="w-full rounded-xl border border-mf-glass-border bg-white/[0.03] text-xs">
                <thead className="sr-only"><tr><th>Meal</th><th>Calories</th><th>Protein</th></tr></thead>
                <tbody>
                  {block.rows.map((row) => (
                    <tr key={row.id} className="border-t border-mf-glass-border first:border-t-0"><td className="truncate px-3 py-1.5 font-semibold text-mf-glass-text">{row.label}</td><td className="px-2 text-mf-glass-text-secondary">{kcal(row.calories)}</td><td className="px-2 text-mf-glass-text-secondary">{Math.round(row.protein)}g</td></tr>
                  ))}
                </tbody>
              </table>
            )
          case "MODIFICATION_PROPOSAL":
            return (
              <div key={index} className="rounded-xl border border-mf-glass-brand-border/60 bg-mf-glass-brand-soft px-3 py-2 text-xs">
                <p className="font-black uppercase tracking-wider text-mf-glass-brand">Proposed change · not applied yet</p>
                <ul className="my-1 space-y-0.5 text-mf-glass-text">{block.changes.map((change) => <li key={change}>{change}</li>)}</ul>
                <p className="text-mf-glass-text-muted">{kcal(block.before.calories)} → <span className="font-semibold text-mf-glass-text">{kcal(block.after.calories)}</span> · {Math.round(block.before.protein)}g → <span className="font-semibold text-mf-glass-text">{Math.round(block.after.protein)}g</span> protein</p>
                <div className="mt-2 flex gap-2"><button type="button" disabled={disabled} className={chip} onClick={() => onPick("yes")}>Apply</button><button type="button" disabled={disabled} className={chip} onClick={() => onPick("no")}>Keep as is</button></div>
              </div>
            )
          case "CLARIFICATION":
            return block.options.length ? (
              <div key={index} className="flex flex-wrap gap-2">{block.options.map((option) => <button key={option} type="button" disabled={disabled} className={chip} onClick={() => onPick(`the ${option} one`)}>{option}</button>)}</div>
            ) : null
        }
      })}
    </div>
  )
}

export function NutritionMessage({ role, text, blocks, disabled = false, onPick }: { role: "user" | "coach"; text: string; blocks?: StructuredBlock[]; disabled?: boolean; onPick?: (message: string) => void }) {
  if (role === "user") {
    return (
      <li className="dante-message-in flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-mf-glass-brand-border/60 bg-[#232a12] px-3.5 py-2 text-sm leading-6 text-mf-glass-text sm:max-w-[min(70%,32rem)]">{text}</p>
      </li>
    )
  }
  return (
    <li className="dante-message-in flex items-start gap-2.5">
      <NutritionCoachAvatar size={28} />
      <div className="min-w-0 max-w-[92%] sm:max-w-[min(80%,40rem)]">
        <p className="mb-0.5 text-[11px] font-bold text-mf-glass-text-muted">Nutrition Coach</p>
        <div className="break-words text-sm leading-6 text-mf-glass-text-secondary"><MessageBody text={text} /></div>
        {blocks?.length && onPick ? <NutritionBlocks blocks={blocks} disabled={disabled} onPick={onPick} /> : null}
      </div>
    </li>
  )
}

export function NutritionTypingState({ label }: { label: string }) {
  return (
    <li className="dante-message-in flex items-start gap-2.5" aria-live="polite">
      <NutritionCoachAvatar size={28} glow />
      <div>
        <p className="mb-0.5 text-[11px] font-bold text-mf-glass-text-muted">Nutrition Coach</p>
        <p className="flex items-center gap-2 text-sm text-mf-glass-text-muted">
          <span className="inline-flex gap-1" aria-hidden="true">
            {[0, 150, 300].map((delay) => <span key={delay} className="size-1.5 rounded-full bg-mf-glass-brand motion-safe:animate-bounce" style={{ animationDelay: `${delay}ms` }} />)}
          </span>
          {label}
        </p>
      </div>
    </li>
  )
}

export function NutritionWelcome() {
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <NutritionCoachAvatar size={44} glow />
      <p className="text-base font-bold text-mf-glass-text">Hey — what are we solving today?</p>
      <p className="max-w-xs text-sm text-mf-glass-text-muted">I can help with meals, cravings, macros or food choices.</p>
    </div>
  )
}

/** Max three contextual, secondary actions. Each one just sends its message through the normal chat pipeline. */
export function NutritionQuickActions({ actions, disabled, onPick }: { actions: Array<{ label: string; message: string }>; disabled: boolean; onPick: (message: string) => void }) {
  if (actions.length === 0) return null
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-xs font-semibold sm:flex-wrap sm:overflow-visible" role="group" aria-label="Suggested replies">
      {actions.slice(0, 3).map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(action.message)}
          className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-mf-glass-border bg-white/[0.04] px-3 text-xs font-semibold text-mf-glass-text-secondary transition hover:border-mf-glass-brand-border hover:text-mf-glass-text disabled:opacity-50 ${focusRing}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

/** Active draft is context, not controller: one collapsed line, with jump links to the real editor. */
export function NutritionActiveDraftMini({ name, calories, protein, background, onEdit, onLog }: { name: string; calories: number; protein: number; background: boolean; onEdit: () => void; onLog: (() => void) | null }) {
  return (
    <details className="group rounded-xl border border-mf-glass-border bg-white/[0.03] text-sm">
      <summary className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <ChevronRight className="size-3.5 shrink-0 text-mf-glass-text-muted transition group-open:rotate-90" aria-hidden="true" />
        <span className="text-[11px] font-black uppercase tracking-wider text-mf-glass-brand">{background ? "Draft · paused" : "Active draft"}</span>
        <span className="min-w-0 flex-1 truncate font-semibold text-mf-glass-text">{name}</span>
      </summary>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-mf-glass-border px-3 py-2">
        <p className="text-xs text-mf-glass-text-muted">{Math.round(calories)} kcal · {Math.round(protein)}g protein</p>
        <div className="flex gap-2 text-xs font-semibold">
          <button type="button" onClick={onEdit} className={`min-h-9 rounded-full border border-mf-glass-border px-3 text-xs font-semibold text-mf-glass-text-secondary hover:border-white/25 ${focusRing}`}>Edit</button>
          {onLog ? <button type="button" onClick={onLog} className={`min-h-9 rounded-full border border-mf-glass-brand-border bg-mf-glass-brand-soft px-3 text-xs font-semibold text-mf-glass-brand ${focusRing}`}>Log</button> : null}
        </div>
      </div>
    </details>
  )
}

/** Multiline composer. Enter sends, Shift+Enter adds a line. Not sticky: fixed mobile nav and the Dante launcher would cover it. */
export function NutritionComposer({ value, onChange, onSend, busy }: { value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean }) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [value])
  const canSend = !busy && value.trim().length > 0
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSend) onSend()
    }
  }
  return (
    <form
      className="flex items-end gap-2 rounded-2xl border border-mf-glass-border bg-[#17191b] p-2 text-base leading-6 transition focus-within:border-mf-glass-brand/70! focus-within:ring-2 focus-within:ring-mf-glass-brand/20 sm:text-sm"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSend) onSend()
      }}
    >
      <label htmlFor="coach-chat-input" className="sr-only">Message the Nutrition Coach</label>
      <textarea
        id="coach-chat-input"
        ref={ref}
        rows={1}
        maxLength={800}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask about a meal or craving..."
        className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-mf-glass-text placeholder:text-mf-glass-text-muted focus-visible:outline-none!"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#c47a3d] text-[#1a0f05] transition hover:bg-[#d58a4b] disabled:bg-white/10 disabled:text-mf-glass-text-muted ${focusRing}`}
      >
        {busy ? <Sparkles className="size-4 motion-safe:animate-pulse" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
      </button>
    </form>
  )
}
