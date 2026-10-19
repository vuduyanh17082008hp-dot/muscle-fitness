import type { NutritionIntent } from "../../coach/conversation"
import { decideNutritionKnowledgeNeed } from "../need"
import { buildKnowledgeQuery } from "../query"
import { getKnowledgeIndex, retrieveKnowledge } from "../retrieve"

export const index = getKnowledgeIndex()

/** Gate -> query -> retrieval, the same sequence the runtime uses. */
export function run(message: string, opts: { intent?: NutritionIntent; goal?: string | null; timezone?: string } = {}) {
  const need = decideNutritionKnowledgeNeed({ message, intent: opts.intent })
  const query = buildKnowledgeQuery({ message, reason: need.reason, intent: opts.intent, goal: opts.goal === undefined ? "fat_loss" : opts.goal, timezone: opts.timezone ?? "Asia/Singapore" })
  const result = need.needed ? retrieveKnowledge(index, query, need) : { context: null, trace: null }
  const ids = result.context?.chunks.map((c) => c.id) ?? []
  const docs = ids.map((id) => id.split("::")[0].replace("nutrition.", ""))
  return { need, query, ...result, ids, docs }
}
