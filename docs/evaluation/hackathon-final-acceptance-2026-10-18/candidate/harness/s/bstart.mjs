export default async ({ page, go, snap, jl }) => {
  await go('/dashboard/workouts')
  const w = await snap('workouts')
  jl({ workoutsTop: w.slice(0, 400) })
  const t0 = Date.now(); let clicks = 0
  await page.locator('a[href*="/dashboard/workouts/plans/"]:not([href$="/new"])').filter({ hasText: /active/i }).first().click(); clicks++
  await page.waitForURL(/\/plans\//); await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /start workout/i }).first().click(); clicks++
  await page.waitForURL(/\/session\//, { timeout: 30000 }); await page.waitForLoadState('networkidle')
  const sid = page.url().split('/session/')[1]
  jl({ started: sid, clicksFromWorkouts: clicks, ms: Date.now() - t0 })
  const rows = page.locator('main input[type=number]')
  await rows.nth(0).fill('40'); await rows.nth(1).fill('8')
  await page.locator('main button:not([aria-label])').filter({ hasNotText: /skip|complete workout/i }).first().click()
  await page.getByText('Set saved.').waitFor({ timeout: 20000 })
  await go('/dashboard')
  const d = await snap('dash-mid')
  const resume = page.getByRole('link', { name: /resume workout/i })
  jl({ resumeLinks: await resume.count(), resumeHref: await resume.first().getAttribute('href').catch(() => null), sameSession: (await resume.first().getAttribute('href').catch(() => '')).includes(sid), card: (d.match(/(WORKOUT IN PROGRESS|TODAY'S TRAINING|SCHEDULED REST DAY)[\s\S]{0,160}/) ?? [d.slice(0, 200)])[0], whatMatters: (d.match(/WHAT MATTERS NOW[\s\S]{0,160}/) ?? [''])[0] })
  if (await resume.count()) { const t1 = Date.now(); await resume.first().click(); await page.waitForURL(/\/session\//); await page.waitForLoadState('networkidle'); jl({ resumeMs: Date.now() - t1, values: await page.locator('main input[type=number]').evaluateAll((e) => e.slice(0, 4).map((x) => x.value)) }); await snap('resumed') }
}
