import type { DanteContextCapsule, DanteDecision } from "@/lib/dante-core/adaptive-coach-v2/types";

export type L1SessionContext = {
  recentTurns: Array<{ role: "user" | "assistant"; text: string }>;
  currentState: DanteDecision["currentState"];
  activeExperimentSummary?: string;
  pendingTool?: DanteDecision["tool"] & { description?: string };
  safety: DanteDecision["safety"];
  recentCorrection?: string;
};

export type L2PersonalContext = {
  athleteSummary?: string;
  preferences?: string[];
  recurringConstraints?: string[];
  recentTrainingSummary?: string;
  capsules?: DanteContextCapsule[];
};

export class AdaptiveCoachSessionStore {
  private readonly sessions = new Map<string, L1SessionContext>();

  get(sessionId: string): L1SessionContext | undefined {
    return this.sessions.get(sessionId);
  }

  set(sessionId: string, context: L1SessionContext): void {
    this.sessions.set(sessionId, structuredClone(context));
  }

  update(sessionId: string, update: Partial<L1SessionContext>): L1SessionContext {
    const previous = this.sessions.get(sessionId);
    const next: L1SessionContext = {
      recentTurns: update.recentTurns ?? previous?.recentTurns ?? [],
      currentState: update.currentState ?? previous?.currentState ?? { facts: [] },
      safety: update.safety ?? previous?.safety ?? { action: "NORMAL", category: null, relevantSignals: [] },
      ...(update.activeExperimentSummary ?? previous?.activeExperimentSummary
        ? { activeExperimentSummary: update.activeExperimentSummary ?? previous?.activeExperimentSummary }
        : {}),
      ...(update.pendingTool ?? previous?.pendingTool ? { pendingTool: update.pendingTool ?? previous?.pendingTool } : {}),
      ...(update.recentCorrection ?? previous?.recentCorrection
        ? { recentCorrection: update.recentCorrection ?? previous?.recentCorrection }
        : {}),
    };
    this.set(sessionId, next);
    return next;
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
