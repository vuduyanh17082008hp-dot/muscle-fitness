import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import {
  asAssignedClients,
  asFoundationData,
  type AssignedClientData,
  type FoundationData,
} from '@/types/database-helpers'

export const getCurrentUserFoundation =
  cache(
    async (): Promise<FoundationData> => {
      const supabase =
        await createClient()

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error(
          'UNAUTHENTICATED',
        )
      }

      const { data, error } =
        await supabase.rpc(
          'get_user_foundation',
          {
            p_user_id: user.id,
          },
        )

      if (error || !data) {
        throw new Error(
          error?.message ??
            'PROFILE_NOT_FOUND',
        )
      }

      return asFoundationData(data as Json)
    },
  )

export async function getUserFoundation(
  userId: string,
): Promise<FoundationData> {
  const supabase =
    await createClient()

  const { data, error } =
    await supabase.rpc(
      'get_user_foundation',
      {
        p_user_id: userId,
      },
    )

  if (error || !data) {
    throw new Error(
      error?.message ??
        'PROFILE_NOT_FOUND',
    )
  }

  return asFoundationData(data as Json)
}

export const getAssignedClients =
  cache(
    async (): Promise<
      AssignedClientData[]
    > => {
      const supabase =
        await createClient()

      const { data, error } =
        await supabase.rpc(
          'list_my_assigned_clients',
        )

      if (error || !data) {
        throw new Error(
          error?.message ??
            'COACH_CLIENTS_NOT_FOUND',
        )
      }

      return asAssignedClients(data as Json)
    },
  )