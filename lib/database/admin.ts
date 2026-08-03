'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

const uuidSchema =
  z.string().uuid()

const roleSchema = z.enum([
  'user',
  'coach',
  'admin',
])

export type AdminActionResult =
  | {
      success: true
    }
  | {
      success: false
      message: string
    }

export async function adminSetUserRole(
  userId: string,
  role: z.infer<typeof roleSchema>,
): Promise<AdminActionResult> {
  const parsed = z
    .object({
      userId: uuidSchema,
      role: roleSchema,
    })
    .safeParse({
      userId,
      role,
    })

  if (!parsed.success) {
    return {
      success: false,
      message:
        'Invalid user or role.',
    }
  }

  const supabase =
    await createClient()

  const { error } =
    await supabase.rpc(
      'admin_set_user_role',
      {
        p_user_id:
          parsed.data.userId,

        p_role:
          parsed.data.role,
      },
    )

  if (error) {
    return {
      success: false,
      message: error.message,
    }
  }

  revalidatePath('/admin/users')
  revalidatePath('/admin/coaches')
  revalidatePath('/coach/clients')

  return {
    success: true,
  }
}

export async function adminAssignCoach(
  coachId: string,
  clientId: string,
): Promise<AdminActionResult> {
  const parsed = z
    .object({
      coachId: uuidSchema,
      clientId: uuidSchema,
    })
    .safeParse({
      coachId,
      clientId,
    })

  if (!parsed.success) {
    return {
      success: false,
      message:
        'Invalid coach or client ID.',
    }
  }

  const supabase =
    await createClient()

  const { error } =
    await supabase.rpc(
      'admin_assign_coach',
      {
        p_coach_id:
          parsed.data.coachId,

        p_client_id:
          parsed.data.clientId,
      },
    )

  if (error) {
    return {
      success: false,
      message: error.message,
    }
  }

  revalidatePath('/admin/coaches')
  revalidatePath('/coach/clients')

  return {
    success: true,
  }
}

export async function adminUnassignCoach(
  clientId: string,
): Promise<AdminActionResult> {
  const parsed =
    uuidSchema.safeParse(clientId)

  if (!parsed.success) {
    return {
      success: false,
      message:
        'Invalid client ID.',
    }
  }

  const supabase =
    await createClient()

  const { error } =
    await supabase.rpc(
      'admin_unassign_coach',
      {
        p_client_id: parsed.data,
      },
    )

  if (error) {
    return {
      success: false,
      message: error.message,
    }
  }

  revalidatePath('/admin/coaches')
  revalidatePath('/coach/clients')

  return {
    success: true,
  }
}