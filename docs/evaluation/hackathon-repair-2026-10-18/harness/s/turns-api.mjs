// Real /api/chatbot turns (Dante = default mode, Gemma = coachMode "nutrition"), recording reply text, the user's
// coach_signals after each turn, and the fish/peanut content of the deterministic suggestion cards.
// TURNS='[{"c":"gemma","m":"..."},{"c":"dante","m":"..."},{"c":"cards"}]'
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, jl, save, d, name }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const signals = () => psql(`select string_agg(producer||':'||replace(signal_type,'USER_DISCLOSED_','')||':'||lifecycle, ' | ' order by created_at) from coach_signals where user_id='${U}' and signal_type like 'USER_DISCLOSED_%'`)
  const history = { dante: [], gemma: [] }
  const out = []
  for (const t of JSON.parse(process.env.TURNS)) {
    if (t.c === 'cards') {
      const r = await page.request.post('http://localhost:3000/api/nutrition/coach', { data: { action: 'suggest' } })
      const j = await r.json()
      const items = (j.drafts ?? []).flatMap((x) => x.ingredients.map((i) => i.ingredientId))
      const rec = { c: 'cards', names: (j.drafts ?? []).map((x) => x.name), fish: items.some((i) => /tuna|white_fish/.test(i)), nuts: items.some((i) => /peanut|almond/.test(i)) }
      out.push(rec); jl(rec); continue
    }
    const body = t.c === 'gemma'
      ? { message: t.m, coachMode: 'nutrition', conversation: { currentTopic: null, pendingMealBuild: null, handoff: null, signals: [], priorUserTurns: history.gemma.slice(-20), recentMessages: [] } }
      : { message: t.m, messages: [...history.dante.slice(-12), { role: 'user', content: t.m }] }
    const t0 = Date.now()
    const r = await page.request.post('http://localhost:3000/api/chatbot', { data: body, timeout: 180000 })
    const raw = await r.text()
    let reply = ''
    try { reply = JSON.parse(raw).reply ?? '' } catch {
      // Dante streams NDJSON events: concatenate delta texts.
      for (const line of raw.split('\n')) { try { const e = JSON.parse(line); if (e.type === 'delta') reply += e.text } catch {} }
    }
    if (t.c === 'gemma') history.gemma.push(t.m)
    else history.dante.push({ role: 'user', content: t.m }, { role: 'assistant', content: reply })
    const rec = { c: t.c, m: t.m, status: r.status(), ms: Date.now() - t0, reply: reply.slice(0, 1500), signals: signals() }
    out.push(rec); jl(rec)
  }
  save(`${d}/${name}-transcript.json`, out)
}
