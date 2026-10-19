export default async ({ page, go, snap, jl, save, d, name }) => {
  await go('/dashboard')
  const t0 = Date.now(); let clicks = 0
  await page.getByRole('link', { name: /^training$/i }).first().click(); clicks++
  await page.waitForURL(/\/dashboard\/workouts/); await page.waitForLoadState('networkidle')
  const planLink = page.locator('a[href*="/dashboard/workouts/plans/"]').first()
  jl({ planLinkText: (await planLink.innerText().catch(() => '')).slice(0, 80) })
  await planLink.click(); clicks++
  await page.waitForURL(/\/plans\//); await page.waitForLoadState('networkidle')
  const txt = await snap('plan')
  const starts = page.getByRole('button', { name: /start workout/i })
  jl({ startButtons: await starts.count(), clicks })
  // pick the Upper day's start button
  const upper = page.locator('form').filter({ has: page.getByRole('button', { name: /start workout/i }) })
  const n = await upper.count(); const labels = []
  for (let i = 0; i < n; i++) labels.push((await upper.nth(i).evaluate((f) => (f.closest('article,section,li,div[class*=rounded]') ?? f.parentElement).innerText.slice(0, 80))).replace(/\s+/g, ' '))
  jl({ dayForms: labels })
  const idx = Math.max(0, labels.findIndex((l) => /upper/i.test(l)))
  await starts.nth(idx).click(); clicks++
  await page.waitForURL(/\/session\//, { timeout: 30000 })
  const t = await snap('player')
  jl({ clicks, ms: Date.now() - t0, url: page.url(), inProgress: !/NOT STARTED/.test(t) })
  save(`${d}/${name}-controls.json`, await page.evaluate(() => [...document.querySelectorAll('main button, main input, main select, main textarea')].map((e) => `${e.tagName} ${e.getAttribute('type') ?? ''} [${e.getAttribute('aria-label') ?? ''}] ${(e.innerText || e.getAttribute('placeholder') || e.getAttribute('name') || '').trim().replace(/\s+/g,' ').slice(0, 60)}`)))
}
