// F-01 stale card + direct endpoints: get a fish suggestion BEFORE any allergy, create its pending log, then disclose the
// allergy to Dante (real /api/chatbot turn), then: confirm the old pending action, re-propose the stale card, re-fetch cards.
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, jl }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const post = async (url, data) => { const r = await page.request.post('http://localhost:3000' + url, { data, timeout: 120000 }); let j = null; const t = await r.text(); try { j = JSON.parse(t) } catch { j = t.slice(0, 300) } return { s: r.status(), j } }
  const fishy = (d) => d.ingredients.some((i) => /tuna|white_fish/.test(i.ingredientId))
  // 1. A fish meal the user could be shown before any disclosure (suggest, else a build with tuna picked).
  let before = await post('/api/nutrition/coach', { action: 'suggest' })
  let card = (before.j.drafts ?? []).find(fishy)
  if (!card) { const chosen = await post('/api/nutrition/coach', { action: 'choose', ingredientIds: ['tuna', 'rice', 'cucumber'] }); card = chosen.j.draft && fishy(chosen.j.draft) ? chosen.j.draft : null; jl({ via: 'choose', s: chosen.s, msg: chosen.j.message ?? chosen.j.error ?? null }) }
  jl({ beforeCards: (before.j.drafts ?? []).map((d) => d.name), fishCard: card?.name ?? null })
  if (!card) return jl({ error: 'no fish draft obtainable before disclosure' })
  const proposed = await post('/api/nutrition/coach/log', { draft: card, mealType: 'dinner' })
  const actionId = proposed.j.pendingConfirmation?.actionId ?? proposed.j.pendingConfirmation?.id
  jl({ proposeBefore: proposed.s, ok: proposed.j.ok, actionId })
  // 2. Disclose to Dante through the real chat route.
  const chat = await page.request.post('http://localhost:3000/api/chatbot', { data: { message: process.env.DISCLOSURE ?? "I'm allergic to fish - my lips swell when I eat it." }, timeout: 120000 })
  jl({ chatStatus: chat.status(), signals: psql(`select producer||':'||signal_type||':'||lifecycle from coach_signals where user_id='${U}'`) })
  // 3. Confirm the pre-disclosure pending action.
  const logsBefore = psql(`select count(*) from food_logs where user_id='${U}' and log_date >= current_date - 1`)
  const confirm = actionId ? await post('/api/dante/tools/confirm', { actionId, intent: 'confirm' }) : null
  const logsAfter = psql(`select count(*) from food_logs where user_id='${U}' and log_date >= current_date - 1`)
  jl({ confirmStale: confirm?.s, confirmBody: JSON.stringify(confirm?.j).slice(0, 400), foodLogsBefore: logsBefore, foodLogsAfter: logsAfter, actionStatus: actionId ? psql(`select status from dante_tool_actions where id='${actionId}'`) : null })
  // 4. Re-propose the stale card, and re-fetch cards + picker.
  const repropose = await post('/api/nutrition/coach/log', { draft: card, mealType: 'dinner' })
  const after = await post('/api/nutrition/coach', { action: 'suggest' })
  const ctx = await post('/api/nutrition/coach', { action: 'context' })
  jl({ reproposeStale: repropose.s, reproposeCode: repropose.j.code, reproposeMsg: repropose.j.error, afterCards: (after.j.drafts ?? []).map((d) => d.name), afterFish: (after.j.drafts ?? []).some(fishy), blockedIds: ctx.j.blockedIngredientIds })
}
