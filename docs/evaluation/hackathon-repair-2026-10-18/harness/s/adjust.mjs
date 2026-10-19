import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, snap, jl, save, d, name }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  if (page.url().includes('/login')) { await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) } }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const sets = () => psql(`select string_agg(se.display_name||':'||se.target_sets, ', ' order by se.exercise_order) from workout_session_exercises se join workout_sessions s on s.id=se.workout_session_id where s.user_id='${U}' and s.scheduled_date=current_date and s.session_state<>'completed'`)
  jl({ setsBefore: sets() })
  await go('/dashboard/recovery')
  await page.getByLabel(/sleep hours/i).first().fill('4')
  const ranges = page.locator('form input[type=range]')
  const target = [2, 7, 9, 9, 3, 2]
  for (let i = 0; i < 6; i++) { await ranges.nth(i).focus(); await page.keyboard.press('Home'); for (let k = 1; k < target[i]; k++) await page.keyboard.press('ArrowRight') }
  const t0 = Date.now()
  await page.getByRole('button', { name: /check-in/i }).first().click()
  const adj = page.getByRole('button', { name: /adjust today's plan/i })
  const appeared = await adj.waitFor({ timeout: 45000 }).then(() => Date.now() - t0).catch(() => null)
  jl({ adjustButtonAppearedMs: appeared })
  await snap('after-checkin')
  if (!appeared) { await page.reload(); await page.waitForLoadState('networkidle'); jl({ afterReloadAdjust: await adj.count() }); await snap('after-reload'); if (!(await adj.count())) return }
  if (process.env.NO_APPLY) { jl({ noApply: true }); return }
  await adj.click()
  const dlg = page.getByRole('dialog')
  const preview = await dlg.innerText()
  await page.screenshot({ path: `${d}/${name}-preview.png` })
  const ta = Date.now()
  await dlg.getByRole('button', { name: /apply/i }).first().click()
  const ok = await page.getByText(/plan is updated/i).waitFor({ timeout: 30000 }).then(() => Date.now() - ta).catch(() => null)
  jl({ preview: preview.slice(0, 1200), appliedFeedbackMs: ok, setsAfter: sets() })
  await snap('after-apply')
  await go('/dashboard'); const dsh = await snap('dashboard')
  jl({ dashCard: (dsh.match(/(TODAY'S TRAINING|SESSION IN PROGRESS)[\s\S]{0,140}/) ?? [''])[0], brief: (dsh.match(/DANTE DAILY BRIEF[\s\S]{0,300}/) ?? [''])[0] })
  await page.reload(); await page.waitForLoadState('networkidle')
  await go('/dashboard/recovery'); const rec = await snap('recovery-revisit')
  jl({ revisitShowsApplied: /plan is updated|adjusted/i.test(rec), revisitAdjustButton: await adj.count() })
}
