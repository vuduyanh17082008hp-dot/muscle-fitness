// F-05: plan day assigned to today, no session row yet -> dashboard offers it with a 1-tap Start (not "Scheduled Rest Day").
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, snap, jl }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  // Test setup (local synthetic user only): no session row today; the plan's Upper day is assigned to today's SGT weekday.
  psql(`delete from workout_sessions where user_id='${U}' and session_state='not_started';
        update workout_days set scheduled_weekday = extract(dow from (now() at time zone 'Asia/Singapore'))::int where name='Upper Strength' and workout_plan_id in (select id from workout_plans where client_id='${U}' and status='active');`)
  await go('/dashboard')
  const txt = await snap('dashboard')
  const hero = (txt.match(/(TODAY'S TRAINING|NEXT IN YOUR PLAN|SCHEDULED REST DAY)[\s\S]{0,120}/) ?? [null])[0]
  const t0 = Date.now()
  await page.getByRole('button', { name: /^start workout$/i }).first().click()
  await page.waitForURL(/\/session\//, { timeout: 60000 }); await page.locator('main input[type=number]').first().waitFor({ timeout: 45000 }).catch(() => {})
  jl({ hero, taps: 1, msToPlayer: Date.now() - t0, playerInputs: await page.locator('main input[type=number]').count(), db: psql(`select session_state||' sets='||(select count(*) from exercise_sets es join workout_session_exercises se on se.id=es.session_exercise_id where se.workout_session_id=s.id) from workout_sessions s where user_id='${U}' and session_state='in_progress'`) })
  await go('/dashboard/workouts')
  const w = await snap('workouts')
  jl({ workoutsCta: (w.match(/Resume workout|Start workout|Start from your plan|Build recommended plan/i) ?? [null])[0] })
}
