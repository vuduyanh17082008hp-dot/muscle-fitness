"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CheckCircle2, Loader2 } from "lucide-react";

import type { RecoveryCheckinRow } from "@/lib/recovery/types";
import { cn } from "@/lib/utils";

type SliderField = {
  key:
    | "sleepQuality"
    | "stress"
    | "fatigue"
    | "soreness"
    | "mood"
    | "readiness";
  label: string;
  helper: string;
};

const SLIDER_FIELDS: SliderField[] = [
  { key: "sleepQuality", label: "Sleep quality", helper: "1 = very poor, 10 = excellent" },
  { key: "stress", label: "Stress", helper: "1 = very calm, 10 = very stressed" },
  { key: "fatigue", label: "Fatigue", helper: "1 = fresh, 10 = exhausted" },
  { key: "soreness", label: "Soreness", helper: "1 = none, 10 = severe" },
  { key: "mood", label: "Mood", helper: "1 = very low, 10 = very good" },
  { key: "readiness", label: "Readiness to train", helper: "1 = not ready, 10 = fully ready" },
];

type FormState = {
  sleepHours: string;
  sleepQuality: number;
  stress: number;
  fatigue: number;
  soreness: number;
  mood: number;
  readiness: number;
  restingHr: string;
  steps: string;
  painIllness: "no" | "minor" | "yes";
  notes: string;
};

function initialState(existing: RecoveryCheckinRow | null): FormState {
  return {
    sleepHours: existing?.sleep_hours?.toString() ?? "",
    sleepQuality: existing?.sleep_quality ?? 6,
    stress: existing?.stress ?? 5,
    fatigue: existing?.fatigue ?? 5,
    soreness: existing?.soreness ?? 4,
    mood: existing?.mood ?? 6,
    readiness: existing?.readiness ?? 6,
    restingHr: existing?.resting_hr?.toString() ?? "",
    steps: existing?.steps?.toString() ?? "",
    painIllness: existing?.pain_illness ?? "no",
    notes: existing?.notes ?? "",
  };
}

export function RecoveryCheckinForm({
  existing,
}: {
  existing: RecoveryCheckinRow | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(existing));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/recovery/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleepHours: form.sleepHours ? Number(form.sleepHours) : null,
          sleepQuality: form.sleepQuality,
          stress: form.stress,
          fatigue: form.fatigue,
          soreness: form.soreness,
          mood: form.mood,
          readiness: form.readiness,
          restingHr: form.restingHr ? Number(form.restingHr) : null,
          steps: form.steps ? Number(form.steps) : null,
          painIllness: form.painIllness,
          notes: form.notes || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to save check-in.");
      }

      setSuccess(true);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save check-in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-white/10 bg-[#0d0f12] p-6 sm:p-8"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            Daily Recovery Check-in
          </p>
          <h2 className="mt-1 text-xl font-black text-white">
            Under 30 seconds
          </h2>
        </div>

        {existing && (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            Logged today
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-zinc-400">
            Sleep hours
          </span>
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={form.sleepHours}
            onChange={(event) => update("sleepHours", event.target.value)}
            placeholder="e.g. 7.5"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-zinc-400">
            Resting heart rate (optional)
          </span>
          <input
            type="number"
            min={25}
            max={220}
            value={form.restingHr}
            onChange={(event) => update("restingHr", event.target.value)}
            placeholder="bpm"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
          />
        </label>
      </div>

      <div className="mt-6 space-y-5">
        {SLIDER_FIELDS.map((field) => (
          <div key={field.key}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                {field.label}
              </span>
              <span className="text-xs font-bold text-amber-300">
                {form[field.key]}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={form[field.key]}
              onChange={(event) =>
                update(field.key, Number(event.target.value))
              }
              className="mt-2 w-full accent-amber-400"
            />
            <p className="mt-1 text-[11px] text-zinc-600">{field.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-zinc-400">
            Steps (optional)
          </span>
          <input
            type="number"
            min={0}
            value={form.steps}
            onChange={(event) => update("steps", event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-semibold text-zinc-400">
            Unusual pain or illness
          </span>
          <div className="flex gap-2">
            {(["no", "minor", "yes"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => update("painIllness", option)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-3 text-xs font-bold uppercase tracking-wide transition",
                  form.painIllness === option
                    ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
                    : "border-white/10 bg-black/20 text-zinc-500 hover:border-white/20",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-xs font-semibold text-zinc-400">
          Notes (optional)
        </span>
        <textarea
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          maxLength={600}
          rows={2}
          placeholder="Anything else worth remembering about today?"
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/40"
        />
      </label>

      {error && (
        <p className="mt-4 text-sm text-rose-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : success ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : null}
        {existing ? "Update check-in" : "Save check-in"}
      </button>
    </form>
  );
}
