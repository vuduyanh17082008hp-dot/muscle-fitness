import {
  NextResponse,
} from 'next/server'

import {
  syncCurrentUserToGoogleDrive,
} from '@/lib/google-drive/sync-current-user'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

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
    console.error(
      'Google Drive sync failed:',
      error,
    )

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown Google Drive sync error.'

    const unauthorized =
      message
        .toLowerCase()
        .includes(
          'authentication required',
        )

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status:
          unauthorized
            ? 401
            : 500,

        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    )
  }
}