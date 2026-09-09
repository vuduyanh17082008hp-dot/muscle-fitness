import { z } from "zod";

function removeMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractJSONObject(value: string): string {
  const cleaned = removeMarkdownCodeFence(value);

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace === -1 ||
    lastBrace === -1 ||
    lastBrace < firstBrace
  ) {
    throw new Error(
      "The AI response did not contain a valid JSON object."
    );
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

export function parseAIJson<TSchema extends z.ZodTypeAny>(
  raw: string,
  schema: TSchema
): z.infer<TSchema> {
  const json = extractJSONObject(raw);

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The AI returned malformed JSON.");
  }

  return schema.parse(parsed);
}