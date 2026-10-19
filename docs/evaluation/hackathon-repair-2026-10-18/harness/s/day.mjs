// End-to-end "one connected day" on a fresh seeded account, real browser, DB truth at every scene.
// Scene 1 morning check-in -> adjust -> Apply; 2 Start -> log set -> swap -> leave -> Resume; 3 finish;
// 4 nutrition with a fish allergy told to Gemma -> safe cards -> log a meal -> totals; 5 "why did you change?".
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, snap, jl, d, name }) => {
  const shot = (n) => page.screenshot({ path: `${d}/${name}-${n}.png` })
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const today = () => psql(`select s.id||'|'||s.session_state||'|'||(select string_agg(target_sets::text, ',' order by exercise_order) from workout_session_exercises where workout_session_id=s.id)||'|'||(select string_agg(display_name, ',' order by exercise_order) from workout_session_exercises where workout_session_id=s.id) from workout_sessions s where s.user_id='${U}' and s.scheduled_date >= current_date - 1 and s.session_state <> 'completed' or (s.user_id='${U}' and s.completed_at > now() - interval '2 hours') order by s.created_at desc limit 1`)

  /* ---------- SCENE 1: morning ---------- */
  await go('/dashboard/recovery')
  await page.getByLabel(/sleep hours/i).first().fill('4')
  const ranges = page.locator('form input[type=range]')
  const target = [2, 7, 9, 9, 3, 2]
  for (let i = 0; i < 6; i++) { await ranges.nth(i).focus(); await page.keyboard.press('Home'); for (let k = 1; k < target[i]; k++) await page.keyboard.press('ArrowRight') }
  await page.getByRole('button', { name: /check-in/i }).first().click()
  const adj = page.getByRole('button', { name: /adjust today's plan/i })
  const adjShown = await adj.waitFor({ timeout: 45000 }).then(() => true).catch(() => false)
  await shot('s1-readiness')
  let s1 = { adjShown }
  if (adjShown) {
    await adj.click(); await shot('s1-preview')
    await page.getByRole('dialog').getByRole('button', { name: /apply/i }).first().click()
    s1.applied = await page.getByText(/plan is updated/i).waitFor({ timeout: 30000 }).then(() => true).catch(() => false)
    await shot('s1-applied')
  }
  s1.db = today()
  jl({ scene: 1, ...s1 })

  /* ---------- SCENE 2: gym ---------- */
  await go('/dashboard')
  await shot('s2-dashboard')
  const cta = page.getByRole('link', { name: /start workout|resume workout/i }).or(page.getByRole('button', { name: /^start workout$/i })).first()
  await cta.click(); await page.waitForURL(/\/session\//, { timeout: 60000 }); await page.waitForLoadState('networkidle')
  const startBtn = page.getByRole('button', { name: /^start workout$/i })
  await startBtn.or(page.locator('main input[type=number]').first()).first().waitFor({ timeout: 45000 }).catch(() => {})
  if (await startBtn.count()) { await startBtn.click(); await page.waitForURL(/\/session\//); await page.waitForLoadState('networkidle') }
  const inputs = page.locator('main input[type=number]')
  await inputs.first().waitFor({ timeout: 30000 })
  const sid = page.url().split('/session/')[1].split(/[?#]/)[0]
  await inputs.nth(0).fill('70'); await inputs.nth(1).fill('8')
  await page.getByRole('button', { name: /^complete set 1 of /i }).first().click()
  const saved = await page.getByText('Set saved.').waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
  const sel = page.locator('main select').nth(1)
  const opt = (await sel.locator('option').allInnerTexts())[1]
  await sel.selectOption({ index: 1 }); await page.waitForTimeout(5000)
  await shot('s2-logged-swapped')
  await go('/dashboard')
  const resume = page.getByRole('link', { name: /resume workout/i }).first()
  const hasResume = await resume.count()
  if (hasResume) { await resume.click(); await page.waitForURL(/\/session\//); await page.waitForLoadState('networkidle') }
  jl({ scene: 2, sessionId: sid, setSaved: saved, swappedTo: opt, resumeOnDashboard: hasResume, resumedSame: page.url().includes(sid), db: psql(`select string_agg(se.display_name||':'||es.set_number||':'||coalesce(es.weight_kg::text,'-')||'x'||coalesce(es.reps::text,'-'), ' ' order by se.exercise_order, es.set_number) from exercise_sets es join workout_session_exercises se on se.id=es.session_exercise_id where se.workout_session_id='${sid}' and es.completed`) + ' || ' + today() })

  /* ---------- SCENE 3: completion ---------- */
  await inputs.first().waitFor({ timeout: 30000 })
  await page.locator('main input[type=number]').nth(4).fill('70'); await page.locator('main input[type=number]').nth(5).fill('7')
  await page.getByRole('button', { name: /^complete set 2 of /i }).first().click(); await page.waitForTimeout(2000)
  await page.getByRole('button', { name: /complete workout/i }).first().click()
  await page.waitForTimeout(1500)
  if (await page.locator('[role=dialog],[role=alertdialog]').count()) await page.getByRole('button', { name: /confirm|finish|complete|yes/i }).last().click()
  await page.waitForURL(/history/, { timeout: 45000 }).catch(() => {})
  await page.waitForLoadState('networkidle'); await shot('s3-history')
  jl({ scene: 3, url: page.url(), db: psql(`select session_state||' completed_at='||(completed_at is not null) from workout_sessions where id='${sid}'`) })

  /* ---------- SCENE 4: nutrition ---------- */
  await go('/dashboard/nutrition')
  const box = page.locator('#coach-chat-input')
  await box.waitFor({ timeout: 30000 }); await box.scrollIntoViewIfNeeded()
  await box.fill('I have a fish allergy - tuna gave me hives.'); await page.keyboard.press('Enter')
  // Mid-turn: the pre-disclosure cards must not be presented as eligible.
  await page.waitForTimeout(800)
  const midTurn = await page.locator('#coach').innerText()
  const midTurnCardsHidden = !/SUGGESTED FOR YOU[\s\S]{0,40}High-Protein/i.test(midTurn) || /Updating suggestions/.test(midTurn)
  await page.waitForFunction(() => { const t = document.querySelector('#coach')?.textContent ?? ''; return !/Thinking through|Updating suggestions/.test(t) }, null, { timeout: 90000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const coachText = await page.locator('#coach').innerText()
  const suggested = (coachText.match(/SUGGESTED FOR YOU[\s\S]{0,600}/) ?? [''])[0]
  await shot('s4-cards')
  const logsBefore = psql(`select count(*) from food_logs where user_id='${U}' and created_at > now() - interval '2 hours'`)
  const firstCard = page.locator('#coach li').filter({ has: page.getByRole('button', { name: /customize this meal/i }) }).first()
  await firstCard.getByRole('button', { name: /customize this meal/i }).click(); await page.waitForTimeout(3000)
  await page.locator('#coach').getByRole('button', { name: /log this meal/i }).first().click(); await page.waitForTimeout(2000)
  const dlg = page.locator('[role=alertdialog]').first()
  const dlgText = await dlg.innerText().catch(() => null)
  if (dlgText) { await dlg.getByRole('button', { name: /confirm|log|yes/i }).first().click(); await page.waitForTimeout(6000) }
  await shot('s4-logged')
  jl({ scene: 4, midTurnCardsHidden, suggestedHasFish: /tuna|fish \(cod\)|white fish/i.test(suggested), suggested: suggested.slice(0, 300), confirmDialog: dlgText, notice: (await page.locator('#coach').innerText()).match(/Logged[^\n]*/)?.[0] ?? null, foodLogsBefore: logsBefore, foodLogsAfter: psql(`select count(*) from food_logs where user_id='${U}' and created_at > now() - interval '2 hours'`), signals: psql(`select string_agg(producer||':'||signal_type||':'||lifecycle, ' ') from coach_signals where user_id='${U}'`) })

  /* ---------- SCENE 5: why ---------- */
  await go('/dashboard/ai-coach')
  const dbox = page.getByRole('textbox', { name: /message to dante/i }).first()
  await dbox.waitFor({ timeout: 30000 }); await dbox.fill("Why did you change today's workout?"); await page.keyboard.press('Enter')
  await page.getByText(/you applied my suggestion|hasn't been changed|couldn't check/i).first().waitFor({ timeout: 60000 }).catch(() => {})
  await shot('s5-why')
  const main = await page.locator('main').last().innerText()
  jl({ scene: 5, reply: (main.match(/(Today's workout[^\n]*|There's no workout[^\n]*|I couldn't check[^\n]*)/) ?? [null])[0] })
}
