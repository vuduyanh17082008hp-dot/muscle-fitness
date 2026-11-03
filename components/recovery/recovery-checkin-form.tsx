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
  // Opened once from what is already saved; never re-driven by typing (clearing a field must not collapse it).
  const [optionalOpen] = useState(() => Boolean(existing?.resting_hr || existing?.steps || existing?.notes));

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
      id="checkin"
      onSubmit={handleSubmit}
      className="mf-touch-inputs scroll-mt-24 rounded-2xl border-2 border-mf-glass-text bg-mf-glass-surface p-5 sm:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">
            Daily Recovery Check-in
          </p>
          <h2 className="mt-1 font-heading text-3xl font-black uppercase leading-none tracking-tight text-mf-glass-text">
            Under 30 seconds
          </h2>
        </div>

        {existing && (
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
            Logged today
          </span>
        )}
      </div>

      {/* V4 compact layout. Same fields, same payload; pain/illness leads because it is the one that holds training. */}
      <fieldset className="mt-6">
        <legend className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary">Unusual pain or illness</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["no", "minor", "yes"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={form.painIllness === option}
              onClick={() => update("painIllness", option)}
              className={cn(
                "min-h-12 rounded-md border-2 px-3 font-heading text-lg font-bold uppercase tracking-[0.06em] transition",
                form.painIllness !== option
                  ? "border-mf-glass-border-strong bg-mf-glass-surface text-mf-glass-text-secondary hover:border-mf-glass-text"
                  : option === "yes"
                  ? "border-amber-400 bg-amber-400 text-mf-glass-bg"
                  : "border-mf-glass-text bg-mf-glass-text text-mf-glass-bg",
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-mf-glass-text-muted">&ldquo;Yes&rdquo; puts today&apos;s training on hold until you clear it.</p>
      </fieldset>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary">
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
            className="w-full rounded-md border border-mf-glass-border bg-mf-glass-surface px-4 py-3 text-base text-mf-glass-text outline-none placeholder:text-mf-glass-text-muted focus:border-mf-glass-brand-border"
          />
        </label>

      </div>

      <div className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {SLIDER_FIELDS.map((field) => (
          <div key={field.key}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary">
                {field.label}
              </span>
              <span className="min-w-9 rounded border border-mf-glass-text px-1.5 text-center font-heading text-lg font-bold leading-6 tabular-nums text-mf-glass-text">
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
              aria-label={field.label}
              aria-valuetext={`${form[field.key]} of 10`}
              className="h-11 w-full cursor-pointer accent-mf-glass-text"
            />
            <p className="text-xs text-mf-glass-text-muted">{field.helper}</p>
          </div>
        ))}
      </div>

      <details
        open={optionalOpen || undefined}
        className="mt-6 rounded-md border border-mf-glass-border bg-mf-glass-bg px-4 py-1"
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-mf-glass-text">
          Optional: resting heart rate, steps, notes
        </summary>
      <div className="mb-3 mt-2 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary">
            Resting heart rate
          </span>
          <input
            type="number"
            min={25}
            max={220}
            value={form.restingHr}
            onChange={(event) => update("restingHr", event.target.value)}
            placeholder="bpm"
            className="w-full rounded-md border border-mf-glass-border bg-mf-glass-surface px-4 py-3 text-base text-mf-glass-text outline-none placeholder:text-mf-glass-text-muted focus:border-mf-glass-brand-border"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary">
            Steps
          </span>
          <input
            type="number"
            min={0}
            value={form.steps}
            onChange={(event) => update("steps", event.target.value)}
            className="w-full rounded-md border border-mf-glass-border bg-mf-glass-surface px-4 py-3 text-base text-mf-glass-text outline-none placeholder:text-mf-glass-text-muted focus:border-mf-glass-brand-border"
          />
        </label>

      </div>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-mf-glass-text-secondary">
          Notes
        </span>
        <textarea
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          maxLength={600}
          rows={2}
          placeholder="Anything else worth remembering about today?"
          className="w-full resize-none rounded-md border border-mf-glass-border bg-mf-glass-surface px-4 py-3 text-base text-mf-glass-text outline-none placeholder:text-mf-glass-text-muted focus:border-mf-glass-brand-border"
        />
      </label>
      </details>

      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-rose-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-mf-glass-text bg-mf-glass-brand px-6 font-heading text-lg font-bold uppercase tracking-[0.06em] text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
