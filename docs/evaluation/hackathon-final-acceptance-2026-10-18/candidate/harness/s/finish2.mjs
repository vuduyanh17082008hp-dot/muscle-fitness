import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, snap, jl }) => {
  const SID = '3ae53561-0773-4fe8-afd4-be71b2e28aee'
  await go('/dashboard/workouts/session/' + SID)
  await page.getByText(/WORKOUT IN PROGRESS/i).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  const rows = page.locator('main input[type=number]')
  const btns = page.locator('main button.h-11:not([aria-label])')
  jl({ nInputs: await rows.count(), nSetBtns: await btns.count() })
  for (const i of [1, 2]) {
    await rows.nth(i * 4).fill('40'); await rows.nth(i * 4 + 1).fill('7')
    const t = Date.now(); await btns.nth(i).click()
    const ok = await page.getByText('Set saved.').waitFor({ timeout: 15000 }).then(() => Date.now() - t).catch(() => null)
    jl({ set: i + 1, savedMs: ok, progress: (await page.locator('main').last().innerText()).match(/Session progress\s*\n?(\d+\/\d+)/)?.[1] })
    await page.waitForTimeout(800)
  }
  await page.getByPlaceholder('1-10').fill('8').catch(() => {})
  const cw = page.getByRole('button', { name: /complete workout/i }).first()
  jl({ completeDisabled: await cw.isDisabled() })
  const t0 = Date.now(); await cw.click()
  await page.waitForURL(/history/, { timeout: 30000 }).catch(() => {})
  await page.waitForLoadState('networkidle')
  const h = await snap('after-finish')
  jl({ finishMs: Date.now() - t0, url: page.url(), db: psql(`select session_state, completed_at is not null, session_rpe from workout_sessions where id='${SID}'`), msg: (h.match(/[^\n]*(error|fail|could not|unable)[^\n]*/i) ?? [null])[0], histTop: h.slice(0, 300) })
}
