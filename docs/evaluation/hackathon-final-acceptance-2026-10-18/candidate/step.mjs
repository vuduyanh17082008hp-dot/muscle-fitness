// Step runner: persistent profile (cookies survive between steps). Usage: node step.mjs <outDir> <stepName> <script.mjs> [mobile]
// The step script default-exports async ({ page, ctx, snap, jl, save, APP, d, log }) => {...}
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { out, jl as jlRaw, save, APP, EV } from './lib.mjs'
const require = createRequire('C:/Dev/Projects/muscle-fitness-claude/package.json')
const { chromium } = require('playwright')
const [dir, name, script, mobileArg] = process.argv.slice(2)
const mobile = mobileArg === 'mobile'
const d = out(dir)
const profile = `C:/Users/DUYANH~1/AppData/Local/Temp/claude/C--Dev-Projects-muscle-fitness-claude/14ce409f-e96f-428e-ba77-8946fd47f336/scratchpad/profile-${process.env.PROFILE ?? (mobile ? 'm' : 'd')}`
const ctx = await chromium.launchPersistentContext(profile, { headless: true, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, timezoneId: 'Asia/Singapore', recordVideo: { dir: d, size: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 } } })
const page = ctx.pages()[0] ?? await ctx.newPage()
const log = { console: [], pageErrors: [], api: [] }
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.console.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => log.pageErrors.push(String(e).slice(0, 300)))
page.on('response', (r) => { const u = r.url(); if (u.includes('/api/') || r.request().method() === 'POST') log.api.push({ t: Date.now(), m: r.request().method(), u: u.replace(APP, '').slice(0, 120), s: r.status() }) })
const settle = async () => {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForFunction(() => !document.querySelector('main .animate-pulse, [aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {})
}
const go = async (url) => {
  for (let i = 0; i < 4; i++) {
    await page.goto(url.startsWith('http') ? url : APP + url, { timeout: 90000 }).catch((e) => log.pageErrors.push('goto ' + e))
    await settle()
    const bad = await page.evaluate(() => /Unexpected end of JSON input|Manifest file is empty|Internal Server Error/.test(document.body.innerText)).catch(() => true)
    if (!bad) return i
    jlRaw(`${d}/dev-errors.jsonl`, { step: name, url, attempt: i })
    await page.waitForTimeout(2000)
  }
  throw new Error('dev error page persisted: ' + url)
}
const snap = async (n) => { await settle(); await page.screenshot({ path: `${d}/${name}-${n}.png`, fullPage: true }); const t = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText); save(`${d}/${name}-${n}.txt`, t); return t }
const jl = (o) => jlRaw(`${d}/steps.jsonl`, { step: name, ...o })
try {
  const mod = await import(pathToFileURL(script).href)
  await mod.default({ page, ctx, go, snap, settle, jl, save, APP, d, log, name })
} catch (e) {
  jl({ error: String(e).slice(0, 500) }); console.error(e)
  await page.screenshot({ path: `${d}/${name}-ERROR.png`, fullPage: true }).catch(() => {})
} finally {
  save(`${d}/${name}.browserlog.json`, log)
  await ctx.close()
}
