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

/**
 * Resolve a text entitlement value for the authenticated user.
 * Prefer user override → role entitlement → catalog default.
 */
export async function getEntitlementValue(
  entitlementKey: string,
): Promise<string | null> {
  const key = entitlementKey.trim()

  if (!key) {
    return null
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  // Prefer RPC when Phase 2 migration is applied.
  const rpc = await supabase.rpc("get_entitlement_value", {
    p_key: key,
  })

  if (!rpc.error && typeof rpc.data === "string") {
    return rpc.data
  }

  // Fallback for environments that have not applied the new RPC yet.
  const userOverride = await supabase
    .from("user_entitlements")
    .select("value")
    .eq("user_id", user.id)
    .eq("entitlement_key", key)
    .maybeSingle()

  if (
    !userOverride.error &&
    typeof userOverride.data?.value === "string"
  ) {
    return userOverride.data.value
  }

  const profile = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle()

  const role =
    typeof profile.data?.role === "string"
      ? profile.data.role
      : "client"

  const roleEntitlement = await supabase
    .from("role_entitlements")
    .select("value")
    .eq("role", role)
    .eq("entitlement_key", key)
    .maybeSingle()

  if (
    !roleEntitlement.error &&
    typeof roleEntitlement.data?.value === "string"
  ) {
    return roleEntitlement.data.value
  }

  const catalog = await supabase
    .from("entitlements")
    .select("default_value")
    .eq("key", key)
    .maybeSingle()

  if (
    !catalog.error &&
    typeof catalog.data?.default_value === "string"
  ) {
    return catalog.data.default_value
  }

  return null
}

export async function getAiDailyLimit(): Promise<number> {
  const raw = await getEntitlementValue("ai_daily_limit")
  const parsed = Number.parseInt(raw ?? "", 10)

  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed
  }

  // Catalog default from Phase 1 seed — not a Free-plan hardcode in the chat route.
  return 5
}
