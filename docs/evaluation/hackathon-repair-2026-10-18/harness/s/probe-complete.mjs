// Mobile: is the player's "Complete workout" button reachable, or covered by another fixed layer?
import { execFileSync } from 'node:child_process'
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_muscle-fitness-claude', 'psql', '-U', 'postgres', '-tA'], { input: sql }).toString().trim()
export default async ({ page, go, jl, d, name }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) }
  const U = psql(`select id from auth.users where email='${process.env.EMAIL}'`)
  const SID = psql(`select id from workout_sessions where user_id='${U}' and session_state='in_progress' order by started_at desc limit 1`)
  await go('/dashboard/workouts/session/' + SID)
  await page.locator('main input[type=number]').first().waitFor({ timeout: 30000 })
  const info = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /complete workout/i.test(b.textContent ?? ''))
    if (!btn) return { found: false }
    const r = btn.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const cs = getComputedStyle(btn)
    const chain = []; for (let e = top; e && chain.length < 6; e = e.parentElement) chain.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 60)}`)
    return { found: true, rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, vh: innerHeight, visibility: cs.visibility, display: cs.display, disabled: btn.disabled, coveredBy: btn.contains(top) ? null : chain }
  })
  await page.screenshot({ path: `${d}/${name}-viewport.png` })
  jl({ info })
}
