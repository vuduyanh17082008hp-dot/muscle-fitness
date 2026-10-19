import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, ctx, go, snap, jl, save, d, name }) => {
  const SID = '14ac6c8c-c53d-4044-9688-e985c38f877b'
  const dbSets = () => psql(`select se.exercise_order||':'||se.display_name||' set'||ws.set_number||' w='||coalesce(ws.weight_kg::text,'-')||' r='||coalesce(ws.reps::text,'-')||' done='||ws.completed from exercise_sets ws join workout_session_exercises se on se.id=ws.session_exercise_id where se.workout_session_id='${SID}' and (ws.completed or ws.reps is not null) order by se.exercise_order, ws.set_number`)
  // navigate away and resume
  await go('/dashboard')
  const dashTxt = await snap('dashboard-midworkout')
  const resume = page.getByRole('link', { name: /resume workout/i }).first()
  const hasResume = await resume.count()
  const resumeHref = hasResume ? await resume.getAttribute('href') : null
  jl({ step2: 'dashboard-mid', hasResume, resumeHref, todayCard: (dashTxt.match(/TODAY'S TRAINING[\s\S]{0,160}/) ?? [''])[0], whatMatters: (dashTxt.match(/WHAT MATTERS NOW[\s\S]{0,200}/) ?? [''])[0] })
  if (hasResume) { const tR = Date.now(); await resume.click(); await page.waitForURL(/\/session\//); await page.waitForLoadState('networkidle'); jl({ step2: 'resume', clicks: 1, ms: Date.now() - tR, url: page.url(), sameSession: page.url().includes(SID) }) }
  else { await go('/dashboard/workouts'); const href = await page.locator('a[href*="/session/"]').first().getAttribute('href').catch(() => null); jl({ step2: 'resume-via-workouts', href, sameSession: href?.includes(SID) }) }
  await snap('resumed')
  const restored = await page.locator('main input[type=number]').evaluateAll((els) => els.slice(0, 4).map((e) => e.value))
  jl({ step2: 'resume-state', firstRowValues: restored })
  // OFFLINE: try to complete set 2 offline
  await go('/dashboard/workouts/session/' + SID)
  const r2 = page.locator('main input[type=number]')
  await r2.nth(4).fill('47'); await r2.nth(5).fill('7')
  await ctx.setOffline(true)
  const btn2 = page.locator('main button:not([aria-label])').filter({ hasNotText: /skip|complete workout/i }).nth(1)
  await btn2.click(); await page.waitForTimeout(6000)
  const offTxt = await page.locator('main').last().innerText()
  await page.screenshot({ path: `${d}/${name}-offline-after-click.png` })
  const offMsg = (offTxt.match(/Set saved\.|offline|failed|unable|error|could not|couldn't|network[^\n]*/i) ?? [null])[0]
  const btnHtml = await btn2.evaluate((b) => b.outerHTML.slice(0, 400))
  jl({ step2: 'offline-complete', offMsg, btnHtml, db: dbSets() })
  await ctx.setOffline(false); await page.waitForTimeout(5000)
  jl({ step2: 'back-online-5s', db: dbSets(), txtMsg: ((await page.locator('main').last().innerText()).match(/Set saved\.|failed[^\n]*|error[^\n]*/i) ?? [null])[0] })
  await page.reload(); await page.waitForLoadState('networkidle')
  await snap('offline-after-reload')
  jl({ step2: 'after-reload', values: await page.locator('main input[type=number]').evaluateAll((els) => els.slice(0, 8).map((e) => e.value)), db: dbSets() })
}
