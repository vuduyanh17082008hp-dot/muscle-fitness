import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const DEFAULT_REQUESTS = 10
const DEFAULT_WINDOW_SECONDS = 60

export type DanteRateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getDanteRateLimitConfig() {
  return {
    requests: positiveInteger(process.env.DANTE_RATE_LIMIT_REQUESTS, DEFAULT_REQUESTS),
    windowSeconds: positiveInteger(
      process.env.DANTE_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_WINDOW_SECONDS,
    ),
  }
}

export async function checkDanteRateLimit(userId: string): Promise<DanteRateLimitResult> {
  const config = getDanteRateLimitConfig()
  const { data, error } = await createSupabaseAdminClient().rpc("check_dante_rate_limit", {
    p_user_id: userId,
    p_limit: config.requests,
    p_window_seconds: config.windowSeconds,
  })

  if (error) {
    console.error("[DANTE APP RATE LIMIT] datastore failure:", error.code ?? "unknown")
    throw new Error("Dante rate limiter unavailable.")
  }

  const result = Array.isArray(data) ? data[0] : data
  if (
    !result ||
    typeof result.allowed !== "boolean" ||
    typeof result.remaining !== "number" ||
    typeof result.retry_after_seconds !== "number"
  ) {
    console.error("[DANTE APP RATE LIMIT] invalid RPC response")
    throw new Error("Dante rate limiter unavailable.")
  }

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterSeconds: Math.max(1, Math.ceil(result.retry_after_seconds)),
  }
}
