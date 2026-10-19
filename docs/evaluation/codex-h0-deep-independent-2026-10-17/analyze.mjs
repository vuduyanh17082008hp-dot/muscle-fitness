import fs from 'node:fs'

const dir = new URL('./raw/', import.meta.url)
function readRecords(name) {
  const s = fs.readFileSync(new URL(name, dir), 'utf8')
  const out = []
  let start = -1, depth = 0, inString = false, escape = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (start < 0) { if (c === '{') { start = i; depth = 1 }; continue }
    if (inString) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      if (--depth === 0) {
        try { out.push(JSON.parse(s.slice(start, i + 1))) } catch {}
        start = -1
      }
    }
  }
  return out
}

for (const file of ['full-matrix.jsonl', 'critical-repeats.jsonl', 'safety.jsonl', 'routing-final.jsonl', 'mutations.jsonl', 'evidence.jsonl', 'structured.jsonl', 'gemma-coord.jsonl']) {
  const rows = readRecords(file)
  const ts = rows.flatMap(r => r.turns ?? []).filter(t => t.user)
  const ms = ts.map(t => t.ms).filter(Number.isFinite).sort((a,b) => a-b)
  console.log(`${file}: records=${rows.length} turns=${ts.length} 5xx=${ts.filter(t => t.status >= 500).length} fallback=${ts.filter(t => String(t.model ?? '').includes('fallback')).length} max_ms=${ms.at(-1) ?? 'NA'} p95_ms=${ms[Math.max(0, Math.floor(ms.length * .95)-1)] ?? 'NA'}`)
}
const critical = readRecords('critical-repeats.jsonl')
for (const id of [...new Set(critical.map(r => r.id))]) {
  const rows = critical.filter(r => r.id === id)
  console.log(`repeat ${id}: ${rows.length}/5; trials_with_5xx=${rows.filter(r => r.turns.some(t => t.status >= 500)).length}`)
}
