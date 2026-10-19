import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
const UB = '085a8aae-c2d1-4efd-afb7-a6d1bf129499'
const dump = (scope) => scope.evaluate((r) => [...r.querySelectorAll('button,input,select,textarea')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => `${e.tagName} ${e.getAttribute('type') ?? ''} [${e.getAttribute('aria-label') ?? ''}] ${(e.innerText || e.getAttribute('placeholder') || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 70)}`))
const kcal = async (page) => (await page.locator('main').last().innerText()).match(/CALORIES\s*\n+\s*([\d,]+)\s*\/\s*([\d,]+)/)?.[1]
export default async ({ page, go, snap, jl, save, d, name }) => {
  await go('/dashboard/nutrition')
  const before = await kcal(page)
  const dbBefore = psql(`select count(*) from food_logs where user_id='${UB}' and log_date=current_date`)
  const t0 = Date.now(); let n = 0
  await page.getByRole('button', { name: /track food/i }).first().click(); n++
  await page.getByRole('button', { name: /search food/i }).click(); n++
  const dlg = page.locator('[role=dialog]').last()
  const input = dlg.locator('input').first()
  await input.click(); await input.pressSequentially('chicken breast', { delay: 30 }); n++
  await dlg.getByText(/USDA FOODDATA CENTRAL/i).first().waitFor({ timeout: 30000 })
  await dlg.getByText('Chicken, breast, boneless, skinless, raw').first().click(); n++
  const tl = Date.now()
  await dlg.getByText('Loading…').waitFor({ state: 'hidden', timeout: 45000 }).catch(() => {})
  const confirmLoadMs = Date.now() - tl
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${d}/${name}-confirm.png` })
  save(`${d}/${name}-confirm-controls.json`, await dump(dlg))
  const confirmText = await dlg.innerText()
  // portion edit: find a grams/quantity input
  const qty = dlg.locator('input[type=number], input[inputmode=decimal], input[inputmode=numeric]').first()
  let qtyBefore = null
  if (await qty.count()) { qtyBefore = await qty.inputValue(); await qty.fill('150'); n++ }
  await page.waitForTimeout(500)
  const preview = (await dlg.innerText()).slice(0, 900)
  const btn = dlg.getByRole('button', { name: /^(log|add|confirm|save)/i }).last()
  const btnDisabled = await btn.isDisabled()
  const btnText = await btn.innerText()
  const tc = Date.now(); await btn.click(); n++
  let after = null, ms = null
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(100); const k = await kcal(page).catch(() => null); if (k && k !== before) { after = k; ms = Date.now() - tc; break } }
  await page.waitForTimeout(2000)
  const toast = (await page.locator('body').innerText()).match(/[^\n]*(logged|added|saved|undo)[^\n]*/i)?.[0]
  const db = psql(`select food_name, quantity_grams, calories, protein_g, source, is_estimated from food_logs where user_id='${UB}' and log_date=current_date order by created_at desc limit 1`)
  jl({ confirmLoadMs, interactions: n, totalMs: Date.now() - t0, qtyBefore, btnText, btnDisabled, before, after, macroUpdateMs: ms, toast, dbBefore, db, confirmText: confirmText.slice(0, 700), preview })
  await page.reload(); await page.waitForLoadState('networkidle')
  jl({ afterReload: await kcal(page), dbCount: psql(`select count(*) from food_logs where user_id='${UB}' and log_date=current_date`) })
  await snap('after-reload')
  // 1-tap Add Again
  const before2 = await kcal(page)
  const ta = Date.now(); await page.getByRole('button', { name: /add again/i }).first().click()
  let a2 = null, ms2 = null
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(100); const k = await kcal(page).catch(() => null); if (k && k !== before2) { a2 = k; ms2 = Date.now() - ta; break } }
  await page.waitForTimeout(1500)
  jl({ addAgain: { before2, a2, ms2, toast: (await page.locator('body').innerText()).match(/[^\n]*(logged|added|undo)[^\n]*/i)?.[0], db: psql(`select food_name, quantity_grams, calories, source from food_logs where user_id='${UB}' and log_date=current_date order by created_at desc limit 1`) } })
  await page.screenshot({ path: `${d}/${name}-after-addagain.png` })
}
