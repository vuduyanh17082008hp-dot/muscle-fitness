"use client"

import {
  useEffect,
  useMemo,
  useState,
} from "react"

import { useRouter } from "next/navigation"

import {
  completeOnboardingAction,
  saveOnboardingDraftAction,
  type OnboardingInput,
} from "@/app/onboarding/actions"

import {
  defaultOnboardingData,
  onboardingSchema,
  onboardingStepSchemas,
  type OnboardingData,
  type OnboardingDraftData,
} from "@/features/onboarding/schema"

export type ProfileOnboardingProps = {
  userId: string
  initialStep?: number
  initialData?: OnboardingDraftData
}

const steps = [
  "Personal",
  "Goal",
  "Training",
  "Nutrition",
  "Lifestyle",
  "Review",
] as const

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10"

const labelClassName =
  "mb-2 block text-sm font-semibold text-zinc-300"

function mergeInitialData(
  initialData?: OnboardingDraftData,
): OnboardingData {
  return {
    personal: {
      ...defaultOnboardingData.personal,
      ...initialData?.personal,
    },

    goal: {
      ...defaultOnboardingData.goal,
      ...initialData?.goal,
    },

    training: {
      ...defaultOnboardingData.training,
      ...initialData?.training,

      availableEquipment:
        initialData?.training
          ?.availableEquipment ??
        defaultOnboardingData.training
          .availableEquipment,

      priorityMuscles:
        initialData?.training
          ?.priorityMuscles ??
        defaultOnboardingData.training
          .priorityMuscles,
    },

    nutrition: {
      ...defaultOnboardingData.nutrition,
      ...initialData?.nutrition,

      foodPreferences:
        initialData?.nutrition
          ?.foodPreferences ??
        defaultOnboardingData.nutrition
          .foodPreferences,

      excludedFoods:
        initialData?.nutrition
          ?.excludedFoods ??
        defaultOnboardingData.nutrition
          .excludedFoods,

      allergies:
        initialData?.nutrition
          ?.allergies ??
        defaultOnboardingData.nutrition
          .allergies,
    },

    lifestyle: {
      ...defaultOnboardingData.lifestyle,
      ...initialData?.lifestyle,
    },
  }
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    )
}

export default function ProfileOnboarding({
  userId,
  initialStep = 0,
  initialData,
}: ProfileOnboardingProps) {
  const router = useRouter()

  const storageKey = useMemo(
    () =>
      `muscle-fitness-onboarding-${userId}`,
    [userId],
  )

  const [step, setStep] = useState(
    Math.min(
      Math.max(initialStep, 0),
      steps.length - 1,
    ),
  )

  const [data, setData] =
    useState<OnboardingData>(() =>
      mergeInitialData(initialData),
    )

  const [isHydrated, setIsHydrated] =
    useState(false)

  const [isSaving, setIsSaving] =
    useState(false)

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false)

  const [message, setMessage] =
    useState<string | null>(null)

  useEffect(() => {
    try {
      const stored =
        window.localStorage.getItem(
          storageKey,
        )

      if (!stored) {
        return
      }

      const parsed = JSON.parse(
        stored,
      ) as {
        step?: number
        data?: OnboardingDraftData
      }

      if (parsed.data) {
        setData(
          mergeInitialData(parsed.data),
        )
      }

      if (
        typeof parsed.step === "number"
      ) {
        setStep(
          Math.min(
            Math.max(parsed.step, 0),
            steps.length - 1,
          ),
        )
      }
    } catch (error) {
      console.error(
        "Unable to restore local onboarding draft:",
        error,
      )
    } finally {
      setIsHydrated(true)
    }
  }, [storageKey])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        step,
        data,
      }),
    )

    const timeoutId =
      window.setTimeout(async () => {
        setIsSaving(true)

        try {
          const result =
            await saveOnboardingDraftAction(
              {
                currentStep: step,
                data,
              },
            )

          if (!result.success) {
            setMessage(
              result.message,
            )
          }
        } catch (error) {
          console.error(
            "Draft save error:",
            error,
          )
        } finally {
          setIsSaving(false)
        }
      }, 700)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    data,
    isHydrated,
    step,
    storageKey,
  ])

  function updatePersonal<
    Key extends keyof OnboardingData["personal"],
  >(
    key: Key,
    value: OnboardingData["personal"][Key],
  ) {
    setData((current) => ({
      ...current,
      personal: {
        ...current.personal,
        [key]: value,
      },
    }))

    setMessage(null)
  }

  function updateGoal<
    Key extends keyof OnboardingData["goal"],
  >(
    key: Key,
    value: OnboardingData["goal"][Key],
  ) {
    setData((current) => ({
      ...current,
      goal: {
        ...current.goal,
        [key]: value,
      },
    }))

    setMessage(null)
  }

  function updateTraining<
    Key extends keyof OnboardingData["training"],
  >(
    key: Key,
    value: OnboardingData["training"][Key],
  ) {
    setData((current) => ({
      ...current,
      training: {
        ...current.training,
        [key]: value,
      },
    }))

    setMessage(null)
  }

  function updateNutrition<
    Key extends keyof OnboardingData["nutrition"],
  >(
    key: Key,
    value: OnboardingData["nutrition"][Key],
  ) {
    setData((current) => ({
      ...current,
      nutrition: {
        ...current.nutrition,
        [key]: value,
      },
    }))

    setMessage(null)
  }

  function updateLifestyle<
    Key extends keyof OnboardingData["lifestyle"],
  >(
    key: Key,
    value: OnboardingData["lifestyle"][Key],
  ) {
    setData((current) => ({
      ...current,
      lifestyle: {
        ...current.lifestyle,
        [key]: value,
      },
    }))

    setMessage(null)
  }

  function validateCurrentStep() {
    if (step === 5) {
      return true
    }

    const stepData = [
      data.personal,
      data.goal,
      data.training,
      data.nutrition,
      data.lifestyle,
    ][step]

    const schema =
      onboardingStepSchemas[step]

    const result =
      schema.safeParse(stepData)

    if (!result.success) {
      setMessage(
        result.error.issues[0]
          ?.message ??
          "Please complete this step.",
      )

      return false
    }

    setMessage(null)
    return true
  }

  function goNext() {
    if (!validateCurrentStep()) {
      return
    }

    setStep((current) =>
      Math.min(
        current + 1,
        steps.length - 1,
      ),
    )

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
  }

  function goBack() {
    setMessage(null)

    setStep((current) =>
      Math.max(current - 1, 0),
    )

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    })
  }

  async function handleComplete() {
    const parsed =
      onboardingSchema.safeParse(data)

    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]
          ?.message ??
          "Please review your information.",
      )

      return
    }

    const confirmed =
      window.confirm(
        "Confirm and save your onboarding information?",
      )

    if (!confirmed) {
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    try {
      const result =
        await completeOnboardingAction(
          parsed.data as OnboardingInput,
        )

      if (!result.success) {
        setMessage(result.message)
        return
      }

      window.localStorage.removeItem(
        storageKey,
      )

      router.replace("/dashboard")
      router.refresh()
    } catch (error) {
      console.error(
        "Onboarding completion error:",
        error,
      )

      setMessage(
        "Something went wrong while completing onboarding.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const progress =
    ((step + 1) / steps.length) *
    100

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d0d] shadow-2xl shadow-black">
      <header className="border-b border-white/10 bg-gradient-to-r from-black via-zinc-900 to-black px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-500">
              Muscle Fitness
            </p>

            <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
              Build your foundation
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Complete your profile so the
              system can build your initial
              training and nutrition
              targets.
            </p>
          </div>

          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-600">
              Step {step + 1} of{" "}
              {steps.length}
            </p>

            <p className="mt-1 font-semibold text-zinc-300">
              {steps[step]}
            </p>
          </div>
        </div>

        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </header>

      <div className="px-6 py-8 sm:px-10 sm:py-10">
        {step === 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold">
                Personal information
              </h2>

              <p className="mt-2 text-sm text-zinc-500">
                Enter the information used
                to calculate your starting
                targets.
              </p>
            </div>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Full name
              </span>

              <input
                className={
                  inputClassName
                }
                value={
                  data.personal.fullName
                }
                onChange={(event) =>
                  updatePersonal(
                    "fullName",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Date of birth
              </span>

              <input
                type="date"
                className={
                  inputClassName
                }
                value={
                  data.personal
                    .dateOfBirth
                }
                onChange={(event) =>
                  updatePersonal(
                    "dateOfBirth",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Gender
              </span>

              <select
                className={
                  inputClassName
                }
                value={
                  data.personal.gender
                }
                onChange={(event) =>
                  updatePersonal(
                    "gender",
                    event.target
                      .value as OnboardingData["personal"]["gender"],
                  )
                }
              >
                <option value="male">
                  Male
                </option>

                <option value="female">
                  Female
                </option>

                <option value="non_binary">
                  Non-binary
                </option>

                <option value="prefer_not_to_say">
                  Prefer not to say
                </option>
              </select>
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Timezone
              </span>

              <input
                className={
                  inputClassName
                }
                value={
                  data.personal.timezone
                }
                onChange={(event) =>
                  updatePersonal(
                    "timezone",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Height in centimetres
              </span>

              <input
                type="number"
                min={80}
                max={250}
                className={
                  inputClassName
                }
                value={
                  data.personal.heightCm
                }
                onChange={(event) =>
                  updatePersonal(
                    "heightCm",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Weight in kilograms
              </span>

              <input
                type="number"
                min={20}
                max={400}
                step="0.1"
                className={
                  inputClassName
                }
                value={
                  data.personal.weightKg
                }
                onChange={(event) =>
                  updatePersonal(
                    "weightKg",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold">
              Primary goal
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Choose the goal that best
              represents your current
              direction.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                "fat_loss",
                "lean_bulk",
                "muscle_gain",
                "body_recomposition",
                "maintenance",
                "performance",
              ].map((goal) => {
                const selected =
                  data.goal.goal === goal

                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() =>
                      updateGoal(
                        "goal",
                        goal as OnboardingData["goal"]["goal"],
                      )
                    }
                    className={`rounded-2xl border p-5 text-left transition ${
                      selected
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <span className="font-bold text-white">
                      {formatLabel(goal)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold">
                Training profile
              </h2>
            </div>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Experience
              </span>

              <select
                className={
                  inputClassName
                }
                value={
                  data.training.experience
                }
                onChange={(event) =>
                  updateTraining(
                    "experience",
                    event.target
                      .value as OnboardingData["training"]["experience"],
                  )
                }
              >
                <option value="beginner">
                  Beginner
                </option>

                <option value="intermediate">
                  Intermediate
                </option>

                <option value="advanced">
                  Advanced
                </option>
              </select>
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Training location
              </span>

              <select
                className={
                  inputClassName
                }
                value={
                  data.training
                    .trainingLocation
                }
                onChange={(event) =>
                  updateTraining(
                    "trainingLocation",
                    event.target
                      .value as OnboardingData["training"]["trainingLocation"],
                  )
                }
              >
                <option value="gym">
                  Gym
                </option>

                <option value="home">
                  Home
                </option>

                <option value="hybrid">
                  Gym and home
                </option>
              </select>
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Training days per week
              </span>

              <input
                type="number"
                min={1}
                max={7}
                className={
                  inputClassName
                }
                value={
                  data.training
                    .trainingDays
                }
                onChange={(event) =>
                  updateTraining(
                    "trainingDays",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Session duration
              </span>

              <input
                type="number"
                min={20}
                max={300}
                className={
                  inputClassName
                }
                value={
                  data.training
                    .sessionDurationMinutes
                }
                onChange={(event) =>
                  updateTraining(
                    "sessionDurationMinutes",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Available equipment
              </span>

              <input
                className={
                  inputClassName
                }
                placeholder="Barbell, dumbbells, cables"
                value={data.training.availableEquipment.join(
                  ", ",
                )}
                onChange={(event) =>
                  updateTraining(
                    "availableEquipment",
                    parseList(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Priority muscles
              </span>

              <input
                className={
                  inputClassName
                }
                placeholder="Chest, side delts, upper back"
                value={data.training.priorityMuscles.join(
                  ", ",
                )}
                onChange={(event) =>
                  updateTraining(
                    "priorityMuscles",
                    parseList(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label className="md:col-span-2">
              <span
                className={
                  labelClassName
                }
              >
                Physical limitations
              </span>

              <textarea
                rows={4}
                className={
                  inputClassName
                }
                value={
                  data.training
                    .physicalLimitations
                }
                onChange={(event) =>
                  updateTraining(
                    "physicalLimitations",
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold">
                Nutrition
              </h2>
            </div>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Meals per day
              </span>

              <input
                type="number"
                min={1}
                max={8}
                className={
                  inputClassName
                }
                value={
                  data.nutrition.mealsPerDay
                }
                onChange={(event) =>
                  updateNutrition(
                    "mealsPerDay",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Weekly food budget
              </span>

              <input
                type="number"
                min={0}
                className={
                  inputClassName
                }
                value={
                  data.nutrition
                    .weeklyFoodBudget ?? ""
                }
                onChange={(event) =>
                  updateNutrition(
                    "weeklyFoodBudget",
                    event.target.value ===
                      ""
                      ? null
                      : Number(
                          event.target
                            .value,
                        ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Food preferences
              </span>

              <input
                className={
                  inputClassName
                }
                value={data.nutrition.foodPreferences.join(
                  ", ",
                )}
                onChange={(event) =>
                  updateNutrition(
                    "foodPreferences",
                    parseList(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Excluded foods
              </span>

              <input
                className={
                  inputClassName
                }
                value={data.nutrition.excludedFoods.join(
                  ", ",
                )}
                onChange={(event) =>
                  updateNutrition(
                    "excludedFoods",
                    parseList(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Allergies
              </span>

              <input
                className={
                  inputClassName
                }
                value={data.nutrition.allergies.join(
                  ", ",
                )}
                onChange={(event) =>
                  updateNutrition(
                    "allergies",
                    parseList(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Cooking ability
              </span>

              <select
                className={
                  inputClassName
                }
                value={
                  data.nutrition
                    .cookingAbility
                }
                onChange={(event) =>
                  updateNutrition(
                    "cookingAbility",
                    event.target
                      .value as OnboardingData["nutrition"]["cookingAbility"],
                  )
                }
              >
                <option value="beginner">
                  Beginner
                </option>

                <option value="intermediate">
                  Intermediate
                </option>

                <option value="advanced">
                  Advanced
                </option>
              </select>
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Meal-prep frequency
              </span>

              <select
                className={
                  inputClassName
                }
                value={
                  data.nutrition
                    .mealPrepFrequency
                }
                onChange={(event) =>
                  updateNutrition(
                    "mealPrepFrequency",
                    event.target
                      .value as OnboardingData["nutrition"]["mealPrepFrequency"],
                  )
                }
              >
                <option value="daily">
                  Daily
                </option>

                <option value="twice_weekly">
                  Twice weekly
                </option>

                <option value="weekly">
                  Weekly
                </option>

                <option value="rarely">
                  Rarely
                </option>
              </select>
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <h2 className="text-2xl font-bold">
                Lifestyle
              </h2>
            </div>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Sleep hours
              </span>

              <input
                type="number"
                min={0}
                max={24}
                step="0.5"
                className={
                  inputClassName
                }
                value={
                  data.lifestyle.sleepHours
                }
                onChange={(event) =>
                  updateLifestyle(
                    "sleepHours",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Daily steps
              </span>

              <input
                type="number"
                min={0}
                max={100000}
                className={
                  inputClassName
                }
                value={
                  data.lifestyle.dailySteps
                }
                onChange={(event) =>
                  updateLifestyle(
                    "dailySteps",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Stress level
              </span>

              <select
                className={
                  inputClassName
                }
                value={
                  data.lifestyle
                    .stressLevel
                }
                onChange={(event) =>
                  updateLifestyle(
                    "stressLevel",
                    event.target
                      .value as OnboardingData["lifestyle"]["stressLevel"],
                  )
                }
              >
                <option value="low">
                  Low
                </option>

                <option value="moderate">
                  Moderate
                </option>

                <option value="high">
                  High
                </option>

                <option value="very_high">
                  Very high
                </option>
              </select>
            </label>

            <label>
              <span
                className={
                  labelClassName
                }
              >
                Preferred training time
              </span>

              <select
                className={
                  inputClassName
                }
                value={
                  data.lifestyle
                    .preferredTrainingTime
                }
                onChange={(event) =>
                  updateLifestyle(
                    "preferredTrainingTime",
                    event.target
                      .value as OnboardingData["lifestyle"]["preferredTrainingTime"],
                  )
                }
              >
                <option value="morning">
                  Morning
                </option>

                <option value="afternoon">
                  Afternoon
                </option>

                <option value="evening">
                  Evening
                </option>

                <option value="flexible">
                  Flexible
                </option>
              </select>
            </label>

            <label className="md:col-span-2">
              <span
                className={
                  labelClassName
                }
              >
                School or work schedule
              </span>

              <textarea
                rows={5}
                className={
                  inputClassName
                }
                value={
                  data.lifestyle
                    .workSchedule
                }
                onChange={(event) =>
                  updateLifestyle(
                    "workSchedule",
                    event.target.value,
                  )
                }
              />
            </label>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="text-2xl font-bold">
              Review
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Confirm the information before
              saving.
            </p>

            <div className="mt-7 grid gap-5 lg:grid-cols-2">
              {[
                {
                  title: "Personal",
                  values: [
                    data.personal.fullName,
                    data.personal.dateOfBirth,
                    formatLabel(
                      data.personal.gender,
                    ),
                    `${data.personal.heightCm} cm`,
                    `${data.personal.weightKg} kg`,
                    data.personal.timezone,
                  ],
                },
                {
                  title: "Goal",
                  values: [
                    formatLabel(
                      data.goal.goal,
                    ),
                  ],
                },
                {
                  title: "Training",
                  values: [
                    formatLabel(
                      data.training
                        .experience,
                    ),
                    `${data.training.trainingDays} days per week`,
                    `${data.training.sessionDurationMinutes} minutes`,
                    formatLabel(
                      data.training
                        .trainingLocation,
                    ),
                    data.training.availableEquipment.join(
                      ", ",
                    ) ||
                      "No equipment provided",
                    data.training.priorityMuscles.join(
                      ", ",
                    ) ||
                      "No priority muscles provided",
                  ],
                },
                {
                  title: "Nutrition",
                  values: [
                    `${data.nutrition.mealsPerDay} meals per day`,
                    data.nutrition.foodPreferences.join(
                      ", ",
                    ) ||
                      "No preferences provided",
                    data.nutrition.excludedFoods.join(
                      ", ",
                    ) ||
                      "No exclusions provided",
                    data.nutrition.allergies.join(
                      ", ",
                    ) ||
                      "No allergies provided",
                  ],
                },
                {
                  title: "Lifestyle",
                  values: [
                    `${data.lifestyle.sleepHours} hours sleep`,
                    `${data.lifestyle.dailySteps} daily steps`,
                    formatLabel(
                      data.lifestyle
                        .stressLevel,
                    ),
                    formatLabel(
                      data.lifestyle
                        .preferredTrainingTime,
                    ),
                    data.lifestyle
                      .workSchedule,
                  ],
                },
              ].map((section) => (
                <article
                  key={section.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <h3 className="font-bold text-amber-500">
                    {section.title}
                  </h3>

                  <div className="mt-4 space-y-2">
                    {section.values.map(
                      (value, index) => (
                        <p
                          key={`${section.title}-${index}`}
                          className="text-sm leading-6 text-zinc-400"
                        >
                          {value ||
                            "Not provided"}
                        </p>
                      ),
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {message && (
          <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {message}
          </div>
        )}

        <footer className="mt-10 flex flex-col-reverse gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-600">
            {isSaving
              ? "Saving draft..."
              : "Draft saved automatically"}
          </p>

          <div className="flex gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                disabled={
                  isSubmitting
                }
                className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Back
              </button>
            )}

            {step < 5 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={
                  isSubmitting
                }
                className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-400 disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={
                  handleComplete
                }
                disabled={
                  isSubmitting
                }
                className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-400 disabled:opacity-50"
              >
                {isSubmitting
                  ? "Saving..."
                  : "Confirm and continue"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </section>
  )
}