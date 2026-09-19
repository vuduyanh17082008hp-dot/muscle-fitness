import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ExperimentStatus,
  NOf1Experiment,
  ProtocolAdherence,
} from "@/lib/dante-core/nof1-engine/types";
import { canTransitionNof1Status } from "@/lib/dante-core/nof1-engine/persistence-guard";

export {
  canTransitionNof1Status,
  isDurableNof1Id,
} from "@/lib/dante-core/nof1-engine/persistence-guard";

type Nof1Row = {
  id: string;
  user_id: string;
  hypothesis: string;
  rationale: string;
  controlled_variables: unknown;
  variable_under_test: string;
  primary_outcome: string;
  secondary_outcomes: unknown;
  experiment_window: unknown;
  confounders: unknown;
  status: string;
  user_confirmed: boolean;
  protocol_adherence: string | null;
  conclusion: unknown;
  template_id: string | null;
  created_at: string;
  completed_at: string | null;
};

const ACTIVE_STATUSES: ExperimentStatus[] = ["ACTIVE", "ACCEPTED", "CONFOUNDED"];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function mapRow(row: Nof1Row): NOf1Experiment {
  const window = (row.experiment_window ?? {}) as {
    start?: string;
    end?: string;
    durationDays?: number;
  };
  const conclusion = row.conclusion as NOf1Experiment["conclusion"] | null;
  return {
    id: row.id,
    hypothesis: row.hypothesis,
    rationale: row.rationale ?? "",
    controlledVariables: asStringArray(row.controlled_variables),
    variableUnderTest: row.variable_under_test,
    primaryOutcome: row.primary_outcome,
    secondaryOutcomes: asStringArray(row.secondary_outcomes),
    experimentWindow: {
      start: window.start ?? row.created_at,
      end: window.end ?? row.created_at,
      durationDays: window.durationDays ?? 7,
    },
    confounders: asStringArray(row.confounders),
    status: row.status as ExperimentStatus,
    userConfirmed: row.user_confirmed,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    protocolAdherence: (row.protocol_adherence as ProtocolAdherence | null) ?? undefined,
    conclusion: conclusion ?? undefined,
    templateId: (row.template_id as NOf1Experiment["templateId"]) ?? undefined,
  };
}

/**
 * Load the authenticated user's current in-flight experiment, if any.
 * Never returns another user's row (RLS + explicit user_id filter).
 */
export async function loadActiveNof1Experiment(
  supabase: SupabaseClient,
  userId: string,
): Promise<NOf1Experiment | null> {
  const { data, error } = await supabase
    .from("dante_nof1_experiments")
    .select(
      "id, user_id, hypothesis, rationale, controlled_variables, variable_under_test, primary_outcome, secondary_outcomes, experiment_window, confounders, status, user_confirmed, protocol_adherence, conclusion, template_id, created_at, completed_at",
    )
    .eq("user_id", userId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[DANTE NOF1] loadActive failed:", error.message);
    return null;
  }
  if (!data) return null;
  return mapRow(data as Nof1Row);
}

type FailedToolActionRow = {
  id: string;
  status: string;
  args: unknown;
  result: unknown;
  created_at: string;
};

/**
 * Recover the latest accepted proposal whose confirmed activation failed.
 * This is sourced from the owned tool-action audit row, not invented chat state.
 */
export async function loadLatestFailedNof1Proposal(
  supabase: SupabaseClient,
  userId: string,
): Promise<NOf1Experiment | null> {
  const { data, error } = await supabase
    .from("dante_tool_actions")
    .select("id, status, args, result, created_at")
    .eq("user_id", userId)
    .eq("tool_name", "accept_nof1_experiment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn("[DANTE NOF1] load failed activation:", error.message);
    return null;
  }

  const row = data as FailedToolActionRow;
  // A later pending/executed/cancelled activation supersedes an older failure.
  // Never resurrect a stale proposal after a successful lifecycle moved on.
  if (row.status !== "failed") return null;
  const args = row.args as Partial<{
    hypothesis: string;
    rationale: string;
    controlledVariables: string[];
    variableUnderTest: string;
    primaryOutcome: string;
    secondaryOutcomes: string[];
    experimentWindow: NOf1Experiment["experimentWindow"];
    templateId: NOf1Experiment["templateId"] | null;
    createdAt: string;
  }>;
  if (
    typeof args.hypothesis !== "string" ||
    !Array.isArray(args.controlledVariables) ||
    typeof args.variableUnderTest !== "string" ||
    typeof args.primaryOutcome !== "string" ||
    !args.experimentWindow ||
    typeof args.experimentWindow.durationDays !== "number"
  ) {
    return null;
  }

  const result = row.result as { error?: unknown } | null;
  return {
    id: `nof1:failed:${row.id}`,
    hypothesis: args.hypothesis,
    rationale: typeof args.rationale === "string" ? args.rationale : "",
    controlledVariables: asStringArray(args.controlledVariables),
    variableUnderTest: args.variableUnderTest,
    primaryOutcome: args.primaryOutcome,
    secondaryOutcomes: asStringArray(args.secondaryOutcomes),
    experimentWindow: args.experimentWindow,
    confounders: [],
    status: "ACTIVATION_FAILED",
    userConfirmed: true,
    createdAt: typeof args.createdAt === "string" ? args.createdAt : row.created_at,
    templateId: args.templateId ?? undefined,
    activationError: typeof result?.error === "string" ? result.error : "Activation save failed.",
  };
}

export type PersistNof1AcceptInput = {
  hypothesis: string;
  rationale: string;
  controlledVariables: string[];
  variableUnderTest: string;
  primaryOutcome: string;
  secondaryOutcomes?: string[];
  experimentWindow: NOf1Experiment["experimentWindow"];
  templateId?: string | null;
  createdAt?: string;
};

/**
 * Persist a newly accepted experiment as ACTIVE.
 * Call ONLY from the confirmed write tool path.
 */
export async function persistAcceptedNof1Experiment(
  supabase: SupabaseClient,
  userId: string,
  input: PersistNof1AcceptInput,
): Promise<{ success: true; data: NOf1Experiment } | { success: false; error: string }> {
  const existing = await loadActiveNof1Experiment(supabase, userId);
  if (existing) {
    return { success: false, error: "An active N-of-1 experiment already exists for this user." };
  }

  const { data, error } = await supabase
    .from("dante_nof1_experiments")
    .insert({
      user_id: userId,
      hypothesis: input.hypothesis,
      rationale: input.rationale,
      controlled_variables: input.controlledVariables,
      variable_under_test: input.variableUnderTest,
      primary_outcome: input.primaryOutcome,
      secondary_outcomes: input.secondaryOutcomes ?? [],
      experiment_window: input.experimentWindow,
      confounders: [],
      status: "ACTIVE",
      user_confirmed: true,
      template_id: input.templateId ?? null,
      created_at: input.createdAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, user_id, hypothesis, rationale, controlled_variables, variable_under_test, primary_outcome, secondary_outcomes, experiment_window, confounders, status, user_confirmed, protocol_adherence, conclusion, template_id, created_at, completed_at",
    )
    .single();

  if (error || !data) {
    const rawError = error?.message ?? "Unable to persist N-of-1 experiment.";
    const missingTable = error && "code" in error && error.code === "PGRST205";
    return {
      success: false,
      error: missingTable
        ? "N-of-1 activation could not be saved because the database table is unavailable (PGRST205). The proposal remains inactive and can be retried after migration."
        : rawError,
    };
  }

  return { success: true, data: mapRow(data as Nof1Row) };
}

/**
 * Update mutable fields on an owned experiment. Rejects illegal status transitions.
 * Does not rewrite hypothesis / controls / variableUnderTest.
 */
export async function updateNof1Experiment(
  supabase: SupabaseClient,
  userId: string,
  experimentId: string,
  patch: {
    status?: ExperimentStatus;
    confounders?: string[];
    protocolAdherence?: ProtocolAdherence;
    conclusion?: NOf1Experiment["conclusion"];
    completedAt?: string | null;
  },
): Promise<{ success: true; data: NOf1Experiment } | { success: false; error: string }> {
  const { data: current, error: loadError } = await supabase
    .from("dante_nof1_experiments")
    .select(
      "id, user_id, hypothesis, rationale, controlled_variables, variable_under_test, primary_outcome, secondary_outcomes, experiment_window, confounders, status, user_confirmed, protocol_adherence, conclusion, template_id, created_at, completed_at",
    )
    .eq("id", experimentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError || !current) {
    return { success: false, error: loadError?.message ?? "Experiment not found." };
  }

  const row = current as Nof1Row;
  const fromStatus = row.status as ExperimentStatus;
  if (patch.status && !canTransitionNof1Status(fromStatus, patch.status)) {
    return { success: false, error: `Illegal status transition ${fromStatus} → ${patch.status}.` };
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status) updatePayload.status = patch.status;
  if (patch.confounders) updatePayload.confounders = patch.confounders;
  if (patch.protocolAdherence) updatePayload.protocol_adherence = patch.protocolAdherence;
  if (patch.conclusion !== undefined) updatePayload.conclusion = patch.conclusion;
  if (patch.completedAt !== undefined) updatePayload.completed_at = patch.completedAt;

  const { data, error } = await supabase
    .from("dante_nof1_experiments")
    .update(updatePayload)
    .eq("id", experimentId)
    .eq("user_id", userId)
    .select(
      "id, user_id, hypothesis, rationale, controlled_variables, variable_under_test, primary_outcome, secondary_outcomes, experiment_window, confounders, status, user_confirmed, protocol_adherence, conclusion, template_id, created_at, completed_at",
    )
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Unable to update N-of-1 experiment." };
  }

  return { success: true, data: mapRow(data as Nof1Row) };
}
