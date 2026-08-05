import "server-only"

import { createClient } from "@/lib/supabase/server"

export type EntitlementResult = {
  allowed: boolean
  error: string | null
}

export async function hasEntitlement(
  entitlementKey: string,
): Promise<EntitlementResult> {
  const key = entitlementKey.trim()

  if (!key) {
    return {
      allowed: false,
      error: "Entitlement key is required.",
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      allowed: false,
      error: "Authentication required.",
    }
  }

  const { data, error } = await supabase.rpc(
    "has_entitlement",
    {
      p_key: key,
    },
  )

  if (error) {
    return {
      allowed: false,
      error: error.message,
    }
  }

  return {
    allowed: data === true,
    error: null,
  }
}

export async function requireEntitlement(
  entitlementKey: string,
): Promise<void> {
  const result = await hasEntitlement(entitlementKey)

  if (!result.allowed) {
    throw new Error(
      result.error ??
        `Missing entitlement: ${entitlementKey}`,
    )
  }
}