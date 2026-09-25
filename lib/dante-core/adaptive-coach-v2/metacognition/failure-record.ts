import type { DanteTaskId, FailureClass } from "@/lib/dante-core/adaptive-coach-v2/types";

export type FailureRecord = {
  id: string;
  occurredAt: string;
  failureClass: FailureClass;
  tasks: DanteTaskId[];
  userCorrection?: string;
  observedOutput?: string;
  expectedConstraint?: string;
  semanticSnapshot?: Array<{ concept: string; state: string; provenance: string }>;
  resolved: boolean;
  resolution?: string;
};

export function createFailureRecord(
  input: Omit<FailureRecord, "id" | "occurredAt" | "resolved"> & {
    id?: string;
    occurredAt?: string;
    resolved?: boolean;
  },
): FailureRecord {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const id = input.id ?? `failure_${occurredAt}_${input.failureClass}`.replace(/[^a-zA-Z0-9_-]/g, "");
  return { ...input, id, occurredAt, resolved: input.resolved ?? false };
}
