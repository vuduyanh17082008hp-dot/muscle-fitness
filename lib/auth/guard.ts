import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import type { User } from '@supabase/supabase-js'

import {
  classifyQueryError,
  isAuthDisposition,
} from '@/lib/supabase/query-error'
import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<
  ReturnType<typeof createClient>
>

export type AuthenticatedProfile = {
  user_id: string
  full_name: string | null
  onboarding_completed: boolean
}

export type RequireUserResult = {
  supabase: SupabaseServerClient
  user: User
  userId: string
}

export type RequireCompletedOnboardingResult =
  RequireUserResult & {
    profile: AuthenticatedProfile
  }

/**
 * Supabase Auth only. Does not open product routes.
 * Unauthenticated callers go to login — never to the dashboard.
 */
export const requireUser = cache(
  async (): Promise<RequireUserResult> => {
    const supabase = await createClient()

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      redirect('/login?next=/dashboard')
    }

    return {
      supabase,
      user,
      userId: user.id,
    }
  },
)

/**
 * Auth + completed onboarding. Used by the shared /dashboard layout
 * so every product route under /dashboard/* is gated once.
 *
 * Missing or incomplete profiles go to /onboarding, not the dashboard.
 */
export const requireCompletedOnboarding = cache(
  async (
    nextPath = '/dashboard',
  ): Promise<RequireCompletedOnboardingResult> => {
    const {
      supabase,
      user,
      userId,
    } = await requireUser()

    const {
      data: profile,
      error,
      status,
    } = await supabase
      .from('profiles')
      .select('user_id, full_name, onboarding_completed')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      const disposition = classifyQueryError(error, status)

      console.error(
        'Unable to load dashboard onboarding context:',
        {
          disposition,
          code: error.code,
          status,
        },
      )

      /*
       * Never redirect here. GoTrue already accepted this session in
       * requireUser, so /login would bounce straight back to /dashboard
       * and loop. An auth rejection from PostgREST is surfaced to the
       * error boundary (retry) — never treated as a missing profile.
       */
      throw new Error(
        isAuthDisposition(disposition)
          ? `Your session could not be verified (${disposition}). Please retry or sign in again.`
          : `Unable to load your Muscle Fitness profile (${disposition}).`,
      )
    }

    if (!profile || profile.onboarding_completed !== true) {
      redirect(
        `/onboarding?next=${encodeURIComponent(nextPath)}`,
      )
    }

    const metadataName =
      typeof user.user_metadata?.full_name ===
      'string'
        ? user.user_metadata.full_name
        : null

    return {
      supabase,
      user,
      userId,

      profile: {
        user_id: userId,

        full_name:
          profile.full_name?.trim() ||
          metadataName?.trim() ||
          null,

        onboarding_completed: true,
      },
    }
  },
)
