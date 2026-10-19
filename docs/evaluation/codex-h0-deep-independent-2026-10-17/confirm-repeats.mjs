import { createRequire } from 'node:module'
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const require = createRequire('C:/Dev/Projects/muscle-fitness-claude/package.json')
const { createServerClient } = require('@supabase/ssr')
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const supa = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const out = process.env.CODEX_CONFIRM_OUT ?? 'docs/evaluation/codex-h0-deep-independent-2026-10-17/raw/confirm-repeats.jsonl'
const count = Number(process.env.CODEX_CONFIRM_COUNT ?? 5)
writeFileSync(out, '')
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], { input: sql, timeout: 10_000 }).toString().trim()

for (let i = 1; i <= count; i++) {
  const email = `codex-confirm-${Date.now()}-${i}@example.com`
  const password = `codex-${Math.random().toString(36).slice(2)}A1!`
  const signup = createServerClient(supa, key, { cookies: { getAll: () => [], setAll: () => {} } })
  const { data, error } = await signup.auth.signUp({ email, password })
  if (error) throw new Error(`local test signup ${i}: ${error.message}`)
  const uid = data.user.id
  psql(`update public.profiles set onboarding_completed = true, timezone = 'Asia/Singapore' where user_id = '${uid}';`)
  const jar = new Map()
  const sb = createServerClient(supa, key, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cookies) => cookies.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)) } })
  const login = await sb.auth.signInWithPassword({ email, password })
  if (login.error) throw new Error(`local test login ${i}: ${login.error.message}`)
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
  const actionArgs = { foodName: `repeat-food-${i}`, quantityGrams: 130, mealType: 'snack', per100g: { calories: 100, protein: 5, carbs: 12, fat: 3 }, source: 'local' }
  const actionId = psql(`insert into public.dante_tool_actions(user_id, tool_name, status, args, summary, expires_at) values ('${uid}', 'log_food', 'pending', '${JSON.stringify(actionArgs).replaceAll("'", "''")}'::jsonb, 'repeat confirmation trial', now() + interval '10 minutes') returning id;`).split('\n')[0]
  const results = []
  for (let delivery = 1; delivery <= 2; delivery++) {
    const started = Date.now()
    try {
      const response = await fetch('http://localhost:3000/api/dante/tools/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ actionId, intent: 'confirm' }), signal: AbortSignal.timeout(20_000) })
      const body = await response.text()
      results.push({ delivery, status: response.status, contentType: response.headers.get('content-type'), body: body.slice(0, 1200), ms: Date.now() - started })
    } catch (e) { results.push({ delivery, error: String(e?.name ?? e), ms: Date.now() - started }) }
  }
  const state = psql(`select (select count(*) from public.food_logs where user_id='${uid}') || '|' || (select status from public.dante_tool_actions where id='${actionId}') || '|' || coalesce((select result->>'error' from public.dante_tool_actions where id='${actionId}'),'');`)
  const record = { caseId: `CONFIRM_REPEAT_${i}`, actionId, results, backend: state }
  appendFileSync(out, JSON.stringify(record) + '\n')
  console.log(`${record.caseId}: ${results.map((r) => r.status ?? r.error).join(',')} backend=${state}`)
}
