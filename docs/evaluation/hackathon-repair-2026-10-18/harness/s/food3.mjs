const dump = (scope) => scope.evaluate((r) => [...r.querySelectorAll('button,input,select,textarea')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${e.tagName} ${e.getAttribute('type') ?? ''} [${e.getAttribute('aria-label') ?? ''}] ${(e.innerText || e.getAttribute('placeholder') || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 70)}`))
export default async ({ page, go, snap, jl, save, d, name, log }) => {
  await go('/dashboard/nutrition')
  await page.getByRole('button', { name: /track food/i }).first().waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: /track food/i }).first().click()
  await page.getByRole('button', { name: /search food/i }).click()
  const dlg = page.locator('[role=dialog]').last()
  const input = dlg.getByRole('textbox').first().or(dlg.locator('input').first())
  await input.click(); await input.pressSequentially(process.env.Q ?? 'chicken rice', { delay: 40 })
  const tq = Date.now(); const samples = []
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500)
    const t = await dlg.innerText()
    samples.push(t.includes('Searching') ? 'S' : '.')
    if (!t.includes('Searching') && !t.includes('Start typing') && samples.includes('S')) break
  }
  const ms = Date.now() - tq
  await page.screenshot({ path: `${d}/${name}-results.png` })
  save(`${d}/${name}-results-controls.json`, await dump(dlg))
  jl({ q: process.env.Q ?? 'chicken rice', resolvedMs: ms, samples: samples.join(''), resultsText: (await dlg.innerText()).slice(0, 1600), apis: log.api.filter((a) => /nutrition|food|search/.test(a.u)).map((a) => `${a.m} ${a.u} ${a.s}`) })
}
