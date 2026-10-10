import {
  knowledgeMetadataSchema,
  policyMetadataSchema,
  type KnowledgeSection,
  type NutritionKnowledgeChunk,
  type NutritionKnowledgeDocument,
  type NutritionPolicyDocument,
} from "./types"

/** Sections longer than this are split on `###` subheadings when present. */
export const MAX_CHUNK_CHARS = 1800
/** Sections shorter than this are merged into the previous chunk. */
export const MIN_CHUNK_CHARS = 80

export class KnowledgeParseError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = "KnowledgeParseError"
  }
}

function parseScalar(raw: string): string | string[] {
  const v = raw.trim()
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
  }
  return v.replace(/^["']|["']$/g, "")
}

/** Minimal frontmatter: `key: value` lines, values are scalars or `[a, b]` lists. */
export function splitFrontmatter(path: string, raw: string): { data: Record<string, unknown>; body: string } {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
  if (!m) throw new KnowledgeParseError(path, "missing frontmatter block")
  const data: Record<string, unknown> = {}
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue
    const kv = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line)
    if (!kv) throw new KnowledgeParseError(path, `malformed frontmatter line: "${line}"`)
    if (kv[1] in data) throw new KnowledgeParseError(path, `duplicate frontmatter key: ${kv[1]}`)
    data[kv[1]] = parseScalar(kv[2])
  }
  return { data, body: m[2].trim() }
}

/** Split on `## ` headings (ignoring fenced code). Text before the first H2 is dropped (title/H1). */
export function splitSections(body: string): KnowledgeSection[] {
  const sections: KnowledgeSection[] = []
  let current: { heading: string; lines: string[] } | null = null
  let fenced = false
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced
    const h = !fenced ? /^##\s+(.+?)\s*$/.exec(line) : null
    if (h) {
      if (current) sections.push({ heading: current.heading, content: current.lines.join("\n").trim() })
      current = { heading: h[1], lines: [] }
    } else if (current) current.lines.push(line)
  }
  if (current) sections.push({ heading: current.heading, content: current.lines.join("\n").trim() })
  return sections
}

function zodMessage(err: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
}

export function parseKnowledgeDocument(path: string, raw: string): NutritionKnowledgeDocument {
  const { data, body } = splitFrontmatter(path, raw)
  const parsed = knowledgeMetadataSchema.safeParse(data)
  if (!parsed.success) throw new KnowledgeParseError(path, zodMessage(parsed.error))
  if (parsed.data.authority === "policy") {
    throw new KnowledgeParseError(path, "authority 'policy' is reserved for policy documents")
  }
  const sections = splitSections(body)
  if (sections.length === 0) throw new KnowledgeParseError(path, "no '## ' sections found")
  return { kind: "knowledge", metadata: parsed.data, path, content: body, sections }
}

export function parsePolicyDocument(path: string, raw: string): NutritionPolicyDocument {
  const { data, body } = splitFrontmatter(path, raw)
  const parsed = policyMetadataSchema.safeParse(data)
  if (!parsed.success) throw new KnowledgeParseError(path, zodMessage(parsed.error))
  const sections = splitSections(body)
  if (sections.length === 0) throw new KnowledgeParseError(path, "no '## ' sections found")
  return { kind: "policy", metadata: parsed.data, path, content: body, sections }
}

export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function splitOversized(section: KnowledgeSection): KnowledgeSection[] {
  if (section.content.length <= MAX_CHUNK_CHARS) return [section]
  const parts = section.content.split(/^(?=###\s)/m).filter((p) => p.trim())
  if (parts.length < 2) return [section] // ponytail: no ### to split on — keep whole; add paragraph splitting if a real doc needs it
  const out: KnowledgeSection[] = []
  for (const part of parts) {
    const h = /^###\s+(.+?)\s*$/m.exec(part)
    if (h && part.startsWith("###")) {
      out.push({ heading: `${section.heading} / ${h[1]}`, content: part.replace(/^###.*\n?/, "").trim() })
    } else {
      out.push({ heading: section.heading, content: part.trim() }) // intro before first ###
    }
  }
  return out
}

/** Heading-aware chunking. Chunk ids are deterministic: `<docId>::<slug>` (`-2`, `-3` on collision). */
export function chunkDocument(doc: NutritionKnowledgeDocument): NutritionKnowledgeChunk[] {
  const units = doc.sections.flatMap(splitOversized)
  const merged: KnowledgeSection[] = []
  for (const u of units) {
    const prev = merged[merged.length - 1]
    if (prev && u.content.length < MIN_CHUNK_CHARS) {
      prev.content = `${prev.content}\n\n**${u.heading}**\n${u.content}`.trim()
    } else merged.push({ ...u })
  }
  const seen = new Map<string, number>()
  return merged.map((u) => {
    const base = slugify(u.heading) || "section"
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return {
      id: `${doc.metadata.id}::${n === 1 ? base : `${base}-${n}`}`,
      documentId: doc.metadata.id,
      heading: u.heading,
      content: u.content,
      metadata: doc.metadata,
    }
  })
}
