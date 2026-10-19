export default async ({ page, APP, jl }) => {
  await page.goto(APP + '/login', { waitUntil: 'networkidle' })
  if (!page.url().includes('/login')) return jl({ already: page.url() })
  await page.fill('#email', 'audit-final-demo@local.test'); await page.fill('#password', process.env.AUD_PASSWORD)
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }; jl({ url: page.url() })
}
