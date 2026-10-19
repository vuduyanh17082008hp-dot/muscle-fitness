// F-06: complete a set while offline -> no crash, typed values kept, honest pending state; refresh while still offline is
// not possible in a real browser, so: reload after reconnect restores + syncs; DB shows exactly one logical write.
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, ctx, go, snap, jl, d, name }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const SID = psql(`select id from workout_sessions where user_id='${U}' and session_state='in_progress' order by started_at desc limit 1`)
  const dbSets = () => psql(`select coalesce(string_agg(es.set_number||':'||coalesce(es.weight_kg::text,'-')||'x'||coalesce(es.reps::text,'-')||':'||es.completed, ' ' order by se.exercise_order, es.set_number), '') from exercise_sets es join workout_session_exercises se on se.id=es.session_exercise_id where se.workout_session_id='${SID}' and (es.completed or es.reps is not null)`)
  await go('/dashboard/workouts/session/' + SID)
  const inputs = page.locator('main input[type=number]')
  await inputs.first().waitFor({ timeout: 30000 })
  await inputs.nth(0).fill('47'); await inputs.nth(1).fill('7')
  await ctx.setOffline(true)
  const doneBtn = page.getByRole('button', { name: /^complete set 1 of /i }).first()
  await doneBtn.click(); await page.waitForTimeout(5000)
  const text = await page.locator('body').innerText()
  const crashed = /WORKOUT SYSTEM ERROR|Something went wrong/i.test(text)
  const kept = await inputs.evaluateAll((els) => els.slice(0, 2).map((e) => e.value))
  jl({ step: 'offline-complete', crashed, keptValues: kept, offlineMsg: (text.match(/You're offline[^\n]*/) ?? [null])[0], pendingBanner: (text.match(/\d+ sets? not synced yet[^\n]*/) ?? [null])[0], falseSaved: /Set saved\./.test(text), db: dbSets() })
  await page.screenshot({ path: `${d}/${name}-offline.png` })
  await ctx.setOffline(false)
  await page.waitForTimeout(6000)
  const t2 = await page.locator('body').innerText()
  jl({ step: 'reconnected', syncMsg: (t2.match(/Back online[^\n]*/) ?? [null])[0], pendingBanner: (t2.match(/\d+ sets? not synced yet[^\n]*/) ?? [null])[0], db: dbSets() })
  await page.screenshot({ path: `${d}/${name}-reconnected.png` })
  // Second scenario: offline complete, then a full reload once back online (the pending entry must restore and sync once).
  await inputs.nth(4).fill('45'); await inputs.nth(5).fill('8')
  await ctx.setOffline(true)
  await page.getByRole('button', { name: /^complete set 2 of /i }).first().click(); await page.waitForTimeout(4000)
  const stored = await page.evaluate((sid) => localStorage.getItem(`mf:pending-sets:${sid}`), SID)
  await ctx.setOffline(false)
  await page.reload(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(6000)
  const t3 = await page.locator('body').innerText()
  jl({ step: 'reload-after-reconnect', storedWhileOffline: Boolean(stored), syncMsg: (t3.match(/Back online[^\n]*/) ?? [null])[0], remaining: await page.evaluate((sid) => localStorage.getItem(`mf:pending-sets:${sid}`), SID), db: dbSets() })
  await snap('final')
}
