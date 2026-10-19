// Usage: MSGS='["m1","m2"]' URL=/dashboard/ai-coach
export default async ({ page, go, snap, jl, save, d, name, log }) => {
  const msgs = JSON.parse(process.env.MSGS)
  await go(process.env.URL ?? '/dashboard/ai-coach')
  const box = page.getByRole('textbox', { name: /message to dante/i }).first()
  await box.waitFor({ timeout: 30000 })
  const transcript = []
  for (const m of msgs) {
    const bodyBefore = await page.locator('main').last().innerText()
    await box.click(); await box.fill(m)
    const t0 = Date.now(); await page.keyboard.press('Enter')
    // first feedback: user bubble or loading indicator appears; first assistant text growth
    let first = null, firstText = null, done = null, last = '', stable = 0
    for (let i = 0; i < 400; i++) {
      await page.waitForTimeout(100)
      const t = await page.locator('main').last().innerText()
      if (first === null && t !== bodyBefore) first = Date.now() - t0
      const busy = await page.locator('[aria-busy="true"], .animate-spin, .animate-bounce, [data-state="loading"]').count()
      if (firstText === null && t.length > bodyBefore.length + m.length + 40) firstText = Date.now() - t0
      if (t === last && !busy && firstText !== null) { stable++; if (stable >= 20) { done = Date.now() - t0 - 2000; break } } else stable = 0
      last = t
    }
    const reply = last.slice(bodyBefore.length > 0 ? Math.max(0, last.indexOf(m) + m.length) : 0)
    transcript.push({ m, firstFeedbackMs: first, firstTextMs: firstText, doneMs: done, reply: reply.slice(0, 2500) })
    jl({ m, firstFeedbackMs: first, firstTextMs: firstText, doneMs: done, reply: reply.slice(0, 2500) })
  }
  await snap('end')
  save(`${d}/${name}-transcript.json`, transcript)
  jl({ apis: log.api.filter((a) => /chatbot|dante/.test(a.u)).map((a) => `${a.m} ${a.u} ${a.s}`) })
}
