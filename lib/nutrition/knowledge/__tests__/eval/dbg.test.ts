import { readFileSync } from "node:fs"
import { join } from "node:path"
import { it } from "vitest"
import { buildKnowledgeQuery } from "../../query"
import { ACTIVE_CONFIG } from "../../score"
import { CASES_V2 } from "./cases-v2"
import { layeredGate } from "./run-eval"
import { getKnowledgeIndex, retrieveKnowledge, scoreAllForEval } from "../../retrieve"
it.skipIf(!process.env.DBG_IDS)("dbg", () => {
  const rec = JSON.parse(readFileSync(join(__dirname, "semantic-gate-v2.recorded.json"), "utf8"))
  const gate = layeredGate(rec)
  for (const id of (process.env.DBG_IDS ?? "").split(",")) {
    const c = CASES_V2.find((x) => x.id === id)!
    const need = gate(c)
    const q = buildKnowledgeQuery({ message: c.message, reason: need.reason, goal: "fat_loss", timezone: "Asia/Singapore", hints: need.hints })
    const picked = retrieveKnowledge(getKnowledgeIndex(), q, need, ACTIVE_CONFIG).context?.chunks.filter((x) => x.sourceType === "primary").map((x) => x.id.replace("nutrition.", ""))
    console.log("DBG", id, c.message, "| want", c.section ? `${c.section.doc}::${c.section.heading}` : "-", "| q", JSON.stringify({ query: q.query, sens: q.sensoryTargets, cat: q.categories?.[0] }), "\n   PICKED", picked?.join(" | "))
    for (const s of scoreAllForEval(getKnowledgeIndex(), q, ACTIVE_CONFIG).slice(0, 3)) console.log("    ", s.item.chunk.id.replace("nutrition.", ""), s.score.toFixed(3), Object.entries(s.signals).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${k}:${(v as number).toFixed(2)}`).join(" "))
  }
})
