"use client";

import { useId, useRef, useState } from "react";
import { Camera, Loader2, Upload } from "lucide-react";

import { MEAL_TYPES, MEAL_TYPE_LABEL, type MealType } from "@/lib/nutrition/food-log/types";
import type { HawkerLensResult } from "@/lib/hawkerlens/types";

/**
 * HawkerLens SG scan panel — mirrors the structure of
 * photo-estimate-panel.tsx (same modal, same "AI identifies, database
 * grounds, user confirms" flow), but shows dish-level classification,
 * per-component confidence, and — critically, per spec §8 — a
 * calorie/protein RANGE, never a bare point estimate.
 */

type PanelPhase = "idle" | "uploading" | "analyzing" | "results" | "unavailable" | "error";

type EditableComponent = {
  name: string;
  grams: number;
  confidence: number;
  per100g: { calories: number; protein: number; carbs: number; fat: number };
  included: boolean;
  idempotencyKey: string;
  /** Server confirmed this row exists — locked, never resent. */
  saved?: boolean;
  saveError?: string;
};

type HawkerLensPanelProps = {
  mealType: MealType;
  onMealTypeChange: (mealType: MealType) => void;
  /** Rows were written (fully or partly) — the tracker should re-read the day. */
  onLogChanged: () => void;
  /** Every included component is saved. */
  onSaved: () => void;
  onSwitchToPhotoEstimate: () => void;
  onClose: () => void;
};

function confidenceLabel(value: number): string {
  if (value >= 0.7) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

export function HawkerLensPanel({
  mealType,
  onMealTypeChange,
  onLogChanged,
  onSaved,
  onSwitchToPhotoEstimate,
  onClose,
}: HawkerLensPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<PanelPhase>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<HawkerLensResult | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [components, setComponents] = useState<EditableComponent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const mealSelectId = useId();
  const anySaved = components.some((c) => c.saved);

  async function handleFile(file: File) {
    setPhase("uploading");

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    setPhase("analyzing");

    try {
      const response = await fetch("/api/hawkerlens/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setStatusMessage(data.error ?? "HawkerLens is temporarily unavailable.");
        setPhase("error");
        return;
      }

      const hawkerResult = data.result as HawkerLensResult;
      setResult(hawkerResult);
      setScanId(data.scanId ?? null);

      if (hawkerResult.status !== "ok") {
        setStatusMessage(hawkerResult.message);
        setPhase("unavailable");
        return;
      }

      setComponents(
        hawkerResult.componentDetail.map((c) => ({
          name: c.name,
          grams: c.estimatedGrams,
          confidence: c.confidence,
          idempotencyKey: crypto.randomUUID(),
          per100g: {
            calories: (c.calories.estimate / c.estimatedGrams) * 100,
            protein: (c.protein.estimate / c.estimatedGrams) * 100,
            carbs: (c.carbs.estimate / c.estimatedGrams) * 100,
            fat: (c.fat.estimate / c.estimatedGrams) * 100,
          },
          included: true,
        })),
      );
      setPhase("results");
    } catch {
      setStatusMessage("HawkerLens is temporarily unavailable.");
      setPhase("error");
    }
  }

  function updateGrams(index: number, grams: number) {
    setComponents((current) =>
      current.map((c, i) => (i === index ? { ...c, grams: Math.max(1, grams) } : c)),
    );
  }

  function toggleIncluded(index: number) {
    setComponents((current) =>
      current.map((c, i) => (i === index ? { ...c, included: !c.included } : c)),
    );
  }

  async function handleConfirm() {
    if (!result || !result.dish) return;

    // Only unsaved items are (re)sent, each under its original key, so a retry
    // can never duplicate a row that already exists.
    const included = components.filter((c) => c.included && !c.saved);
    if (included.length === 0) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/hawkerlens/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId,
          dish: result.dish,
          mealType,
          components: included.map((c) => ({
            name: c.name,
            grams: c.grams,
            per100g: c.per100g,
            confidence: c.confidence,
            idempotencyKey: c.idempotencyKey,
          })),
        }),
      });

      const data = await response.json();
      const results: Array<{ idempotencyKey: string; ok: boolean; error?: string }> = Array.isArray(data.results)
        ? data.results
        : [];

      if (data.status === "complete") {
        onLogChanged();
        onSaved();
        return;
      }

      if (results.length === 0) {
        setSaveMessage(data.error ?? "Could not save this meal. Nothing was added — try again.");
        return;
      }

      const byKey = new Map(results.map((r) => [r.idempotencyKey, r]));
      setComponents((current) =>
        current.map((c) => {
          const r = byKey.get(c.idempotencyKey);
          if (!r) return c;
          return r.ok ? { ...c, saved: true, saveError: undefined } : { ...c, saveError: r.error ?? "Not saved." };
        }),
      );

      if (data.status === "partial") {
        onLogChanged();
        setSaveMessage("Partially saved — only the items marked Saved were added. Retry adds just the rest.");
      } else {
        setSaveMessage("Nothing was saved. Retry when ready — no duplicates will be created.");
      }
    } catch {
      // The request may or may not have reached the server; keys are unchanged,
      // so retrying is safe either way.
      setSaveMessage("Network error — save status unknown. Retry is safe and won't duplicate items.");
      onLogChanged();
    } finally {
      setSaving(false);
    }
  }

  const totals = components
    .filter((c) => c.included)
    .reduce(
      (acc, c) => ({
        calories: acc.calories + (c.per100g.calories * c.grams) / 100,
        protein: acc.protein + (c.per100g.protein * c.grams) / 100,
      }),
      { calories: 0, protein: 0 },
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white">HawkerLens SG</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Recognizes common Singapore hawker dishes (chicken rice, cai png, nasi lemak, laksa
          and more) and breaks them into components. Estimates are ranges, not exact numbers —
          edit anything before adding.
        </p>
      </div>

      {phase === "idle" ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30"
          >
            <Camera className="size-6 text-amber-400" />
            Take photo
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-white hover:border-amber-400/30"
          >
            <Upload className="size-6 text-amber-400" />
            Upload image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
      ) : null}

      {phase === "uploading" || phase === "analyzing" ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-zinc-400">
          <Loader2 className="size-6 animate-spin text-amber-400" />
          {phase === "uploading" ? "Preparing photo…" : "Analyzing dish…"}
        </div>
      ) : null}

      {phase === "unavailable" || phase === "error" ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <p className="text-sm font-bold text-amber-300">
            {phase === "unavailable" ? "Couldn't get a confident result" : "Something went wrong"}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{statusMessage}</p>
          <button
            type="button"
            onClick={onSwitchToPhotoEstimate}
            className="mt-3 text-xs font-semibold text-amber-400 underline underline-offset-4"
          >
            Try the general Photo Estimate instead
          </button>
        </div>
      ) : null}

      {phase === "results" && result?.status === "ok" ? (
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Meal
            </span>
            <select
              id={mealSelectId}
              value={mealType}
              onChange={(event) => onMealTypeChange(event.target.value as MealType)}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white"
            >
              {MEAL_TYPES.map((meal) => (
                <option key={meal} value={meal}>
                  {MEAL_TYPE_LABEL[meal]}
                </option>
              ))}
            </select>
          </label>

          {result.isDemo ? (
            <div className="rounded-2xl border border-sky-400/25 bg-sky-400/5 p-3">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-sky-300">
                Demo mode — not a real analysis
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">{result.message}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
              {result.dish?.replace(/_/g, " ")}
            </p>
            <span className="text-xs text-zinc-500">
              {Math.round(result.overallConfidence * 100)}% confidence
            </span>
          </div>

          <ul className="space-y-3">
            {components.map((component, index) => (
              <li
                key={`${component.name}-${index}`}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={component.included}
                        disabled={component.saved}
                        onChange={() => toggleIncluded(index)}
                        className="size-4"
                      />
                      <span className="font-semibold capitalize text-white">{component.name}</span>
                      {component.saved ? (
                        <span className="text-xs font-bold text-emerald-400">Saved</span>
                      ) : component.saveError ? (
                        <span className="text-xs font-bold text-red-400">Not saved</span>
                      ) : null}
                    </label>
                    <p className="mt-1 text-xs text-zinc-500">
                      Confidence: {confidenceLabel(component.confidence)}
                    </p>
                    {component.saveError && !component.saved ? (
                      <p className="mt-1 text-xs text-red-400">{component.saveError}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-zinc-500">~</span>
                    <input
                      type="number"
                      value={component.grams}
                      disabled={component.saved}
                      onChange={(event) => updateGrams(index, Number(event.target.value) || 0)}
                      className="h-9 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-center text-sm text-white"
                      aria-label={`Grams for ${component.name}`}
                    />
                    <span className="text-xs text-zinc-500">g</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-amber-400">
              Estimated calories
            </p>
            <p className="text-lg font-black text-white">{Math.round(totals.calories)} kcal</p>
            <p className="text-xs text-zinc-500">
              Likely range: {result.nutrition?.calories.lower}–{result.nutrition?.calories.upper}{" "}
              kcal
            </p>
            <p className="mt-2 text-sm text-white">{Math.round(totals.protein)} g protein</p>
            <p className="text-xs text-zinc-500">
              Likely range: {result.nutrition?.protein.lower}–{result.nutrition?.protein.upper} g
            </p>
          </div>

          {saveMessage ? (
            <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-200">
              {saveMessage}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || result.isDemo || !components.some((c) => c.included && !c.saved)}
            title={result.isDemo ? "Demo results can't be logged — connect a vision model to analyze real photos." : undefined}
            className="min-h-12 rounded-xl bg-amber-500 text-sm font-black uppercase tracking-wide text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : result.isDemo
                ? "Demo — logging disabled"
                : saveMessage
                  ? "Retry failed items"
                  : "Confirm & Add"}
          </button>
          {anySaved ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-white/10 text-sm font-semibold text-zinc-300 hover:bg-white/5"
            >
              Done — keep saved items only
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="min-h-11 rounded-xl border border-white/10 text-sm font-semibold text-zinc-400 hover:bg-white/5"
      >
        Cancel
      </button>
    </div>
  );
}
