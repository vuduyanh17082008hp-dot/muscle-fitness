// H0 systemic-repair runner (copied from the 2026-10-16 diagnostic runner; history window updated to match the repaired clients).
// Behavioral diagnostic runner: real :3000 dev server, real local Supabase, real provider.
// One fresh user per case; Dante turns send user-only history exactly like components/dante-chat.tsx.
// Usage: node runner.mjs <out.jsonl> [--only=ID,ID] [--rep=N] [--conc=4]
import { createRequire } from 'node:module'
import { readFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const { CASES } = await import(process.env.CASES_FILE ?? './cases.mjs')

const repo = 'C:/Dev/Projects/muscle-fitness-claude/'
const require = createRequire(repo + 'package.json')
const { createServerClient } = require('@supabase/ssr')
const env = Object.fromEntries(readFileSync(repo + '.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP = 'http://localhost:3000'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA'], { input: sql }).toString().trim()

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')))
const OUT = process.argv[2]
const only = args.only ? new Set(args.only.split(',')) : null
const rep = Number(args.rep ?? 1)
const conc = Number(args.conc ?? 4)

const day = (offset) => { const d = new Date(Date.now() + 8 * 3600e3 + offset * 864e5); return d.toISOString().slice(0, 10) } // Asia/Singapore local date

async function newUser(tag) {
  const email = `diag-${tag.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`
  const password = 'diag-' + Math.random().toString(36).slice(2) + 'A1!'
  const sb = createServerClient(SUPA, KEY, { cookies: { getAll: () => [], setAll: () => {} } })
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) throw new Error('signUp: ' + error.message)
  const uid = data.user.id
  psql(`update public.profiles set onboarding_completed = true, full_name = 'Diag User', timezone = 'Asia/Singapore' where user_id = '${uid}';`)
  const jar = new Map()
  const sb2 = createServerClient(SUPA, KEY, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (cs) => cs.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))) } })
  const r = await sb2.auth.signInWithPassword({ email, password })
  if (r.error) throw new Error('signIn: ' + r.error.message)
  return { uid, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join('; ') }
}

function seed(uid, s = {}) {
  const sql = []
  if (s.fitness) sql.push(`update public.profiles set gender = 'male', date_of_birth = '1998-03-01' where user_id = '${uid}';`)
  if (s.fitness) sql.push(`insert into public.fitness_profiles (user_id, height_cm, current_weight_kg, weight_kg, goal, activity_level, training_experience, training_days, protein_target_g, calorie_target, calories_target, carb_target_g, fat_target_g)
    values ('${uid}', 178, ${s.fitness.weight ?? 80}, ${s.fitness.weight ?? 80}, 'muscle_gain', 'moderately_active', 'intermediate', 4, ${s.fitness.protein ?? 160}, ${s.fitness.kcal ?? 2600}, ${s.fitness.kcal ?? 2600}, 300, 80)
    on conflict (user_id) do update set height_cm = excluded.height_cm, goal = excluded.goal, activity_level = excluded.activity_level, training_experience = excluded.training_experience, training_days = excluded.training_days, carb_target_g = excluded.carb_target_g, fat_target_g = excluded.fat_target_g, current_weight_kg = excluded.current_weight_kg, weight_kg = excluded.weight_kg, protein_target_g = excluded.protein_target_g, calorie_target = excluded.calorie_target, calories_target = excluded.calories_target;`)
  for (const c of s.recovery ?? []) sql.push(`insert into public.recovery_checkins (user_id, checkin_date, sleep_hours, sleep_quality, stress, fatigue, soreness, mood, readiness, pain_illness, recovery_score, created_at, updated_at)
    values ('${uid}', '${day(c.day)}', ${c.sleep ?? 4}, ${c.q ?? 1}, ${c.stress ?? 5}, ${c.fatigue ?? 5}, ${c.soreness ?? 5}, ${c.mood ?? 1}, ${c.readiness ?? 1}, 'no', ${c.score}, now() + interval '${c.day} days', now() + interval '${c.day} days');`)
  for (const w of s.weights ?? []) sql.push(`insert into public.body_weight_entries (user_id, logged_on, weight_kg, source) values ('${uid}', '${day(w.day)}', ${w.kg}, 'manual');`)
  for (const f of s.food ?? []) sql.push(`insert into public.food_logs (user_id, log_date, meal_type, food_name, source, quantity_grams, calories, protein_g, carbs_g, fat_g, is_estimated) values ('${uid}', '${day(f.day ?? 0)}', '${f.meal ?? 'lunch'}', '${f.name}', 'local', ${f.g ?? 100}, ${f.kcal}, ${f.p}, ${f.c ?? 0}, ${f.fat ?? 0}, false);`)
  if (s.prefs) sql.push(`insert into public.user_preferences (user_id, allergies, excluded_foods, sleep_hours) values ('${uid}', ARRAY[${(s.prefs.allergies ?? []).map((a) => `'${a}'`).join(',')}]::text[], ARRAY[${(s.prefs.excluded ?? []).map((a) => `'${a}'`).join(',')}]::text[], ${s.prefs.sleep ?? 'null'}) on conflict (user_id) do update set allergies = excluded.allergies, excluded_foods = excluded.excluded_foods, sleep_hours = excluded.sleep_hours;`)
  if (sql.length) psql(sql.join('\n'))
}

async function dante(user, history, message, abortAfterMs) {
  const now = new Date().toISOString()
  const messages = [...history.map((t) => ({ role: 'user', content: t.text, createdAt: t.at })), { role: 'user', content: message, createdAt: now }].slice(-20)
  const controller = new AbortController()
  if (abortAfterMs) setTimeout(() => controller.abort(), abortAfterMs)
  const started = Date.now()
  try {
    const res = await fetch(`${APP}/api/chatbot`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: user.cookie }, body: JSON.stringify({ message, messages }), signal: controller.signal })
    const raw = await res.text()
    const ms = Date.now() - started
    if ((res.headers.get('content-type') ?? '').includes('ndjson')) {
      const events = raw.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
      const text = events.filter((e) => e.type === 'delta').map((e) => e.text).join('')
      const done = events.find((e) => e.type === 'done') ?? {}
      const err = events.find((e) => e.type === 'error')
      return { ms, status: res.status, kind: 'stream', text, model: done.model, safety: done.safetyTriggered ?? null, safetyCategory: done.safetyCategory ?? null, pending: done.pendingConfirmation ?? null, sources: (done.sources ?? []).map((s) => `${s.type}: ${s.title}`), trace: done.toolTraceSummary ?? [], error: err?.error ?? null, at: now }
    }
    let body = null; try { body = JSON.parse(raw) } catch { body = { raw: raw.slice(0, 500), devError: devErrorOf(raw) } }
    return { ms, status: res.status, kind: 'json', text: body.reply ?? body.message ?? body.error ?? '', code: body.code ?? null, route: body.route ?? null, runtime: body.runtime ?? null, body: summarizeJson(body), at: now }
  } catch (e) {
    return { ms: Date.now() - started, status: 0, kind: 'aborted', clientAborted: controller.signal.aborted, error: String(e?.name ?? e), text: '', at: now }
  }
}

// Next dev error page → the error message it embeds (for diagnosing transient 500s).
function devErrorOf(raw) {
  try { appendFileSync(OUT.replace(/\.jsonl$/, '.500.html'), `\n<!-- ${new Date().toISOString()} -->\n` + raw) } catch {}
  const m = raw.match(/"message":"((?:[^"\\]|\\.){0,600})/) ?? raw.match(/<pre[^>]*>([\s\S]{0,600})/)
  return m ? m[1] : null
}

function summarizeJson(b) {
  const { reply, message, ...rest } = b ?? {}
  return JSON.parse(JSON.stringify(rest, (k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v)))
}

async function gemma(user, state, message) {
  state.chat.push({ role: 'user', text: message })
  const recentMessages = state.chat.slice(-6)
  const started = Date.now()
  const res = await fetch(`${APP}/api/chatbot`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: user.cookie }, body: JSON.stringify({ message, coachMode: 'nutrition', activeDraft: null, selectedFoods: [], conversation: { ...state.conv, recentMessages, priorUserTurns: state.chat.filter((t) => t.role === 'user').map((t) => t.text.slice(0, 400)).slice(0, -1).slice(-20) } }) })
  const raw = await res.text()
  let body = null; try { body = JSON.parse(raw) } catch { body = { raw: raw.slice(0, 500), devError: devErrorOf(raw) } }
  if (body.conversation) state.conv = body.conversation
  const text = body.reply ?? body.message ?? body.error ?? ''
  state.chat.push({ role: 'coach', text })
  return { ms: Date.now() - started, status: res.status, kind: 'gemma', text, code: body.code ?? null, runtime: body.runtime ?? null, ...(res.status >= 500 ? { errorBody: body } : {}), mealDraft: body.mealDraft ? { status: body.mealDraft.status, items: body.mealDraft.items?.length } : null, warnings: body.warnings ?? null, blocks: body.structuredBlocks?.length ?? 0, hints: body.followUpHints ?? null }
}

async function confirm(user, actionId, intent) {
  const res = await fetch(`${APP}/api/dante/tools/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: user.cookie }, body: JSON.stringify({ actionId, intent }) })
  let body = null; try { body = await res.json() } catch { body = null }
  return { kind: 'confirm', intent, actionId, status: res.status, body }
}

async function runCase(c, r) {
  const user = await newUser(c.id)
  seed(user.uid, c.seed)
  const sub = (s) => s.replaceAll('$UID', user.uid)
  if (c.pre) psql(sub(c.pre))
  const history = []
  const gstate = { conv: {}, chat: [] }
  const turns = []
  let lastPending = null
  try {
    for (const step of c.turns) {
      const s = typeof step === 'string' ? { say: step } : step
      if (s.sql) { turns.push({ kind: 'sql', sql: s.sql, out: psql(sub(s.sql)) }); continue }
      if (s.seedPending) {
        const owner = s.otherUser ? (await newUser(c.id + 'x')).uid : user.uid
        const id = psql(`insert into public.dante_tool_actions (user_id, tool_name, status, args, summary, expires_at) values ('${owner}', '${s.seedPending.tool ?? 'log_food'}', 'pending', '${JSON.stringify(s.seedPending.args).replaceAll("'", "''")}'::jsonb, '${s.seedPending.summary ?? 'seeded'}', now() + interval '${s.expiresMin ?? 10} minutes') returning id;`).split('\n')[0]
        lastPending = { actionId: id, toolName: s.seedPending.tool ?? 'log_food', seeded: true }
        turns.push({ kind: 'seedPending', actionId: id, owner: s.otherUser ? 'OTHER_USER' : 'SELF' })
        continue
      }
      if (s.confirmParallel) {
        const rs = await Promise.all([confirm(user, lastPending.actionId, 'confirm'), confirm(user, lastPending.actionId, 'confirm')])
        turns.push({ kind: 'confirmParallel', results: rs })
        continue
      }
      if (s.confirm) {
        const id = s.confirm === 'bogus' ? '00000000-0000-4000-8000-000000000000' : lastPending?.actionId
        if (!id) { turns.push({ kind: 'confirm', note: 'NO_PENDING_ACTION_TO_CONFIRM' }); continue }
        if (s.expireFirst) psql(`update public.dante_tool_actions set expires_at = now() - interval '1 minute' where id = '${id}';`)
        turns.push(await confirm(user, id, s.confirm === 'cancel' ? 'cancel' : 'confirm'))
        continue
      }
      const coach = s.coach ?? c.coach ?? 'dante'
      const out = coach === 'gemma' ? await gemma(user, gstate, s.say) : await dante(user, history, s.say, s.abortAfterMs)
      if (coach !== 'gemma') history.push({ text: s.say, at: out.at })
      if (out.pending) lastPending = out.pending
      turns.push({ coach, user: s.say, ...out })
    }
  } catch (e) {
    turns.push({ kind: 'harness_error', error: String(e?.stack ?? e).slice(0, 500) })
  } finally {
    if (c.post) try { psql(sub(c.post)) } catch (e) { turns.push({ kind: 'post_error', error: String(e) }) }
  }
  const checks = {}
  for (const [k, q] of Object.entries(c.check ?? {})) checks[k] = psql(sub(q))
  const rec = { id: c.id, rep: r, cat: c.cat, pop: c.pop, pair: c.pair ?? null, tags: c.tags ?? [], expect: c.expect, seed: c.seed ?? null, uid: user.uid, turns, checks }
  appendFileSync(OUT, JSON.stringify(rec) + '\n')
  const last = turns.filter((t) => t.text !== undefined).at(-1)
  console.log(`${c.id} r${r} ${turns.map((t) => t.status ?? t.kind).join(',')} ${Math.round(turns.reduce((a, t) => a + (t.ms ?? 0), 0) / 1000)}s | ${(last?.text ?? '').slice(0, 90).replace(/\n/g, ' ')}`)
}

const selected = CASES.filter((c) => !only || only.has(c.id))
const jobs = []
for (let r = 1; r <= rep; r++) for (const c of selected) jobs.push([c, r])
const serial = jobs.filter(([c]) => c.serial)
const parallel = jobs.filter(([c]) => !c.serial)
let i = 0
await Promise.all(Array.from({ length: conc }, async () => { while (i < parallel.length) { const [c, r] = parallel[i++]; try { await runCase(c, r) } catch (e) { console.log(`${c.id} r${r} RUNNER_ERROR ${e}`); appendFileSync(OUT, JSON.stringify({ id: c.id, rep: r, runnerError: String(e) }) + '\n') } } }))
for (const [c, r] of serial) { try { await runCase(c, r) } catch (e) { console.log(`${c.id} r${r} RUNNER_ERROR ${e}`) } }
console.log('DONE', jobs.length)
