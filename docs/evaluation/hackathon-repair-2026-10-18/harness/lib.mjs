// Shared browser helpers for the final acceptance audit. Read-only w.r.t. the candidate.
import { createRequire } from 'node:module'
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'
const require = createRequire('C:/Dev/Projects/muscle-fitness-claude/package.json')
export const { chromium } = require('playwright')
export const APP = 'http://localhost:3000'
export const EV = 'C:/Dev/Projects/muscle-fitness-claude/docs/evaluation/hackathon-repair-2026-10-18'
export const EMAIL = process.env.AUD_EMAIL ?? 'audit-final-demo@local.test'
export const PASSWORD = process.env.AUD_PASSWORD

export async function launch({ mobile = false, video = null, reducedMotion = 'no-preference' } = {}) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion, timezoneId: 'Asia/Singapore',
    ...(video ? { recordVideo: { dir: video, size: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 } } } : {}),
  })
  const page = await ctx.newPage()
  const log = { console: [], pageErrors: [], failed: [], api: [] }
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) log.console.push(`${m.type()}: ${m.text().slice(0, 400)}`) })
  page.on('pageerror', (e) => log.pageErrors.push(String(e).slice(0, 400)))
  page.on('requestfailed', (r) => log.failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`))
  page.on('response', async (r) => {
    const u = r.url()
    if (u.includes('/api/') || r.request().method() === 'POST') log.api.push({ t: Date.now(), m: r.request().method(), u: u.replace(APP, ''), s: r.status() })
  })
  return { browser, ctx, page, log }
}

export async function login(page, email = EMAIL, password = PASSWORD) {
  await page.goto(APP + '/login', { waitUntil: 'networkidle' })
  await page.locator('input[type=email], input[name=email]').first().fill(email)
  await page.locator('input[type=password]').first().fill(password)
  const t0 = Date.now()
  await page.locator('button[type=submit]').first().click()
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 60000 })
  return Date.now() - t0
}

export function out(dir) { const d = `${EV}/${dir}`; mkdirSync(d, { recursive: true }); return d }
export const jl = (file, obj) => appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n')
export const save = (file, s) => writeFileSync(file, typeof s === 'string' ? s : JSON.stringify(s, null, 2))

// Visible interactive controls, for CTA inventory.
export async function controls(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, a[href], [role=button], input, select, textarea')]
    .filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' })
    .map((e) => ({ tag: e.tagName.toLowerCase(), text: (e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 60), href: e.getAttribute('href'), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), y: Math.round(e.getBoundingClientRect().top + scrollY) })))
}
