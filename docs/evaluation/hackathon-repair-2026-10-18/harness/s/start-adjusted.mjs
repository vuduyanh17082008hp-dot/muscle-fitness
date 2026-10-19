// Seeded account: recovery revisit after Apply -> dashboard Start Workout -> session Start -> player; DB truth at each step.
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, snap, jl, d, name }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const sessions = () => psql(`select s.id||' '||s.session_state||' sets='||(select count(*) from exercise_sets es join workout_session_exercises se on se.id=es.session_exercise_id where se.workout_session_id=s.id)||' targets='||(select string_agg(target_sets::text, ',' order by exercise_order) from workout_session_exercises where workout_session_id=s.id) from workout_sessions s where s.user_id='${U}' and s.session_state<>'completed' order by s.created_at`)
  jl({ dbBefore: sessions() })
  if (process.env.SKIP_RECOVERY !== '1') {
    await go('/dashboard/recovery')
    const rec = await snap('recovery-revisit')
    jl({ revisitApplied: /plan is updated/i.test(rec), revisitAdjustButton: await page.getByRole('button', { name: /adjust today's plan/i }).count() })
  }
  await go('/dashboard')
  const start = page.getByRole('link', { name: /start workout|resume workout/i }).first()
  jl({ dashCta: await start.count() ? await start.innerText() : null, href: await start.count() ? await start.getAttribute('href') : null })
  const t0 = Date.now()
  await start.click(); await page.waitForURL(/\/session\//, { timeout: 60000 }); await page.waitForLoadState('networkidle')
  await snap('session-page')
  const startBtn = page.getByRole('button', { name: /^start workout$/i })
  const hasStart = await startBtn.count()
  jl({ sessionUrl: page.url(), startButton: hasStart })
  if (hasStart) { await startBtn.click(); await page.waitForURL(/\/session\//, { timeout: 60000 }); await page.waitForLoadState('networkidle') }
  await page.locator('main input[type=number]').first().waitFor({ timeout: 30000 }).catch(() => {})
  const inputs = await page.locator('main input[type=number]').count()
  jl({ playerUrl: page.url(), numberInputs: inputs, msToPlayer: Date.now() - t0, clicks: hasStart ? 2 : 1, dbAfter: sessions() })
  await snap('player')
  await page.screenshot({ path: `${d}/${name}-player-viewport.png` })
}
