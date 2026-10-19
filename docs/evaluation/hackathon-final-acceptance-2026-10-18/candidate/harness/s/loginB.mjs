export default async ({ page, go, APP, jl }) => {
  await page.goto(APP + '/login', { waitUntil: 'networkidle' })
  await page.fill('#email', 'audit-final-b@local.test'); await page.fill('#password', 'AuditFinalB-2026!x9')
  await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 60000 }); jl({ url: page.url() })
}
