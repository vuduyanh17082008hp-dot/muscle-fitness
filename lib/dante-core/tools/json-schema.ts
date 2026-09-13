import "server-only";

import { z, type ZodTypeAny } from "zod";

/**
 * Minimal zod -> JSON Schema converter, covering exactly the zod node
 * types used by lib/dante-core/tools/*'s input schemas (object,
 * string, number, boolean, enum, array, optional, nullable, default).
 * Only needed to hand Groq's OpenAI-compatible function-calling API a
 * `parameters` schema for each tool — the zod schema itself remains
 * the single source of truth and the only thing that actually
 * validates a call's arguments (see pending-actions.ts /
 * orchestrate.ts, which always re-validate with `tool.inputSchema`,
 * never trust this JSON Schema as authoritative).
 */
export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const unwrapped = unwrap(schema);

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape as Record<string, ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!isOptionalLike(value)) {
        required.push(key);
      }
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }

  if (unwrapped instanceof z.ZodString) {
    return { type: "string" };
  }

  if (unwrapped instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (unwrapped instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (unwrapped instanceof z.ZodEnum) {
    return { type: "string", enum: unwrapped.options };
  }

  if (unwrapped instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(unwrapped.element) };
  }

  return { type: "string" };
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrap(schema.unwrap());
  }

  if (schema instanceof z.ZodDefault) {
    return unwrap(schema.removeDefault());
  }

  return schema;
}

function isOptionalLike(schema: ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema.isOptional();
}
