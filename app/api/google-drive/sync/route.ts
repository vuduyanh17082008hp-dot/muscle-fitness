import {
  NextResponse,
} from 'next/server'

import {
  GoogleDriveSyncError,
  syncCurrentUserToGoogleDrive,
} from '@/lib/google-drive/sync-current-user'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

const PUBLIC_MESSAGES = {
  auth: 'Authentication required.',
  validation: 'Invalid sync request.',
  upstream: 'Google Drive sync could not be completed.',
} as const

const STATUS_BY_KIND = {
  auth: 401,
  validation: 400,
  upstream: 500,
} as const

export async function POST() {
  try {
    const result =
      await syncCurrentUserToGoogleDrive()

    return NextResponse.json(
      {
        success: true,

        sync: {
          action:
            result.action,

          fileId:
            result.fileId,

          modifiedTime:
            result.modifiedTime,
        },
      },
      {
        status: 200,

        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    )
  } catch (error) {
    const kind =
      error instanceof GoogleDriveSyncError
        ? error.kind
        : 'upstream'

    console.error(
      'Google Drive sync failed:',
      kind,
      error instanceof GoogleDriveSyncError
        ? error.message
        : error instanceof Error
          ? error.name
          : 'unknown',
    )

    return NextResponse.json(
      {
        success: false,
        message: PUBLIC_MESSAGES[kind],
      },
      {
        status: STATUS_BY_KIND[kind],

        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    )
  }
}
