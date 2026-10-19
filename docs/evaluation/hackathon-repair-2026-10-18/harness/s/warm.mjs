// Warm-up only (not graded): compile client chunks for the journey routes on a fresh dev server.
export default async ({ page, go, jl }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 240000 })
  for (let i = 0; i < 4 && page.url().includes('/login'); i++) { await page.waitForTimeout(4000); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 60000 }).catch(() => {}) }
  for (const url of ['/dashboard', '/dashboard/recovery', '/dashboard/workouts', '/dashboard/nutrition', '/dashboard/ai-coach', '/dashboard/workouts/history']) await go(url).catch(() => {})
  jl({ warmed: true, url: page.url() })
}
