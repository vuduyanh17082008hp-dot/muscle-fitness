export default async ({ page, go, snap, jl }) => {
  await go('/dashboard')
  const t = await snap('dash-before')
  const hero = await page.locator('main').last().innerText()
  jl({ heroCTA: await page.getByRole('link', { name: /start workout|resume workout|review session/i }).allInnerTexts(), buttons: await page.getByRole('button', { name: /start workout/i }).count(), todayCard: (t.match(/TODAY'S TRAINING[\s\S]{0,200}/) ?? [t.slice(0, 300)])[0] })
  const cta = page.getByRole('link', { name: /start workout/i }).or(page.getByRole('button', { name: /start workout/i })).first()
  if (await cta.count()) { const href = await cta.getAttribute('href'); const t0 = Date.now(); await cta.click(); await page.waitForLoadState('networkidle'); jl({ ctaHref: href, landed: page.url(), ms: Date.now() - t0 }); await snap('after-cta') }
}
