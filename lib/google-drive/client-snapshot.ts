import 'server-only'

import {
  createHash,
} from 'node:crypto'

import {
  Readable,
} from 'node:stream'

import type {
  drive_v3,
} from 'googleapis'

import {
  getGoogleDriveClient,
  getGoogleDriveFolderId,
} from '@/lib/google-drive/client'

export type ClientDriveSnapshot = {
  schemaVersion: 1

  user: {
    id: string
    email: string | null
    createdAt: string | null
    lastSignInAt: string | null
  }

  foundation: unknown
}

export type DriveSyncResult = {
  action:
    | 'created'
    | 'updated'
    | 'unchanged'

  fileId: string

  fileName: string

  webViewLink: string | null

  modifiedTime: string | null
}

function escapeDriveQueryValue(
  value: string,
) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
}

function createContentHash(
  payload: ClientDriveSnapshot,
) {
  const canonicalJson =
    JSON.stringify(payload)

  return createHash('sha256')
    .update(canonicalJson)
    .digest('hex')
}

function createJsonStream(
  content: string,
) {
  return Readable.from([
    Buffer.from(
      content,
      'utf8',
    ),
  ])
}

function createFileName(
  userId: string,
) {
  return `client-${userId}.json`
}

async function findExistingClientFile(
  userId: string,
): Promise<
  drive_v3.Schema$File | null
> {
  const drive =
    getGoogleDriveClient()

  const folderId =
    getGoogleDriveFolderId()

  const safeUserId =
    escapeDriveQueryValue(userId)

  const safeFolderId =
    escapeDriveQueryValue(folderId)

  const result =
    await drive.files.list({
      q: [
        `'${safeFolderId}' in parents`,
        'trashed = false',
        `appProperties has { key='muscleFitnessUserId' and value='${safeUserId}' }`,
      ].join(' and '),

      spaces: 'drive',

      pageSize: 1,

      fields: [
        'files(',
        'id,',
        'name,',
        'modifiedTime,',
        'webViewLink,',
        'appProperties',
        ')',
      ].join(''),
    })

  return result.data.files?.[0] ??
    null
}

export async function upsertClientDriveSnapshot(
  payload: ClientDriveSnapshot,
): Promise<DriveSyncResult> {
  const drive =
    getGoogleDriveClient()

  const folderId =
    getGoogleDriveFolderId()

  const fileName =
    createFileName(
      payload.user.id,
    )

  const contentHash =
    createContentHash(payload)

  const existingFile =
    await findExistingClientFile(
      payload.user.id,
    )

  if (
    existingFile?.id &&
    existingFile.appProperties
      ?.contentHash === contentHash
  ) {
    return {
      action: 'unchanged',
      fileId: existingFile.id,
      fileName:
        existingFile.name ??
        fileName,

      webViewLink:
        existingFile.webViewLink ??
        null,

      modifiedTime:
        existingFile.modifiedTime ??
        null,
    }
  }

  const fileContent =
    JSON.stringify(
      {
        ...payload,

        syncedAt:
          new Date().toISOString(),
      },
      null,
      2,
    )

  const appProperties = {
    muscleFitnessUserId:
      payload.user.id,

    contentHash,

    schemaVersion: '1',

    application:
      'muscle-fitness',
  }

  if (existingFile?.id) {
    const updated =
      await drive.files.update({
        fileId: existingFile.id,

        requestBody: {
          name: fileName,
          appProperties,
        },

        media: {
          mimeType:
            'application/json',

          body:
            createJsonStream(
              fileContent,
            ),
        },

        fields: [
          'id,',
          'name,',
          'modifiedTime,',
          'webViewLink',
        ].join(''),
      })

    if (!updated.data.id) {
      throw new Error(
        'Google Drive did not return the updated file ID.',
      )
    }

    return {
      action: 'updated',

      fileId:
        updated.data.id,

      fileName:
        updated.data.name ??
        fileName,

      webViewLink:
        updated.data.webViewLink ??
        null,

      modifiedTime:
        updated.data.modifiedTime ??
        null,
    }
  }

  const created =
    await drive.files.create({
      requestBody: {
        name: fileName,

        parents: [
          folderId,
        ],

        mimeType:
          'application/json',

        appProperties,
      },

      media: {
        mimeType:
          'application/json',

        body:
          createJsonStream(
            fileContent,
          ),
      },

      fields: [
        'id,',
        'name,',
        'modifiedTime,',
        'webViewLink',
      ].join(''),
    })

  if (!created.data.id) {
    throw new Error(
      'Google Drive did not return the created file ID.',
    )
  }

  return {
    action: 'created',

    fileId:
      created.data.id,

    fileName:
      created.data.name ??
      fileName,

    webViewLink:
      created.data.webViewLink ??
      null,

    modifiedTime:
      created.data.modifiedTime ??
      null,
  }
}