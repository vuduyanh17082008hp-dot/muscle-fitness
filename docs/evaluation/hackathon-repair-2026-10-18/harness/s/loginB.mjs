export default async ({ page, go, APP, jl }) => {
  await page.goto(APP + '/login', { waitUntil: 'networkidle' })
  await page.fill('#email', 'audit-final-b@local.test'); await page.fill('#password', 'AuditFinalB-2026!x9')
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }; jl({ url: page.url() })
}
