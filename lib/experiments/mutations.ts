import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getExposureType, getOutcomeType, type ExposureTypeId, type OutcomeTypeId } from "@/lib/experiments/catalog";

export type ExperimentRecord = {
  id: string;
  question: string;
  exposureType: ExposureTypeId;
  outcomeType: OutcomeTypeId;
  windowDays: number;
  status: "active" | "archived";
  createdAt: string;
};

type ExperimentRow = {
  id: string;
  question: string;
  exposure_type: string;
  outcome_type: string;
  window_days: number;
  status: string;
  created_at: string;
};

function mapRow(row: ExperimentRow): ExperimentRecord {
  return {
    id: row.id,
    question: row.question,
    exposureType: row.exposure_type as ExposureTypeId,
    outcomeType: row.outcome_type as OutcomeTypeId,
    windowDays: row.window_days,
    status: row.status as "active" | "archived",
    createdAt: row.created_at,
  };
}

export type CreateExperimentInput = {
  question: string;
  exposureType: ExposureTypeId;
  outcomeType: OutcomeTypeId;
  windowDays?: number;
};

export async function createExperiment(
  supabase: SupabaseClient,
  userId: string,
  input: CreateExperimentInput,
): Promise<{ success: true; data: ExperimentRecord } | { success: false; error: string }> {
  if (!input.question.trim()) {
    return { success: false, error: "Question is required." };
  }

  if (!getExposureType(input.exposureType)) {
    return { success: false, error: "Unknown exposure type." };
  }

  if (!getOutcomeType(input.outcomeType)) {
    return { success: false, error: "Unknown outcome type." };
  }

  const windowDays = input.windowDays ?? 30;

  const { data, error } = await supabase
    .from("experiments")
    .insert({
      user_id: userId,
      question: input.question.trim(),
      exposure_type: input.exposureType,
      outcome_type: input.outcomeType,
      window_days: windowDays,
    })
    .select("id, question, exposure_type, outcome_type, window_days, status, created_at")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Unable to create this experiment." };
  }

  return { success: true, data: mapRow(data as ExperimentRow) };
}

export async function listExperiments(supabase: SupabaseClient, userId: string): Promise<ExperimentRecord[]> {
  const { data, error } = await supabase
    .from("experiments")
    .select("id, question, exposure_type, outcome_type, window_days, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[EXPERIMENTS] list failed:", error.message);
    return [];
  }

  return ((data as ExperimentRow[] | null) ?? []).map(mapRow);
}

export async function getExperiment(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<ExperimentRecord | null> {
  const { data, error } = await supabase
    .from("experiments")
    .select("id, question, exposure_type, outcome_type, window_days, status, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return mapRow(data as ExperimentRow);
}

export async function deleteExperiment(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await supabase.from("experiments").delete().eq("id", id).eq("user_id", userId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}
