import "server-only"

import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 60
const MAX_TRACKED_USERS = 5_000

// ponytail: per-process sliding window — resets on restart and isn't shared across instances; move to a scoped DB
// bucket (the Dante limiter's table has no scope column today) if this runs on more than one instance.
const hits = new Map<string, number[]>()

/** Pure window check, exported for tests. Records the hit when allowed. */
export function takeLookupSlot(userId: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const recent = (hits.get(userId) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent)
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)) }
  }
  recent.push(now)
  hits.set(userId, recent)
  if (hits.size > MAX_TRACKED_USERS) {
    for (const [key, times] of hits) if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(key)
    if (hits.size > MAX_TRACKED_USERS) hits.delete(hits.keys().next().value as string)
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * QA-05: the USDA / Open Food Facts lookups spend the server's provider quota, so only signed-in users may call them,
 * at a bounded rate. Returns the response to send when the request must stop, or null to continue.
 */
export async function guardFoodLookup(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to search foods." }, { status: 401 })
  }
  const slot = takeLookupSlot(user.id)
  if (!slot.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many food lookups — try again in a moment." },
      { status: 429, headers: { "Retry-After": String(slot.retryAfterSeconds) } },
    )
  }
  return null
}
