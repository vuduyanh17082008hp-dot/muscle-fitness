export default async ({ page, APP, jl }) => {
  await page.goto(APP + '/login', { waitUntil: 'networkidle' })
  if (!page.url().includes('/login')) return jl({ already: page.url() })
  await page.fill('#email', 'audit-final-demo@local.test'); await page.fill('#password', process.env.AUD_PASSWORD)
  await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 60000 }); jl({ url: page.url() })
}
