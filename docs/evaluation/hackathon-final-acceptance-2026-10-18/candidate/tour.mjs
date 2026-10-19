// Screen tour: timings, screenshots, CTA inventory, axe scan. Usage: node tour.mjs desktop|mobile <pass-label>
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { launch, login, out, jl, save, controls, APP } from './lib.mjs'
const require = createRequire('C:/Dev/Projects/muscle-fitness-claude/package.json')
const axeSrc = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

const mode = process.argv[2] ?? 'desktop'
const pass = process.argv[3] ?? 'p1'
const mobile = mode === 'mobile'
const PAGES = ['/dashboard', '/dashboard/workouts', '/dashboard/nutrition', '/dashboard/recovery', '/dashboard/progress', '/dashboard/ai-coach', '/dashboard/workouts/history', '/dashboard/training-intelligence', '/dashboard/calendar', '/account', '/settings']
const d = out('journeys/tour')
const shots = out(`shots/tour-${mode}`)
const { browser, page, log } = await launch({ mobile })
const loginMs = await login(page)
jl(`${d}/tour.jsonl`, { mode, pass, kind: 'login', ms: loginMs, url: page.url() })

for (const p of PAGES) {
  const t0 = Date.now()
  let status = null
  try {
    const r = await page.goto(APP + p, { waitUntil: 'commit', timeout: 90000 })
    status = r?.status()
    await page.waitForLoadState('domcontentloaded', { timeout: 90000 })
    const dcl = Date.now() - t0
    // meaningful content: main region has text and no busy/skeleton marker
    await page.waitForFunction(() => {
      const m = document.querySelector('main') ?? document.body
      return m.innerText.trim().length > 150 && !document.querySelector('[aria-busy="true"], .animate-pulse')
    }, null, { timeout: 30000 }).catch(() => {})
    const meaningful = Date.now() - t0
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
    const idle = Date.now() - t0
    const name = p.replace(/\//g, '_') || 'root'
    if (pass === 'p1') await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
    const info = await page.evaluate(() => ({
      title: document.title, h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()).slice(0, 3),
      h2: [...document.querySelectorAll('h2')].map((h) => h.innerText.trim()).slice(0, 12),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1, scrollW: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight, finalPath: location.pathname,
    }))
    let axe = null, ctl = null
    if (pass === 'p1') {
      ctl = await controls(page)
      await page.addScriptTag({ content: axeSrc })
      axe = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary ?? '').slice(0, 160)) }))
      })
      const small = mobile ? ctl.filter((c) => c.tag !== 'input' && (c.w < 24 || c.h < 24)) : []
      save(`${d}/${mode}${name}.controls.json`, { controls: ctl, smallTargets: small })
    }
    jl(`${d}/tour.jsonl`, { mode, pass, page: p, status, dcl, meaningful, idle, ...info, axe, nControls: ctl?.length })
  } catch (e) {
    jl(`${d}/tour.jsonl`, { mode, pass, page: p, status, error: String(e).slice(0, 300), ms: Date.now() - t0 })
  }
}
save(`${d}/${mode}-${pass}.browserlog.json`, log)
await browser.close()
