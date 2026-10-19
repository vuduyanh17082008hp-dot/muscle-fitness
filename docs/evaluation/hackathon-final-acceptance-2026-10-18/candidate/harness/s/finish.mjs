import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, snap, jl }) => {
  const SID = '3ae53561-0773-4fe8-afd4-be71b2e28aee'
  await go('/dashboard/workouts/session/' + SID)
  await page.getByText(/WORKOUT IN PROGRESS/i).first().waitFor({ timeout: 30000 })
  const rows = page.locator('main input[type=number]')
  const btns = page.locator('main button:not([aria-label])').filter({ hasNotText: /skip|complete workout/i })
  for (const [i, w, r] of [[1, 40, 7], [2, 40, 6]]) { await rows.nth(i * 4).fill(String(w)); await rows.nth(i * 4 + 1).fill(String(r)); await btns.nth(i).click(); await page.waitForTimeout(1500) }
  await page.getByPlaceholder('1-10').fill('8').catch(() => {})
  const t0 = Date.now()
  const cw = page.getByRole('button', { name: /complete workout/i }).first()
  await cw.click()
  // any confirmation dialog?
  await page.waitForTimeout(1500)
  const dialog = await page.locator('[role=dialog], [role=alertdialog]').count()
  if (dialog) { jl({ confirmDialog: await page.locator('[role=dialog],[role=alertdialog]').first().innerText() }); await page.getByRole('button', { name: /confirm|finish|complete|yes/i }).last().click() }
  await page.waitForURL(/history|summary|session/, { timeout: 30000 }).catch(() => {})
  await page.waitForLoadState('networkidle')
  const hist = await snap('after-finish')
  jl({ finishMs: Date.now() - t0, url: page.url(), dialog, db: psql(`select session_state, completed_at is not null, session_rpe from workout_sessions where id='${SID}'`), histTop: hist.slice(0, 500) })
  await go('/dashboard'); const dsh = await snap('dash-after')
  jl({ dashCard: (dsh.match(/(SESSION COMPLETE|WORKOUT COMPLETE|COMPLETED|TODAY'S TRAINING|SESSION IN PROGRESS|SCHEDULED REST DAY)[\s\S]{0,220}/) ?? [dsh.slice(0, 250)])[0], whatMatters: (dsh.match(/WHAT MATTERS NOW[\s\S]{0,260}/) ?? [''])[0], brief: (dsh.match(/DANTE DAILY BRIEF[\s\S]{0,300}/) ?? [''])[0] })
  await go('/dashboard/recovery'); const rec = await snap('recovery-after')
  jl({ recTrainingCard: (rec.match(/TRAINING × RECOVERY[\s\S]{0,300}/) ?? [''])[0] })
  await go('/dashboard/nutrition'); const nut = await snap('nutrition-after')
  jl({ nutritionMentionsWorkout: /workout|training|post-?workout|session/i.test(nut.slice(0, 2500)), nutTop: nut.slice(0, 700) })
  await go('/dashboard/progress'); const pr = await snap('progress-after')
  jl({ progressTop: pr.slice(0, 600) })
}
