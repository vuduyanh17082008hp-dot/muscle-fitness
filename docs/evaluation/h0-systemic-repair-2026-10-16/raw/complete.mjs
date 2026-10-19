// Structured completeness: every requested candidate appears in the final reply. Usage: node complete.mjs run.jsonl
import { readFileSync } from 'node:fs'
const NEED = {
  E01: ['creatine', 'whey'], E02: ['creatine', 'caffeine', 'beta'], E03: ['creatine', 'whey', 'fish oil', 'vitamin d', 'magnesium'],
  E04: ['creatine', 'whey', 'bcaa', 'eaa', 'zinc', 'magnesium', 'omega', 'multivitamin'],
  E05: ['creatine', 'whey', 'casein', 'bcaa', 'eaa', 'glutamine', 'zinc', 'magnesium', 'vitamin d', 'fish oil'],
  E06: ['creatine', 'whey', 'branched', 'essential amino', 'zinc', 'magnesium', 'fish oil', 'multi'],
  E07: ['creatine', 'whey', 'fish oil'], E08: ['creatine', 'zorblax', 'whey'], E09: ['creatine', 'whey', 'ostarine', 'caffeine', 'anavar'],
  E10: ['creatine', 'whey', 'cá', 'vitamin d', 'magie'], E11: ['creatine', 'whey', 'omega', 'vitamin d'],
  HG01: ['creatine', 'caffeine'], HG02: ['whey', 'casein', 'pea'], HG03: ['bcaa', 'glutamine', 'creatine', 'zma', 'fish oil'],
  HG04: ['creatine', 'whey', 'caffeine', 'beta', 'citrulline', 'fish oil', 'vitamin d', 'magnesium'],
  HG05: ['creatine', 'whey', 'caffeine', 'beta', 'citrulline', 'fish oil', 'vitamin d', 'magnesium', 'zinc', 'ashwagandha'],
  HG06: ['creatine', 'whey', 'clenbuterol', 'fish oil'], HG07: ['creatine', 'whey', 'caffeine'], HG08: ['creatine', 'whey', 'cá'],
  HG09: ['creatine', 'flubberine', 'whey'], HX27: ['caffeine', 'green tea', 'carnitine'], HX28: ['whey', 'casein', 'bcaa', 'eaa', 'glutamine'],
  CR13: ['creatine', 'whey', 'ostarine', 'caffeine', 'anavar'],
}
for (const line of readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(line)
  const need = NEED[r.id]
  if (!need) continue
  const text = (r.turns.filter((t) => t.text).at(-1)?.text ?? '').toLowerCase()
  const missing = need.filter((term) => !text.includes(term))
  console.log(`${r.id} r${r.rep} ${need.length - missing.length}/${need.length}${missing.length ? ' MISSING ' + missing.join(',') : ''}`)
}
