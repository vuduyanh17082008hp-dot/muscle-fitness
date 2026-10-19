// Hand-grading view: per case, first + final reply in full, confirm results and DB checks.
// Usage: node view.mjs <run.jsonl> <out.txt> [ID,ID]
import { readFileSync, writeFileSync } from 'node:fs'
const [file, outFile, ids] = process.argv.slice(2)
const want = ids ? new Set(ids.split(',')) : null
const out = []
for (const r of readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))) {
  if (want && !want.has(r.id)) continue
  out.push(`=== ${r.id} r${r.rep} uid=${r.uid} checks=${JSON.stringify(r.checks)}${r.runnerError ? ' RUNNER_ERROR ' + r.runnerError : ''}`)
  const said = (r.turns ?? []).filter((t) => t.text !== undefined)
  for (const t of r.turns ?? []) {
    if (t.kind === 'confirm' || t.kind === 'confirmParallel') { out.push(`${t.kind} ${t.intent ?? ''} ${JSON.stringify(t.results ? t.results.map((x) => [x.status, x.body?.status]) : [t.status, t.body?.status ?? t.note])}`); continue }
    if (t.kind === 'harness_error' || t.kind === 'seedPending') { out.push(`${t.kind} ${t.error ?? t.owner}`); continue }
    if (t.text === undefined) continue
    const full = t === said.at(-1) || t === said[0]
    out.push(`U: ${t.user}`)
    out.push(`A[${t.model ?? t.route ?? t.runtime ?? t.kind}${t.safety ? ' SAFETY:' + t.safetyCategory : ''}${t.pending ? ' PENDING' : ''}]: ${(full ? t.text : t.text.slice(0, 200)).replace(/\n+/g, ' / ')}`)
  }
}
writeFileSync(outFile, out.join('\n') + '\n')
