import { it } from "vitest"
import { ACTIVE_CONFIG } from "../../score"
import { scoreAllForEval } from "../../retrieve"
import { CASES_V3_DEV } from "./cases-v3-dev"
import { evaluateV3, index, oracleGate } from "./run-eval-v3"

/** Dev-only: per-case section failures under the oracle gate with signal breakdowns. NUTRITION_R2_DBG=1 */
it.skipIf(!process.env.NUTRITION_R2_DBG)("dbg r2", () => {
  const cfg = { ...ACTIVE_CONFIG, repeatPenalty: { category: 0.08, document: 0 } }
  const { results } = evaluateV3(CASES_V3_DEV, oracleGate, cfg)
  const sh = (id: string) => id.replace("nutrition.", "")
  const sig = (s: { signals: object }) => Object.entries(s.signals).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${k.slice(0, 4)}:${(v as number).toFixed(2)}`).join(" ")
  for (const r of results) {
    const c = CASES_V3_DEV.find((x) => x.id === r.id)!
    if (!c.sections?.length || (r.sectionRank !== null && r.sectionRank <= 1)) continue
    const scored = scoreAllForEval(index, r.query!, cfg)
    const gold = scored.find((s) => c.sections!.includes(sh(s.item.chunk.id)))
    console.log(`\n${r.id} rank=${r.sectionRank} "${c.message}" q=[${r.query!.query}] sens=${r.query!.sensoryTargets} cat=${r.query!.categories?.[0]}`)
    console.log(`  gold ${c.sections!.join(",")} ${gold ? gold.score.toFixed(3) + " " + sig(gold) : "NOT SCORED"}`)
    for (const s of scored.slice(0, 3)) console.log(`  top  ${sh(s.item.chunk.id)} ${s.score.toFixed(3)} ${sig(s)}`)
  }
})
