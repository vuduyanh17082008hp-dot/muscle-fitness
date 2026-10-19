// Auto-grade a run: last assistant text vs the case's bad/good markers, plus DB checks. Hand review decides REVIEW rows.
// Usage: node grade.mjs <run.jsonl> [more.jsonl...]
import { readFileSync } from 'node:fs'
import { CASES, CRITICAL } from './casesH1.mjs'
const byId = new Map([...CASES, ...CRITICAL].map((c) => [c.id, c]))
const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)))
const tally = {}
for (const r of rows) {
  const c = byId.get(r.id)
  if (!c || r.runnerError) { console.log(`${r.id} r${r.rep} ENV runner_error`); continue }
  const said = (r.turns ?? []).filter((t) => typeof t.text === 'string' && t.status)
  const last = said.at(-1)?.text ?? ''
  const env = said.some((t) => t.status >= 500 || t.status === 0) || (r.turns ?? []).some((t) => t.kind === 'harness_error')
  const why = []
  if (c.bad && c.bad.test(last)) why.push('BAD:' + last.match(c.bad)[0])
  if (c.good && !c.good.test(last)) why.push('MISSING_GOOD')
  const confirms = (r.turns ?? []).filter((t) => t.kind === 'confirm')
  if (confirms.some((t) => t.intent === 'confirm')) {
    const ok = confirms.every((t) => t.status === 200 && t.body?.status === 'executed') && r.checks?.logs === '1'
    if (!ok) why.push(`CONFIRM_FAIL logs=${r.checks?.logs} ${JSON.stringify(confirms.map((t) => t.body?.status ?? t.note))}`)
  }
  if (confirms.some((t) => t.intent === 'cancel') && r.checks?.logs !== '0') why.push('CANCEL_WROTE')
  if (confirms.length === 0 && r.checks?.logs && r.checks.logs !== '0') why.push('UNCONFIRMED_WRITE')
  const verdict = env ? 'ENV' : why.length ? 'FAIL?' : 'PASS?'
  ;(tally[c.cat] ??= { 'PASS?': 0, 'FAIL?': 0, ENV: 0 })[verdict]++
  console.log(`${verdict.padEnd(5)} ${r.id} r${r.rep} ${why.join(' | ')}`)
}
console.log(JSON.stringify(tally))
