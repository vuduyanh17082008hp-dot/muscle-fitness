export default async ({ page, go, snap, jl, save, d, name }) => {
  await go('/dashboard/nutrition')
  const t0 = Date.now()
  await page.getByRole('button', { name: /track food/i }).or(page.getByRole('link', { name: /track food/i })).first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${d}/${name}-sheet.png` })
  const dlg = page.locator('[role=dialog]').last()
  const scope = (await dlg.count()) ? dlg : page.locator('body')
  save(`${d}/${name}-sheet-controls.json`, await scope.evaluate((r) => [...r.querySelectorAll('button,input,select,textarea,[role=tab]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${e.tagName} ${e.getAttribute('type') ?? ''} [${e.getAttribute('aria-label') ?? ''}] ${(e.innerText || e.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60)}`)))
  jl({ openMs: Date.now() - t0, dialog: await dlg.count(), text: (await scope.innerText()).slice(0, 800) })
}
