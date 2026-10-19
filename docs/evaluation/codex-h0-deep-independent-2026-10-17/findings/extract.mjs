import fs from 'node:fs'
const s = fs.readFileSync(new URL('../raw/full-matrix.jsonl', import.meta.url), 'utf8')
const rows = []
let start = -1, depth = 0, quoted = false, esc = false
for (let i = 0; i < s.length; i++) {
  const c = s[i]
  if (start < 0) { if (c === '{') { start = i; depth = 1 }; continue }
  if (quoted) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') quoted = false; continue }
  if (c === '"') quoted = true
  else if (c === '{') depth++
  else if (c === '}' && --depth === 0) { try { rows.push(JSON.parse(s.slice(start, i + 1))) } catch {}; start = -1 }
}
for (const id of ['CTX001','CTX004','CTX025','PEDO12','PEDO13','PEDO14','PEDO15','PEDO16','PEDO17','PEDO18','PEDSRC38','PEDSRC39','PEDSRC40','PEDC48','DUAL11','GEM06','GEM28','PEDI03','R001','M003']) {
  const row = rows.find(x => x.id === id)
  if (!row) continue
  console.log(`\n### ${id} ${row.cat}`)
  for (const t of row.turns ?? []) {
    console.log(`USER: ${t.user}`)
    console.log(`HTTP=${t.status} ms=${t.ms} model=${t.model ?? ''} pending=${JSON.stringify(t.pending)} trace=${(t.trace ?? []).join(' | ')}`)
    console.log(`FINAL: ${t.text}`)
  }
}
