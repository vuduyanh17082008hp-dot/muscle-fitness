'use client'

import { useFormStatus } from 'react-dom'

import {
  LoaderCircle,
  Save,
} from 'lucide-react'

export function SubmitButton() {
  const {
    pending,
  } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3.5 text-sm font-black text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Save className="size-4" />
      )}

      {pending
        ? 'Saving…'
        : "Save today's log"}
    </button>
  )
}