import type { z } from "zod"

/**
 * Models occasionally wrap JSON in prose or a fenced code block even when
 * asked for a raw object. This recovers the object before parsing.
 */
function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim()

  if (trimmed.startsWith("{")) {
    return trimmed
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)

  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return null
}

export type ParsedJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/**
 * Parse and schema-validate model output. Any malformed or unexpected
 * shape is rejected so invalid AI output can never reach the UI.
 */
export function parseJsonWithSchema<TSchema extends z.ZodTypeAny>(
  raw: string,
  schema: TSchema,
): ParsedJsonResult<z.infer<TSchema>> {
  const candidate = extractJsonObject(raw)

  if (!candidate) {
    return {
      ok: false,
      error: "Model response did not contain a JSON object.",
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(candidate)
  } catch {
    return {
      ok: false,
      error: "Model response was not valid JSON.",
    }
  }

  const result = schema.safeParse(parsed)

  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; "),
    }
  }

  return { ok: true, data: result.data }
}
