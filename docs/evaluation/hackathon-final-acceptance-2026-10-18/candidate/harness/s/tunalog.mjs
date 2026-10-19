export default async ({ page, go, snap, jl, d, name }) => {
  await go('/dashboard/nutrition')
  const card = page.locator('#coach li').filter({ hasText: /Tuna/ }).first()
  jl({ tunaCardOnFreshLoad: await card.count(), suggestedText: ((await page.locator('#coach').innerText()).match(/SUGGESTED FOR YOU[\s\S]{0,400}/) ?? [''])[0] })
  await card.getByRole('button', { name: /customize this meal/i }).click(); await page.waitForTimeout(3000)
  const log = page.locator('#coach').getByRole('button', { name: /log this meal/i }).first()
  await log.click(); await page.waitForTimeout(1500)
  const dlg = page.locator('[role=alertdialog]').first()
  const dlgText = await dlg.innerText().catch(() => null)
  await page.screenshot({ path: `${d}/${name}-confirm.png`, fullPage: false })
  jl({ confirmDialog: dlgText })
  if (dlgText) { await dlg.getByRole('button', { name: /confirm|log|yes/i }).first().click(); await page.waitForTimeout(5000) }
  jl({ afterConfirm: ((await page.locator('#coach').innerText()).match(/[^\n]*(logged|saved|added|allerg)[^\n]*/gi) ?? []).slice(0, 5) })
}
