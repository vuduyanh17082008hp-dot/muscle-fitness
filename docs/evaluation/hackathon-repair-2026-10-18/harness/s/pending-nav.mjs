// F-16: Dante pending proposal survives navigation + refresh; Confirm writes exactly one row; a duplicate confirm adds none.
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, snap, jl }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const rows = () => psql(`select count(*) from food_logs where user_id='${U}' and food_name ilike '%chicken%' and created_at > now() - interval '1 hour'`)
  const pending = () => psql(`select string_agg(status, ',') from dante_tool_actions where user_id='${U}' and created_at > now() - interval '1 hour'`)
  await go('/dashboard/ai-coach')
  const box = page.getByRole('textbox', { name: /message to dante/i }).first()
  await box.waitFor({ timeout: 30000 }); await box.fill('Log 150 g grilled chicken breast for lunch'); await page.keyboard.press('Enter')
  const confirm = page.getByRole('button', { name: /^confirm/i }).first()
  const appeared = await confirm.waitFor({ timeout: 60000 }).then(() => true).catch(() => false)
  jl({ step: 'proposal', cardShown: appeared, rows: rows(), actions: pending() })
  await snap('proposal')
  await go('/dashboard'); await go('/dashboard/ai-coach')
  await page.waitForTimeout(2500)
  const afterNav = await confirm.count()
  jl({ step: 'after-navigation', confirmVisible: afterNav, text: (await page.locator('main').last().innerText()).match(/This is still waiting[^\n]*|Log [^\n]*chicken[^\n]*/gi) })
  await snap('after-nav')
  await page.reload(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2500)
  const afterReload = await confirm.count()
  jl({ step: 'after-refresh', confirmVisible: afterReload })
  if (afterReload) {
    await confirm.click()
    const done = await page.getByText(/✓ Done/).first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false)
    jl({ step: 'confirmed', doneReceipt: done, rows: rows(), actions: pending() })
    await snap('confirmed')
    await go('/dashboard'); await go('/dashboard/ai-coach'); await page.waitForTimeout(2500)
    jl({ step: 'after-confirm-nav', staleConfirmVisible: await confirm.count(), rows: rows() })
  }
}
