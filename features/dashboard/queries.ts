import {
  dashboardDataSchema,
  type DashboardData,
} from './types'

import { requireUser } from '@/lib/auth/guard'

type DashboardRpcError = {
  message: string
  details?: string | null
  hint?: string | null
  code?: string
}

type DashboardRpcResult = {
  data: unknown
  error: DashboardRpcError | null
}

type DashboardRpcClient = {
  rpc: (
    functionName: 'get_client_dashboard',
  ) => PromiseLike<DashboardRpcResult>
}

export async function getDashboardData(): Promise<DashboardData> {
  const {
    supabase,
    user,
  } = await requireUser()

  /*
   * Database types hiện tại chưa nhận diện RPC mới.
   * Cast chỉ được giới hạn cho đúng RPC dashboard,
   * không chuyển toàn bộ Supabase client thành any.
   */
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
      'get_client_dashboard failed:',
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      },
    )

    throw new Error(
      'Unable to load your dashboard data.',
    )
  }

  if (!data) {
    throw new Error(
      'No dashboard data was returned. Check that the user has completed onboarding.',
    )
  }

  const parsed =
    dashboardDataSchema.safeParse(
      data,
    )

  if (!parsed.success) {
    console.error(
      'Invalid dashboard RPC payload:',
      parsed.error.flatten(),
    )

    throw new Error(
      'The dashboard returned an invalid data format.',
    )
  }

  return {
    ...parsed.data,
    userEmail:
      user.email ?? null,
  }
}