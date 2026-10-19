// Every recommending surface on /dashboard/nutrition for a fish-allergic user: plan, budget swaps, cards, picker.
export default async ({ page, go, snap, jl }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  await go('/dashboard/nutrition'); await page.waitForTimeout(4000)
  const text = await snap('nutrition')
  const hits = [...text.matchAll(/[^\n]*\b(Salmon|Cod|Tuna|White Fish|Fish)\b[^\n]*/g)].map((m) => m[0].trim()).slice(0, 20)
  const pickerFish = await page.locator('#coach fieldset button').filter({ hasText: /^(Fish|Tuna)$/ }).count()
  jl({ fishMentions: hits, pickerFish })
}
