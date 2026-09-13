"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

import {
  completeOnboardingAction,
  saveOnboardingDraftAction,
} from "@/app/onboarding/actions";

import {
  defaultOnboardingData,
  type OnboardingData,
  type OnboardingDraftData,
  type TrainingStyle,
} from "@/features/onboarding/schema";

/* =========================================================
   TYPES
========================================================= */

type Gender = OnboardingData["personal"]["gender"];
type Goal = OnboardingData["goal"]["goal"];
type Experience = OnboardingData["training"]["experience"];

type ShortFormState = {
  age: number | null;
  gender: Gender | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: Goal | null;
  trainingStyle: TrainingStyle | null;
  trainingDays: number | null;
  experience: Experience;
  physicalLimitations: string;
  foodPreferencesText: string;
};

type ShortOnboardingWizardProps = {
  userId: string;
  userFullName: string | null;
  userEmail: string | null;
  initialStep: number;
  initialData?: OnboardingDraftData;
};

/* =========================================================
   CONSTANTS
========================================================= */

const TOTAL_STEPS = 5;

const GOAL_OPTIONS: Array<{ value: Goal; label: string }> = [
  { value: "muscle_gain", label: "Build Muscle" },
  { value: "fat_loss", label: "Lose Fat" },
  { value: "performance", label: "Strength" },
  { value: "maintenance", label: "Endurance" },
  { value: "body_recomposition", label: "General Fitness" },
];

const TRAINING_STYLE_OPTIONS: Array<{ value: TrainingStyle; label: string }> = [
  { value: "strength", label: "Strength" },
  { value: "bodybuilding", label: "Bodybuilding" },
  { value: "hybrid", label: "Hybrid" },
  { value: "running", label: "Running" },
  { value: "general", label: "General Fitness" },
];

const TRAINING_DAYS_OPTIONS = [2, 3, 4, 5, 6];

const EXPERIENCE_OPTIONS: Array<{ value: Experience; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/* =========================================================
   HELPERS
========================================================= */

function ageToDateOfBirth(age: number): string {
  const year = new Date().getFullYear() - age;
  return `${year}-06-15`;
}

function dateOfBirthToAge(dateOfBirth: string | undefined): number | null {
  if (!dateOfBirth) return null;
  const birthYear = Number.parseInt(dateOfBirth.slice(0, 4), 10);
  if (Number.isNaN(birthYear)) return null;
  return new Date().getFullYear() - birthYear;
}

function parseFoodPreferences(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 30);
}

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Singapore";
  } catch {
    return "Asia/Singapore";
  }
}

function deriveFullName(userFullName: string | null, userEmail: string | null): string {
  const trimmed = userFullName?.trim();
  if (trimmed && trimmed.length >= 2) return trimmed;

  const emailPrefix = userEmail?.split("@")[0]?.trim();
  if (emailPrefix && emailPrefix.length >= 2) return emailPrefix;

  return "Athlete";
}

/** Reconstructs the short-wizard's lightweight state from whatever partial draft data exists (written by either wizard, since they share one draft row). */
function stateFromDraft(draft: OnboardingDraftData | undefined): ShortFormState {
  return {
    age: dateOfBirthToAge(draft?.personal?.dateOfBirth),
    gender: draft?.personal?.gender ?? null,
    heightCm: draft?.personal?.heightCm ?? null,
    weightKg: draft?.personal?.weightKg ?? null,
    goal: draft?.goal?.goal ?? null,
    trainingStyle: draft?.training?.trainingStyle ?? null,
    trainingDays: draft?.training?.trainingDays ?? null,
    experience: draft?.training?.experience ?? "beginner",
    physicalLimitations: draft?.training?.physicalLimitations ?? "",
    foodPreferencesText: (draft?.nutrition?.foodPreferences ?? []).join(", "),
  };
}

/** First unanswered required question, so refreshing mid-flow resumes in the right place regardless of which wizard last wrote the draft. */
function computeStartStep(state: ShortFormState, hasAnyDraft: boolean): number {
  if (!hasAnyDraft) return 0;
  if (state.age === null || state.gender === null || state.heightCm === null || state.weightKg === null) {
    return 1;
  }
  if (state.goal === null) return 2;
  if (state.trainingStyle === null) return 3;
  if (state.trainingDays === null) return 4;
  return 5;
}

function buildFullOnboardingData(
  state: ShortFormState,
  fullName: string,
  timezone: string,
): OnboardingData {
  return {
    personal: {
      fullName,
      dateOfBirth: state.age !== null ? ageToDateOfBirth(state.age) : defaultOnboardingData.personal.dateOfBirth,
      gender: state.gender ?? defaultOnboardingData.personal.gender,
      heightCm: state.heightCm ?? defaultOnboardingData.personal.heightCm,
      weightKg: state.weightKg ?? defaultOnboardingData.personal.weightKg,
      timezone,
    },
    goal: {
      goal: state.goal ?? defaultOnboardingData.goal.goal,
    },
    training: {
      ...defaultOnboardingData.training,
      trainingStyle: state.trainingStyle ?? defaultOnboardingData.training.trainingStyle,
      trainingDays: state.trainingDays ?? defaultOnboardingData.training.trainingDays,
      experience: state.experience,
      physicalLimitations: state.physicalLimitations.trim().slice(0, 500),
    },
    nutrition: {
      ...defaultOnboardingData.nutrition,
      foodPreferences: parseFoodPreferences(state.foodPreferencesText),
    },
    lifestyle: {
      ...defaultOnboardingData.lifestyle,
      workSchedule: "Not specified",
    },
  };
}

/* =========================================================
   SMALL UI PRIMITIVES
========================================================= */

function StepShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-500">{eyebrow}</p>
      <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-14 w-full items-center justify-between rounded-2xl border px-5 text-left text-sm font-semibold transition-colors duration-200 ${
        selected
          ? "border-amber-400/60 bg-amber-400/10 text-white"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"
      }`}
    >
      {label}
      {selected ? <span className="text-amber-400">✓</span> : null}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
          className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-base font-semibold text-white outline-none focus:border-amber-400/60 focus:ring-4 focus:ring-amber-400/10"
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-zinc-500">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function ProgressIndicator({ step }: { step: number }) {
  return (
    <div className="mx-auto mb-8 w-full max-w-md">
      <div className="flex items-center justify-between text-xs font-bold text-zinc-500">
        <span>
          {step} / {TOTAL_STEPS}
        </span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              index < step ? "bg-amber-400" : "bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function NavButtons({
  onBack,
  onContinue,
  continueLabel = "Continue",
  continueDisabled,
  loading,
}: {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="mx-auto mt-8 flex w-full max-w-md gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="h-14 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06]"
        >
          Back
        </button>
      ) : null}
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled || loading}
        className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-2xl bg-amber-400 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {continueLabel}
      </button>
    </div>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export function ShortOnboardingWizard({
  userFullName,
  userEmail,
  initialData,
}: ShortOnboardingWizardProps) {
  const router = useRouter();

  const initialFormState = useMemo(() => stateFromDraft(initialData), [initialData]);
  const hasAnyDraft = Boolean(initialData);

  const [step, setStep] = useState(() => computeStartStep(initialFormState, hasAnyDraft));
  const [form, setForm] = useState<ShortFormState>(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const timezoneRef = useRef(detectBrowserTimezone());
  const fullNameRef = useRef(deriveFullName(userFullName, userEmail));

  function update<K extends keyof ShortFormState>(key: K, value: ShortFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function persistDraft(nextStep: number, nextForm: ShortFormState) {
    const snapshot = buildFullOnboardingData(nextForm, fullNameRef.current, timezoneRef.current);
    void saveOnboardingDraftAction({
      currentStep: Math.min(nextStep, 5),
      data: snapshot,
    });
  }

  function goNext() {
    setErrorMessage(null);
    const nextStep = step + 1;
    persistDraft(nextStep, form);
    setStep(nextStep);
  }

  function goBack() {
    setErrorMessage(null);
    setStep((current) => Math.max(0, current - 1));
  }

  async function finish() {
    setErrorMessage(null);
    setSubmitting(true);

    const fullData = buildFullOnboardingData(form, fullNameRef.current, timezoneRef.current);
    const result = await completeOnboardingAction(fullData);

    setSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.message);
      return;
    }

    setCompleted(true);
    setStep(6);
  }

  useEffect(() => {
    if (completed) {
      router.prefetch("/dashboard");
    }
  }, [completed, router]);

  /* =======================================================
     STEP 0 — WELCOME
  ======================================================= */

  if (step === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-500">
          Welcome to Muscle Fitness
        </p>

        <h1 className="mt-4 max-w-sm text-3xl font-bold leading-tight text-white sm:text-4xl">
          Train smarter.
          <br />
          Recover better.
          <br />
          Know what to do next.
        </h1>

        <button
          type="button"
          onClick={() => setStep(1)}
          className="mt-10 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-amber-400 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-300"
        >
          Get started
          <ArrowRight className="size-4" />
        </button>
      </div>
    );
  }

  /* =======================================================
     STEP 6 — COMPLETE
  ======================================================= */

  if (step === 6 || completed) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <span className="grid size-16 place-items-center rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400">
          <Sparkles className="size-7" />
        </span>

        <h1 className="mt-6 text-2xl font-bold text-white sm:text-3xl">
          Your profile is ready
        </h1>

        <div className="mt-6 flex flex-col gap-2 text-sm text-zinc-300">
          <p>Training profile ✓</p>
          <p>Nutrition targets ✓</p>
          <p>Recovery baseline ✓</p>
        </div>

        <p className="mt-8 max-w-xs text-sm leading-6 text-zinc-500">
          Meet Dante — your training and nutrition guide, built on your profile.
        </p>

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-8 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-amber-400 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-300"
        >
          Enter Muscle Fitness
        </button>
      </div>
    );
  }

  /* =======================================================
     STEP 1 — PERSONAL
  ======================================================= */

  if (step === 1) {
    const genderOptions: Array<{ value: Gender; label: string }> = [
      { value: "male", label: "Male" },
      { value: "female", label: "Female" },
      { value: "prefer_not_to_say", label: "Prefer not to say" },
    ];

    const isValid =
      form.age !== null &&
      form.age >= 13 &&
      form.age <= 100 &&
      form.gender !== null &&
      form.heightCm !== null &&
      form.weightKg !== null;

    return (
      <>
        <ProgressIndicator step={1} />
        <StepShell eyebrow="1 / 5" title="Tell us about yourself">
          <div className="flex flex-col gap-5">
            <NumberField label="Age" value={form.age} onChange={(v) => update("age", v)} min={13} max={100} />

            <div>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
                Sex
              </span>
              <div className="flex flex-col gap-2">
                {genderOptions.map((option) => (
                  <ChoiceButton
                    key={option.value}
                    label={option.label}
                    selected={form.gender === option.value}
                    onClick={() => update("gender", option.value)}
                  />
                ))}
              </div>
            </div>

            <NumberField
              label="Height"
              value={form.heightCm}
              onChange={(v) => update("heightCm", v)}
              min={80}
              max={250}
              suffix="cm"
            />

            <NumberField
              label="Weight"
              value={form.weightKg}
              onChange={(v) => update("weightKg", v)}
              min={20}
              max={400}
              suffix="kg"
            />
          </div>
        </StepShell>
        <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={!isValid} />
      </>
    );
  }

  /* =======================================================
     STEP 2 — GOAL
  ======================================================= */

  if (step === 2) {
    return (
      <>
        <ProgressIndicator step={2} />
        <StepShell eyebrow="2 / 5" title="What's your goal?">
          <div className="flex flex-col gap-2">
            {GOAL_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                selected={form.goal === option.value}
                onClick={() => update("goal", option.value)}
              />
            ))}
          </div>
        </StepShell>
        <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={form.goal === null} />
      </>
    );
  }

  /* =======================================================
     STEP 3 — TRAINING STYLE
  ======================================================= */

  if (step === 3) {
    return (
      <>
        <ProgressIndicator step={3} />
        <StepShell eyebrow="3 / 5" title="How do you train?">
          <div className="flex flex-col gap-2">
            {TRAINING_STYLE_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.value}
                label={option.label}
                selected={form.trainingStyle === option.value}
                onClick={() => update("trainingStyle", option.value)}
              />
            ))}
          </div>
        </StepShell>
        <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={form.trainingStyle === null} />
      </>
    );
  }

  /* =======================================================
     STEP 4 — FREQUENCY
  ======================================================= */

  if (step === 4) {
    return (
      <>
        <ProgressIndicator step={4} />
        <StepShell eyebrow="4 / 5" title="How often do you train?">
          <div className="flex flex-col gap-2">
            {TRAINING_DAYS_OPTIONS.map((days) => (
              <ChoiceButton
                key={days}
                label={days === 6 ? "6+ days" : `${days} days`}
                selected={form.trainingDays === days}
                onClick={() => update("trainingDays", days)}
              />
            ))}
          </div>
        </StepShell>
        <NavButtons onBack={goBack} onContinue={goNext} continueDisabled={form.trainingDays === null} />
      </>
    );
  }

  /* =======================================================
     STEP 5 — ANYTHING WE SHOULD KNOW
  ======================================================= */

  return (
    <>
      <ProgressIndicator step={5} />
      <StepShell eyebrow="5 / 5" title="Anything we should know?">
        <div className="flex flex-col gap-6">
          <div>
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
              Experience
            </span>
            <div className="flex flex-col gap-2">
              {EXPERIENCE_OPTIONS.map((option) => (
                <ChoiceButton
                  key={option.value}
                  label={option.label}
                  selected={form.experience === option.value}
                  onClick={() => update("experience", option.value)}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
              Food preferences <span className="text-zinc-700">(optional)</span>
            </span>
            <input
              type="text"
              value={form.foodPreferencesText}
              onChange={(event) => update("foodPreferencesText", event.target.value)}
              placeholder="e.g. vegetarian, no dairy, halal"
              className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-amber-400/60 focus:ring-4 focus:ring-amber-400/10"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
              Movement limitations or notes <span className="text-zinc-700">(optional)</span>
            </span>
            <textarea
              value={form.physicalLimitations}
              onChange={(event) => update("physicalLimitations", event.target.value)}
              placeholder="Any injuries, limitations, or anything else we should know"
              rows={3}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-amber-400/60 focus:ring-4 focus:ring-amber-400/10"
            />
          </label>

          {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}
        </div>
      </StepShell>

      <NavButtons
        onBack={goBack}
        onContinue={() => void finish()}
        continueLabel="Continue"
        loading={submitting}
      />
    </>
  );
}
