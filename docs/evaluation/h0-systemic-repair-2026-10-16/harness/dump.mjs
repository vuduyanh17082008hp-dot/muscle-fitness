import { readFileSync } from 'node:fs'
const [file, filter] = process.argv.slice(2)
const re = filter ? new RegExp(filter) : null
for (const line of readFileSync(file, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line)
  if (re && !re.test(r.id)) continue
  console.log(`\n########## ${r.id} r${r.rep} [${r.cat}/${r.pop}${r.pair ? ' ' + r.pair : ''}] EXPECT: ${r.expect}`)
  if (r.seed) console.log('SEED', JSON.stringify(r.seed))
  if (r.checks && Object.keys(r.checks).length) console.log('DB', JSON.stringify(r.checks))
  for (const t of r.turns ?? []) {
    if (t.user !== undefined) {
      console.log(`--> [${t.coach}] ${t.user}   (${t.status} ${t.kind} ${t.model ?? t.code ?? ''} ${t.runtime ? JSON.stringify(t.runtime).slice(0, 120) : ''} safety=${t.safety}:${t.safetyCategory} ${t.ms}ms${t.pending ? ' PENDING=' + JSON.stringify(t.pending) : ''}${t.error ? ' ERR=' + t.error : ''})`)
      console.log(t.text)
      const b = (t.trace ?? []).find((l) => l.startsWith('phase1:')); if (b) console.log('   [' + b + ']')
      if (t.sources?.length) console.log('   sources:', t.sources.slice(0, 4).join(' | ').slice(0, 300))
      if (t.mealDraft || t.warnings) console.log('   gemma:', JSON.stringify({ mealDraft: t.mealDraft, warnings: t.warnings }))
    } else console.log('--> ' + JSON.stringify(t).slice(0, 400))
  }
}
