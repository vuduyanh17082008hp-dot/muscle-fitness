export default async ({ page, go, APP, snap, jl, save, d, name }) => {
  await go('/dashboard')
  const t0 = Date.now()
  await page.getByRole('button', { name: /start workout/i }).or(page.getByRole('link', { name: /start workout/i })).first().click()
  await page.waitForURL(/\/session\//, { timeout: 30000 })
  const txt = await snap('after-click')
  jl({ ms: Date.now() - t0, url: page.url(), notStarted: /NOT STARTED/.test(txt) })
  save(`${d}/${name}-controls.json`, await page.evaluate(() => [...document.querySelectorAll('main button, main input, main select, main a')].map((e) => `${e.tagName} ${e.getAttribute('type') ?? ''} [${e.getAttribute('aria-label') ?? ''}] ${(e.innerText || e.getAttribute('placeholder') || e.getAttribute('name') || e.getAttribute('href') || '').trim().replace(/\s+/g,' ').slice(0, 60)}`)))
}
