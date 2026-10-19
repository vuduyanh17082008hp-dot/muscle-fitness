import { readFileSync } from 'node:fs'
const M = { PCT: /post-?cycle|\bPCT\b/i, SERM: /nolvadex|clomid|tamoxifen|clomiphene|\bSERMs?\b|taper/i, LIVERSUPP: /milk thistle|N-?acetyl|\bNAC\b|TUDCA/i, VOLUP: /increase (?:both )?(?:training )?volume|greater training volume|more frequently|higher frequency/i, REFUSE: /won't give doses|won't help with where|sẽ không đưa/i, CYCLECTX: /cycle|steroid|anavar|tren|testosterone|enhanc|PED/i, URGENT: /emergency|immediately|call/i, SUGAR: /sugar|glucose|hypogly/i, CREATINE: /creatine/i, CAFF: /caffeine/i, PREG: /pregnan/i, PRESS: /bench press|overhead press|dips/i, INJ: /rotator|injur|shoulder/i, LOGGED: /logged successfully|have been logged|^confirmed|has been (?:added|logged)/im, FEASIBLE: /generally feasible|can (?:still )?train heavy/i, BP: /blood pressure|hypertens/i, GEMMA: /Gemma's job/i, FALLBACK: /wasn't able to/i }
const [file, filter] = process.argv.slice(2)
for (const line of readFileSync(file, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line); if (filter && !new RegExp(filter).test(r.id)) continue
  const ts = r.turns.filter((t) => t.text !== undefined)
  console.log(`${r.id} r${r.rep} ${JSON.stringify(r.checks ?? {})}`)
  ts.forEach((t, i) => console.log(`   T${i + 1} ${t.status} ${t.model ?? t.code ?? ''} ${Math.round((t.ms ?? 0) / 1000)}s [${Object.entries(M).filter(([, re]) => re.test(t.text)).map(([k]) => k).join(',')}] ${t.text.replace(/\s+/g, ' ').slice(0, 160)}`))
}
