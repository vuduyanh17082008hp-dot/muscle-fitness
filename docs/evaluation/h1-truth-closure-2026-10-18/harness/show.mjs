// Print every turn of a run file for hand grading. Usage: node show.mjs <file.jsonl> [ID,ID] [maxChars]
import { readFileSync } from 'node:fs'
const [file, ids, max] = process.argv.slice(2)
const only = ids && ids !== '-' ? new Set(ids.split(',')) : null
for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(line)
  if (only && !only.has(r.id)) continue
  console.log(`\n=== ${r.id} r${r.rep} — expect: ${r.expect}`)
  for (const t of r.turns ?? []) {
    if (t.user === undefined) { console.log(`  [${t.kind}] ${JSON.stringify(t).slice(0, 300)}`); continue }
    const branch = (t.trace ?? []).find((x) => x.startsWith('phase1:'))?.match(/branch=(\w+)/)?.[1] ?? t.kind
    console.log(`  U(${t.coach}): ${t.user}\n  A[${branch} ${t.model ?? ''} ${t.ms}ms ${t.status}]: ${(t.text ?? '').slice(0, Number(max ?? 1400)).replace(/\n+/g, ' ¶ ')}`)
  }
  if (r.checks && Object.keys(r.checks).length) console.log('  checks:', JSON.stringify(r.checks))
}
