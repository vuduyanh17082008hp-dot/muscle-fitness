'use client'

import {
  useEffect,
} from 'react'

type DriveSyncOnLoginProps = {
  userId: string
}

export function DriveSyncOnLogin({
  userId,
}: DriveSyncOnLoginProps) {
  useEffect(() => {
    const storageKey =
      `muscle-fitness:drive-sync:${userId}`

    const alreadySynced =
      sessionStorage.getItem(
        storageKey,
      )

    if (alreadySynced) {
      return
    }

    const controller =
      new AbortController()

    async function sync() {
      try {
        const response =
          await fetch(
            '/api/google-drive/sync',
            {
              method: 'POST',

              headers: {
                Accept:
                  'application/json',
              },

              cache: 'no-store',

              signal:
                controller.signal,
            },
          )

        if (!response.ok) {
          const payload =
            (await response
              .json()
              .catch(() => null)) as
              | {
                  message?: string
                }
              | null

          throw new Error(
            payload?.message ??
              `Drive sync failed with status ${response.status}.`,
          )
        }

        sessionStorage.setItem(
          storageKey,
          new Date().toISOString(),
        )
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            'AbortError'
        ) {
          return
        }

        console.error(
          'Automatic Drive sync failed:',
          error,
        )
      }
    }

    void sync()

    return () => {
      controller.abort()
    }
  }, [userId])

  return null
}