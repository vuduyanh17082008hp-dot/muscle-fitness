"use client"

import { useEffect, useState } from "react"

import { getSupabaseConfig } from "@/lib/supabase/config"

export const GOOGLE_UNAVAILABLE_MESSAGE =
  "Google sign-in isn't enabled on this server. Use your email and password instead."

/*
 * GoTrue's public /auth/v1/settings lists the providers this auth server
 * has enabled. With Google off, /authorize answers a raw JSON 400, so the
 * button is disabled only when the server explicitly reports google:false.
 * An unreachable or unexpected response keeps the normal flow.
 */
export function parseGoogleEnabled(settings: unknown): boolean | null {
  const google = (settings as { external?: { google?: unknown } } | null)
    ?.external?.google

  return typeof google === "boolean" ? google : null
}

export function useGoogleAuthEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const { url, key } = getSupabaseConfig()

    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings) => {
        if (active) setEnabled(parseGoogleEnabled(settings))
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  return enabled
}
