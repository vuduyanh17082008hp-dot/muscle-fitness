import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType, ZodTypeDef } from "zod";

/** Loosens ZodType's Def/Input generics — a schema with `.default()`/`.transform()` fields legitimately has a narrower raw-input type than its parsed output type, and only the output (TInput here, i.e. what `execute` receives) matters to a DanteTool. */
type ToolInputSchema<TInput> = ZodType<TInput, ZodTypeDef, unknown>;

/**
 * Typed Dante Tool Registry (Agentic Performance Interface, Part 2).
 *
 * Every capability Dante can invoke — read or write — is one entry in
 * this shape. An LLM never receives a raw domain service or a raw
 * Supabase client: it can only select a tool BY NAME and supply an
 * input object that gets validated against `inputSchema` before any
 * domain code runs (Part 17: "Never pass arbitrary model-generated
 * objects directly into domain services").
 *
 * `execute` always wraps an EXISTING canonical Muscle Fitness service
 * (AthleteState, Adaptive Program Engine, Today's Plan, nutrition/
 * recovery loaders, food-log mutations, the Knowledge Brain, the
 * workout session-mutation layer) — see lib/dante-core/tools/read/*
 * and lib/dante-core/tools/write/*. No tool recomputes a domain
 * calculation itself.
 */

export type ToolMode = "read" | "write";
export type ToolRisk = "low" | "medium" | "high";

export type ToolContext = {
  supabase: SupabaseClient;
  /** Always the authenticated server-derived user id — never a client- or model-supplied one (Part 17). */
  userId: string;
  now: Date;
};

export type ToolExecuteResult<TOutput> =
  | { ok: true; data: TOutput }
  | { ok: false; error: string };

export type DanteTool<TInput = unknown, TOutput = unknown> = {
  /** Stable, model-facing name — the only handle an LLM ever gets on this capability. */
  name: string;
  /** Concise model-facing description of what this tool does and when to use it. */
  description: string;
  inputSchema: ToolInputSchema<TInput>;
  mode: ToolMode;
  risk: ToolRisk;
  /** Write tools are true by default (Part 7) — a tool may only set this false when its own effect is inherently reversible/advisory (Part 12 examples: reminders, dismissing a suggestion). Always true for every write tool actually registered here. */
  requiresConfirmation: boolean;
  execute: (context: ToolContext, input: TInput) => Promise<ToolExecuteResult<TOutput>>;
  /** Human-facing one-line summary of what this exact call will do, shown in a pending confirmation (Part 7: "The confirmation UI must clearly show what will change"). Required for write tools. */
  summarize?: (input: TInput) => string;
};

/** Type-erased view used by the registry map/array so tools with different input/output types can coexist. */
export type AnyDanteTool = DanteTool<unknown, unknown>;
