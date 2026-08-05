import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import type { User } from '@supabase/supabase-js'

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

type DashboardRpcPayload = {
  profile?: {
    fullName?: string | null
    onboardingCompleted?: boolean
  }
}

type DashboardRpcError = {
  message: string
  details?: string | null
  hint?: string | null
  code?: string
}

type DashboardRpcResult = {
  data: DashboardRpcPayload | null
  error: DashboardRpcError | null
}

type DashboardRpcClient = {
  rpc: (
    functionName: 'get_client_dashboard',
  ) => PromiseLike<DashboardRpcResult>
}

/**
 * Chỉ kiểm tra Supabase Auth.
 *
 * Không query bảng profiles trong function này để tránh:
 * - Sai tên cột user_id hoặc id.
 * - RLS profiles chưa đồng bộ.
 * - Query profile bị lặp lại nhiều lần.
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
 * Function tương thích cho những trang cũ vẫn đang import
 * requireCompletedOnboarding.
 *
 * Profile được đọc từ get_client_dashboard() thay vì query
 * trực tiếp bảng profiles.
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

    const dashboardRpcClient =
      supabase as unknown as DashboardRpcClient

    const {
      data,
      error,
    } = await dashboardRpcClient.rpc(
      'get_client_dashboard',
    )

    if (error) {
      console.error(
        'Unable to load dashboard authentication context:',
        {
          message: error.message,
          details: error.details ?? null,
          hint: error.hint ?? null,
          code: error.code ?? null,
        },
      )

      throw new Error(
        'Unable to load your Muscle Fitness profile.',
      )
    }

    const dashboardProfile =
      data?.profile

    if (
      dashboardProfile?.onboardingCompleted !== true
    ) {
      redirect(
        `/onboarding?next=${encodeURIComponent(
          nextPath,
        )}`,
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
          dashboardProfile.fullName?.trim() ||
          metadataName?.trim() ||
          null,

        onboarding_completed: true,
      },
    }
  },
)