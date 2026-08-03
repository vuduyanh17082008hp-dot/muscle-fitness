import 'server-only'

import { google } from 'googleapis'

let cachedDrive:
  | ReturnType<typeof google.drive>
  | null = null

function requiredEnvironmentVariable(
  name: string,
): string {
  const value =
    process.env[name]?.trim()

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    )
  }

  return value
}

export function getGoogleDriveFolderId() {
  return requiredEnvironmentVariable(
    'GOOGLE_DRIVE_FOLDER_ID',
  )
}

export function getGoogleDriveClient() {
  if (cachedDrive) {
    return cachedDrive
  }

  const clientId =
    requiredEnvironmentVariable(
      'GOOGLE_DRIVE_CLIENT_ID',
    )

  const clientSecret =
    requiredEnvironmentVariable(
      'GOOGLE_DRIVE_CLIENT_SECRET',
    )

  const refreshToken =
    requiredEnvironmentVariable(
      'GOOGLE_DRIVE_REFRESH_TOKEN',
    )

  const oauth2Client =
    new google.auth.OAuth2(
      clientId,
      clientSecret,
    )

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  cachedDrive =
    google.drive({
      version: 'v3',
      auth: oauth2Client,
    })

  return cachedDrive
}