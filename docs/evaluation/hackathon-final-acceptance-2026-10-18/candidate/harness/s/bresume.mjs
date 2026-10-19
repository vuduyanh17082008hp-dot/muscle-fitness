export default async ({ page, go, snap, jl }) => {
  await go('/dashboard')
  const r = page.getByRole('link', { name: /resume workout/i }).first()
  const box = await r.boundingBox()
  const t0 = Date.now()
  await r.click()
  let url = null
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); if (page.url().includes('/session/')) { url = page.url(); break } }
  const ms = Date.now() - t0
  await page.waitForLoadState('networkidle').catch(() => {})
  const shown = await page.getByText(/WORKOUT IN PROGRESS/i).first().isVisible().catch(() => false)
  jl({ box, urlChangedMs: url ? ms : null, url: page.url(), playerVisible: shown, values: await page.locator('main input[type=number]').evaluateAll((e) => e.slice(0, 4).map((x) => x.value)) })
  await snap('resumed')
}
