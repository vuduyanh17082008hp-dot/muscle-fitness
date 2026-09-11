"use client"

import { useState } from "react"

import { Check, ClipboardCopy, Printer } from "lucide-react"

import type { ShoppingListGroup } from "@/lib/nutrition/shopping-list"

type ShoppingListClientProps = {
  groups: ShoppingListGroup[]
  days: number
  itemCostsSgd?: Record<string, number | null>
}

function buildPlainTextList(
  groups: ShoppingListGroup[],
  days: number,
  itemCostsSgd?: Record<string, number | null>,
): string {
  const lines: string[] = [`Muscle Fitness — Shopping List (${days} day${days === 1 ? "" : "s"})`, ""]

  for (const group of groups) {
    lines.push(group.label.toUpperCase())

    for (const item of group.items) {
      const cost = itemCostsSgd?.[item.foodId]
      const costSuffix = cost !== undefined && cost !== null ? ` (~${cost.toFixed(2)} SGD, est.)` : ""
      lines.push(`- ${item.name}: ${item.displayQuantity}${costSuffix}`)
    }

    lines.push("")
  }

  return lines.join("\n").trim()
}

export function ShoppingListClient({ groups, days, itemCostsSgd }: ShoppingListClientProps) {
  const storageKey = `mf-shopping-list-checked-${days}`

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      return {}
    }

    try {
      const stored = window.localStorage.getItem(storageKey)
      return stored ? (JSON.parse(stored) as Record<string, boolean>) : {}
    } catch {
      return {}
    }
  })

  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle")

  function toggleItem(foodId: string) {
    setChecked((previous) => {
      const next = { ...previous, [foodId]: !previous[foodId] }

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Ignore storage errors (private browsing, quota, etc.) — the
        // checklist still works for the current page view.
      }

      return next
    })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildPlainTextList(groups, days, itemCostsSgd))
      setCopyState("copied")
      window.setTimeout(() => setCopyState("idle"), 2000)
    } catch {
      setCopyState("error")
      window.setTimeout(() => setCopyState("idle"), 2000)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/10"
        >
          <ClipboardCopy className="size-4" />
          {copyState === "copied"
            ? "Copied!"
            : copyState === "error"
              ? "Couldn't copy"
              : "Copy List"}
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/10"
        >
          <Printer className="size-4" />
          Print
        </button>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <section
            key={group.category}
            className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-5 sm:p-6"
          >
            <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-amber-500">
              {group.label}
            </h2>

            <ul className="divide-y divide-white/5">
              {group.items.map((item) => {
                const isChecked = Boolean(checked[item.foodId])

                return (
                  <li key={item.foodId}>
                    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-md border transition ${
                            isChecked
                              ? "border-amber-400 bg-amber-400 text-black"
                              : "border-white/20 bg-transparent"
                          }`}
                        >
                          {isChecked ? <Check className="size-3.5" /> : null}
                        </span>

                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isChecked}
                          onChange={() => toggleItem(item.foodId)}
                        />

                        <span
                          className={`text-sm font-medium ${
                            isChecked ? "text-zinc-600 line-through" : "text-zinc-200"
                          }`}
                        >
                          {item.name}
                        </span>
                      </span>

                      <span
                        className={`shrink-0 text-right text-sm font-semibold ${
                          isChecked ? "text-zinc-700" : "text-white"
                        }`}
                      >
                        {item.displayQuantity}
                        {itemCostsSgd?.[item.foodId] != null ? (
                          <span className="ml-2 text-xs font-medium text-zinc-500">
                            ~{itemCostsSgd[item.foodId]!.toFixed(2)} SGD
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
