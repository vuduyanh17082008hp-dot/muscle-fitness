// TURNS='[{"c":"dante","m":"..."},{"c":"gemma","m":"..."}]' EMAIL PW
export default async ({ page, go, snap, jl, save, d, name }) => {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  if (page.url().includes('/login')) { await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); for (let i = 0; i < 3 && page.url().includes('/login'); i++) { await page.waitForTimeout(2500); await page.fill('#email', process.env.EMAIL); await page.fill('#password', process.env.PW); await page.click('button[type=submit]'); await page.waitForURL(/dashboard/, { timeout: 40000 }).catch(() => {}) } }
  const turns = JSON.parse(process.env.TURNS)
  let where = null; const out = []
  for (const t of turns) {
    if (t.c === 'tuna-click') {
      const card = page.locator('#coach li').filter({ hasText: /Tuna/ }).first()
      const has = await card.count()
      const before = await page.locator('#coach').innerText()
      if (has) { await card.getByRole('button', { name: /customize this meal/i }).click(); await page.waitForTimeout(6000) }
      const after = await page.locator('#coach').innerText()
      const rec = { coach: 'tuna-click', tunaCardPresent: has, draftText: after.slice(0, 2500), changed: after !== before, mentionsAllergy: /allerg|fish/i.test(after.replace(before, '')) }
      out.push(rec); jl(rec); await page.screenshot({ path: `${d}/${name}-tuna-click.png`, fullPage: true })
      // try to log it if a log/confirm control exists
      const logBtn = page.locator('#coach').getByRole('button', { name: /^log( this| meal| it)?|add to (today|log)/i }).first()
      if (await logBtn.count()) { await logBtn.click(); await page.waitForTimeout(4000); const t2 = await page.locator('#coach').innerText(); const r2 = { coach: 'tuna-log', after: t2.slice(0, 1500) }; out.push(r2); jl(r2); await page.screenshot({ path: `${d}/${name}-tuna-log.png`, fullPage: true }) }
      continue
    }
    const target = t.c === 'dante' ? '/dashboard/ai-coach' : '/dashboard/nutrition'
    if (where !== target) { await go(target); where = target }
    const region = t.c === 'dante' ? page.locator('main').last() : page.locator('#coach')
    const box = t.c === 'dante' ? page.getByRole('textbox', { name: /message to dante/i }).first() : page.getByPlaceholder('Ask about a meal or craving...')
    await box.waitFor({ timeout: 30000 }); await box.scrollIntoViewIfNeeded()
    const before = await region.innerText()
    await box.click(); await box.fill(t.m)
    let sendWaitMs = 0
    if (t.c === 'gemma') { const sb = page.getByRole('button', { name: 'Send message' }); const tw = Date.now(); await page.waitForFunction(() => !document.querySelector('button[aria-label="Send message"]')?.disabled, null, { timeout: 60000 }).catch(() => {}); sendWaitMs = Date.now() - tw }
    // Dante: wait for prior turn's analyzing indicator to clear
    if (t.c === 'dante') await page.waitForFunction(() => !/ANALYZING/.test(document.querySelector('main:last-of-type')?.innerText ?? document.body.innerText), null, { timeout: 60000 }).catch(() => {})
    const t0 = Date.now(); await page.keyboard.press('Enter')
    let last = '', stable = 0, firstText = null
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(100)
      const now = await region.innerText()
      if (firstText === null && now.length > before.length + t.m.length + 40 && !/ANALYZING|Thinking|…\s*$/.test(now.slice(-80))) firstText = Date.now() - t0
      if (now === last && firstText !== null) { if (++stable >= 25) break } else stable = 0
      last = now
    }
    const idx = last.lastIndexOf(t.m)
    const reply = idx >= 0 ? last.slice(idx + t.m.length) : last.slice(before.length)
    const rec = { sendWaitMs, coach: t.c, m: t.m, firstTextMs: firstText, totalMs: Date.now() - t0 - 2500, reply: reply.trim().slice(0, 3000) }
    out.push(rec); jl(rec)
  }
  await snap('end')
  save(`${d}/${name}-transcript.json`, out)
}
