"use client"

import { useRef, useState } from "react"
import { Camera, Loader2, Upload } from "lucide-react"

import { getLocalFallbackById } from "@/lib/nutrition/food-data/local-fallback"
import type { MenuAnalysis } from "@/lib/nutrition/menu-to-macro"
import { prepareImage, StatusPanel, type ReviewSeed } from "@/components/nutrition/photo-estimate-panel"

type MenuApiResult =
  | { status: "unconfigured" }
  | { status: "not_menu" }
  | { status: "unreadable" }
  | { status: "error"; message: string }
  | { status: "ok"; analysis: MenuAnalysis }

type Phase = "idle" | "preparing" | "reading" | "results" | "failed"

/**
 * Menu-to-Macro: photograph a menu, get up to three ranked picks for today. A decision aid only — it never logs.
 * "Review as a meal estimate" hands a pick to the normal editable review, which logs only on confirmation.
 */
export function MenuPhotoPanel({ onReview, onClose }: { onReview: (seed: ReviewSeed) => void; onClose: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [analysis, setAnalysis] = useState<MenuAnalysis | null>(null)
  const [failure, setFailure] = useState<{ title: string; message: string } | null>(null)

  function fail(title: string, message: string) {
    setFailure({ title, message })
    setPhase("failed")
  }

  async function handleFile(file: File) {
    setPhase("preparing")
    let image: string
    try {
      image = await prepareImage(file)
    } catch (error) {
      return fail("This image couldn't be used", error instanceof Error ? error.message : "Try another photo.")
    }
    setPhase("reading")
    try {
      const response = await fetch("/api/nutrition/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok) return fail("Menu reading failed", data?.error ?? "Try again in a moment.")
      const result = data.result as MenuApiResult
      if (result.status === "unconfigured") return fail("Menu photo isn't set up yet", "This deployment hasn't configured a vision model.")
      if (result.status === "not_menu") return fail("That doesn't look like a menu", "Photograph the printed menu or menu board. To log a plate of food, use Food Photo instead.")
      if (result.status === "unreadable") return fail("No dish names could be read", "Try a sharper, closer photo with the dish names in focus and less glare.")
      if (result.status === "error") return fail("Menu reading unavailable", `${result.message} Try again in a moment.`)
      setAnalysis(result.analysis)
      setPhase("results")
    } catch {
      fail("Menu reading unavailable", "Check your connection and try again.")
    }
  }

  function onPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void handleFile(file)
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white">Menu photo</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Snap a restaurant menu and get the dishes that best fit what&apos;s left of your day. This helps you choose. It doesn&apos;t log anything.
        </p>
      </div>

      {phase === "idle" ? (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30">
            <Camera className="size-6 text-amber-400" />
            Photograph menu
          </button>
          <button type="button" onClick={() => uploadRef.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30">
            <Upload className="size-6 text-amber-400" />
            Upload menu
          </button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Photograph a menu" onChange={onPicked} />
          <input ref={uploadRef} type="file" accept="image/*" className="hidden" aria-label="Upload a menu photo" onChange={onPicked} />
        </div>
      ) : null}

      {phase === "preparing" || phase === "reading" ? (
        <div role="status" className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-zinc-400">
          <Loader2 className="size-6 animate-spin text-amber-400" />
          {phase === "preparing" ? "Preparing photo…" : "Reading the menu…"}
        </div>
      ) : null}

      {phase === "failed" && failure ? <StatusPanel title={failure.title} message={failure.message} onRetry={() => setPhase("idle")} retryLabel="Try another menu photo" /> : null}

      {phase === "results" && analysis ? (
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-xs text-zinc-500">
            Read {analysis.dishesRead} dish{analysis.dishesRead === 1 ? "" : "es"} from the menu{analysis.readability === "partial" ? " (part of the menu wasn't readable)" : ""}.
          </p>

          {analysis.recommendations.length === 0 ? (
            <StatusPanel title="No dish could be recommended" message="None of the dishes read could be estimated or passed your allergy check. Nothing was logged." />
          ) : (
            <ol className="space-y-3">
              {analysis.recommendations.map((rec, index) => (
                <li key={rec.slot} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="menu-recommendation">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-400">
                    {index + 1}. {rec.label}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">On the menu</p>
                  <p className="break-words text-base font-bold text-white">{rec.option.menu.name}</p>
                  {rec.option.menu.description || rec.option.menu.price ? (
                    <p className="break-words text-xs text-zinc-400">
                      {[rec.option.menu.description, rec.option.menu.price].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Our estimate (not the restaurant&apos;s data)</p>
                  <p className="text-sm font-semibold text-white">
                    {rec.option.estimate!.calories.low}–{rec.option.estimate!.calories.high} kcal · {rec.option.estimate!.protein.low}–{rec.option.estimate!.protein.high} g protein
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-zinc-300">{rec.why}</p>
                  {rec.modifications.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-zinc-300">
                      {rec.modifications.map((tip) => (
                        <li key={tip} className="break-words">{tip}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-2 break-words text-xs leading-4 text-zinc-500">{rec.uncertainty}</p>
                  <button
                    type="button"
                    onClick={() =>
                      onReview({
                        title: `${rec.option.menu.name} (menu estimate)`,
                        note: "You haven't logged this. Adjust it to what you actually ate, then confirm.",
                        items: rec.option.prefill,
                        cookingOil: getLocalFallbackById("local-olive-oil"),
                      })
                    }
                    className="mt-3 min-h-10 w-full rounded-lg border border-amber-400/40 text-xs font-bold text-amber-300 hover:bg-amber-400/10"
                  >
                    I ate this — review as an estimate
                  </button>
                </li>
              ))}
            </ol>
          )}

          {analysis.excluded.length > 0 ? (
            <p className="break-words text-xs text-zinc-400">
              Left out for your allergies/exclusions: {analysis.excluded.map((e) => `${e.name} (${e.term})`).join(", ")}.
            </p>
          ) : null}
          {analysis.notEstimated.length > 0 ? (
            <p className="break-words text-xs text-zinc-500">Couldn&apos;t estimate: {analysis.notEstimated.join(", ")}.</p>
          ) : null}
          {analysis.limitations.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
              {analysis.limitations.map((line) => (
                <li key={line} className="break-words">{line}</li>
              ))}
            </ul>
          ) : null}

          <button type="button" onClick={() => setPhase("idle")} className="text-xs font-semibold text-zinc-400 underline underline-offset-4">
            Use a different menu photo
          </button>
        </div>
      ) : null}

      <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/10 text-sm font-semibold text-zinc-400 hover:bg-white/5">
        {phase === "results" ? "Done" : "Cancel"}
      </button>
    </div>
  )
}
