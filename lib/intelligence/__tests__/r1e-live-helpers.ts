/**
 * Shared helpers for the AI-R1E live HTTP gates (r1e-live-http.test.ts, r1e-live-gemma.test.ts).
 * LOCAL Docker Supabase only: the db container is reached with `docker exec psql`, the app via MF_LIVE_BASE (a dev server pointed at the local stack).
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"

import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const BASE = process.env.MF_LIVE_BASE
const CONTAINER = process.env.MF_TEST_DB_CONTAINER ?? "supabase_db_muscle-fitness-claude"
export const EMAIL = "ver3.main@example.com"
const PASSWORD = "Passw0rd!verify"

export const env = (() => {
  const out: Record<string, string> = {}
  if (!BASE) return out
  for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return out
})()

export const sql = (s: string) => {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-f", "-"], { input: s, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}`)
  return r.stdout.trim()
}

export const session = { userId: "", cookie: "", jwt: "" }

export async function login() {
  const jar = new Map<string, string>()
  const sb = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value)) },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error || !data.session) throw new Error(`login failed: ${error?.message}`)
  session.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
  session.jwt = data.session.access_token
  session.userId = data.user.id
}

/** A client that authenticates as the user (JWT), never the service role. */
export const userClient = (): SupabaseClient =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${session.jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

export async function post(body: unknown) {
  // The shared app rate limit (10 req/min) is not under test here; reset this test user's counter on the LOCAL db so request bursts do not 429.
  sql(`delete from dante_chat_rate_limits where user_id='${session.userId}';`)
  const r = await fetch(`${BASE}/api/chatbot`, { method: "POST", headers: { "content-type": "application/json", cookie: session.cookie }, body: JSON.stringify(body) })
  return { status: r.status, text: await r.text() }
}
export const dante = (message: string) => post({ messages: [{ role: "user", content: message }] })
/** Dante keeps a durable safety/risk state per user that contaminates later tests. */
export const resetDanteState = () => sql(`delete from dante_coherence_state where user_id='${session.userId}';`)
