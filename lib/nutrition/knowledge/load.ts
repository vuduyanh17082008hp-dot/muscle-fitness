import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { chunkDocument, KnowledgeParseError, parseKnowledgeDocument, parsePolicyDocument } from "./parse"
import type { NutritionKnowledgeChunk, NutritionKnowledgeDocument, NutritionPolicyDocument } from "./types"

export const KNOWLEDGE_ROOT = path.join(process.cwd(), "knowledge")

function listMarkdown(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listMarkdown(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []))
    .sort() // deterministic order
}

function assertUnique(docs: { metadata: { id: string }; path: string }[]) {
  const seen = new Map<string, string>()
  for (const d of docs) {
    const prior = seen.get(d.metadata.id)
    if (prior) throw new KnowledgeParseError(d.path, `duplicate id "${d.metadata.id}" (also in ${prior})`)
    seen.set(d.metadata.id, d.path)
  }
}

const rel = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/")

/** Ordinary retrieval corpus: knowledge/nutrition/** only. Policy is never included. */
export function loadKnowledgeCorpus(root = KNOWLEDGE_ROOT): NutritionKnowledgeDocument[] {
  const docs = listMarkdown(path.join(root, "nutrition")).map((f) => parseKnowledgeDocument(rel(root, f), readFileSync(f, "utf8")))
  assertUnique(docs)
  return docs
}

/** Policy documents: knowledge/policy/** only, loaded separately from the corpus. */
export function loadPolicyDocuments(root = KNOWLEDGE_ROOT): NutritionPolicyDocument[] {
  const docs = listMarkdown(path.join(root, "policy")).map((f) => parsePolicyDocument(rel(root, f), readFileSync(f, "utf8")))
  assertUnique(docs)
  return docs
}

export function loadKnowledgeChunks(root = KNOWLEDGE_ROOT): NutritionKnowledgeChunk[] {
  return loadKnowledgeCorpus(root).flatMap(chunkDocument)
}
