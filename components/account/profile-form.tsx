"use client"

import {
  AlertCircle,
  ArrowLeft,
  Check,
  LoaderCircle,
  Save,
} from "lucide-react"
import Link from "next/link"
import {
  useActionState,
} from "react"
import {
  useFormStatus,
} from "react-dom"

import {
  saveProfileAction,
  type SaveProfileState,
} from "@/app/account/actions"

type ProfileFormProps = {
  initialData: {
    email: string
    fullName: string
    username: string
    phone: string
    dateOfBirth: string
    gender: string
    heightCm: number | null
    weightKg: number | null
    timezone: string
    goal: string
  }
}

const initialState: SaveProfileState = {
  success: false,
  message: null,
  fieldErrors: {},
}

const inputClassName =
  "h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-500/70 focus:ring-4 focus:ring-amber-500/10"

const labelClassName =
  "mb-2 block text-xs font-black uppercase tracking-[0.14em] text-zinc-500"

function FieldError({
  message,
}: {
  message?: string
}) {
  if (!message) {
    return null
  }

  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-400">
      <AlertCircle size={13} />
      {message}
    </p>
  )
}

function SubmitButton() {
  const { pending } =
    useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-600 px-6 text-sm font-black text-black shadow-lg shadow-orange-950/30 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      {pending ? (
        <>
          <LoaderCircle
            size={17}
            className="animate-spin"
          />
          Saving...
        </>
      ) : (
        <>
          <Save size={17} />
          Save changes
        </>
      )}
    </button>
  )
}

export function ProfileForm({
  initialData,
}: ProfileFormProps) {
  const [
    state,
    formAction,
  ] = useActionState(
    saveProfileAction,
    initialState
  )

  return (
    <form
      action={formAction}
      className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20 sm:p-8"
    >
      {state.message && (
        <div
          aria-live="polite"
          className="mb-7 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-300"
        >
          <AlertCircle
            size={18}
            className="mt-0.5 shrink-0"
          />

          <span>{state.message}</span>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-black">
          Personal information
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          Keep your account and fitness details accurate so Muscle Fitness can personalise your dashboard, training and nutrition plans.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label>
          <span className={labelClassName}>
            Full name
          </span>

          <input
            className={inputClassName}
            name="full_name"
            defaultValue={
              initialData.fullName
            }
            autoComplete="name"
            required
          />

          <FieldError
            message={
              state.fieldErrors?.full_name
            }
          />
        </label>

        <label>
          <span className={labelClassName}>
            Username
          </span>

          <input
            className={inputClassName}
            name="username"
            defaultValue={
              initialData.username
            }
            autoComplete="username"
            placeholder="your.username"
          />

          <FieldError
            message={
              state.fieldErrors?.username
            }
          />
        </label>

        <label>
          <span className={labelClassName}>
            Email address
          </span>

          <input
            className={`${inputClassName} cursor-not-allowed opacity-60`}
            value={initialData.email}
            disabled
            readOnly
          />

          <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600">
            <Check size={12} />
            Connected to your login account
          </p>
        </label>

        <label>
          <span className={labelClassName}>
            Phone number
          </span>

          <input
            className={inputClassName}
            name="phone"
            type="tel"
            defaultValue={
              initialData.phone
            }
            autoComplete="tel"
            placeholder="+65 0000 0000"
          />

          <FieldError
            message={
              state.fieldErrors?.phone
            }
          />
        </label>

        <label>
          <span className={labelClassName}>
            Date of birth
          </span>

          <input
            className={inputClassName}
            name="date_of_birth"
            type="date"
            defaultValue={
              initialData.dateOfBirth
            }
          />
        </label>

        <label>
          <span className={labelClassName}>
            Gender
          </span>

          <select
            className={inputClassName}
            name="gender"
            defaultValue={
              initialData.gender
            }
          >
            <option value="">
              Select gender
            </option>

            <option value="male">
              Male
            </option>

            <option value="female">
              Female
            </option>

            <option value="other">
              Other
            </option>

            <option value="prefer_not_to_say">
              Prefer not to say
            </option>
          </select>

          <FieldError
            message={
              state.fieldErrors?.gender
            }
          />
        </label>

        <label>
          <span className={labelClassName}>
            Height
          </span>

          <div className="relative">
            <input
              className={`${inputClassName} pr-16`}
              name="height_cm"
              type="number"
              min="80"
              max="260"
              step="0.1"
              defaultValue={
                initialData.heightCm ??
                ""
              }
              inputMode="decimal"
            />

            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-black text-zinc-600">
              CM
            </span>
          </div>

          <FieldError
            message={
              state.fieldErrors?.height_cm
            }
          />
        </label>

        <label>
          <span className={labelClassName}>
            Weight
          </span>

          <div className="relative">
            <input
              className={`${inputClassName} pr-16`}
              name="weight_kg"
              type="number"
              min="20"
              max="400"
              step="0.1"
              defaultValue={
                initialData.weightKg ??
                ""
              }
              inputMode="decimal"
            />

            <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-black text-zinc-600">
              KG
            </span>
          </div>

          <FieldError
            message={
              state.fieldErrors?.weight_kg
            }
          />
        </label>

        <label>
          <span className={labelClassName}>
            Timezone
          </span>

          <select
            className={inputClassName}
            name="timezone"
            defaultValue={
              initialData.timezone
            }
          >
            <option value="Asia/Singapore">
              Singapore — GMT+8
            </option>

            <option value="Asia/Ho_Chi_Minh">
              Vietnam — GMT+7
            </option>

            <option value="Asia/Bangkok">
              Bangkok — GMT+7
            </option>

            <option value="Asia/Kuala_Lumpur">
              Kuala Lumpur — GMT+8
            </option>

            <option value="Asia/Tokyo">
              Tokyo — GMT+9
            </option>

            <option value="Australia/Sydney">
              Sydney
            </option>

            <option value="Europe/London">
              London
            </option>

            <option value="America/New_York">
              New York
            </option>
          </select>
        </label>

        <label>
          <span className={labelClassName}>
            Primary fitness goal
          </span>

          <select
            className={inputClassName}
            name="goal"
            defaultValue={
              initialData.goal
            }
          >
            <option value="">
              Select your goal
            </option>

            <option value="fat_loss">
              Fat loss
            </option>

            <option value="lean_bulk">
              Lean bulk
            </option>

            <option value="muscle_gain">
              Muscle gain
            </option>

            <option value="body_recomposition">
              Body recomposition
            </option>

            <option value="maintenance">
              Maintenance
            </option>

            <option value="performance">
              Performance
            </option>
          </select>

          <FieldError
            message={
              state.fieldErrors?.goal
            }
          />
        </label>
      </div>

      <div className="mt-9 flex flex-col-reverse justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
        <Link
          href="/account"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={17} />
          Cancel
        </Link>

        <SubmitButton />
      </div>
    </form>
  )
}