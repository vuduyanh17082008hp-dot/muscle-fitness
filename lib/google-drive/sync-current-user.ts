import 'server-only'

import {
  upsertClientDriveSnapshot,
  type DriveSyncResult,
} from '@/lib/google-drive/client-snapshot'

import {
  createClient,
} from '@/lib/supabase/server'

export async function syncCurrentUserToGoogleDrive():
  Promise<DriveSyncResult> {
  const supabase =
    await createClient()

  const {
    data: {
      user,
    },
    error: authError,
  } =
    await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error(
      'Authentication required for Google Drive sync.',
    )
  }

  const {
    data: foundation,
    error: foundationError,
  } =
    await supabase.rpc(
      'get_user_foundation',
      {
        p_user_id: user.id,
      },
    )

  if (
    foundationError ||
    !foundation
  ) {
    throw new Error(
      foundationError?.message ??
        'Could not load client foundation data.',
    )
  }

  return upsertClientDriveSnapshot({
    schemaVersion: 1,

    user: {
      id: user.id,

      email:
        user.email ?? null,

      createdAt:
        user.created_at ?? null,

      lastSignInAt:
        user.last_sign_in_at ??
        null,
    },

    foundation,
  })
}