/**
 * Local-only smoke: Confirm → ACTIVE via persistAcceptedNof1Experiment
 * against muscle-fitness-nof1-local (Docker). Skips if local API down.
 *
 * Uses Supabase local demo JWT keys (not production). Never targets remote.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  loadActiveNof1Experiment,
  persistAcceptedNof1Experiment,
  updateNof1Experiment,
} from "@/lib/dante-core/nof1-engine/persistence";

const LOCAL_URL = process.env.NOF1_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
// Well-known local demo anon key (supabase start default). Not a production secret.
const LOCAL_ANON =
  process.env.NOF1_LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const USER_A = {
  email: "nof1-js-a@local.test",
  password: "local-test-password-a",
};
const USER_B = {
  email: "nof1-js-b@local.test",
  password: "local-test-password-b",
};

async function localReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/auth/v1/health`, {
      headers: { apikey: LOCAL_ANON },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureUser(email: string, password: string) {
  const admin = createClient(LOCAL_URL, LOCAL_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await admin.auth.signInWithPassword({ email, password });
  if (signed.data.user) return signed;

  const created = await admin.auth.signUp({ email, password });
  if (created.error) throw created.error;
  const again = await admin.auth.signInWithPassword({ email, password });
  if (again.error) throw again.error;
  return again;
}

const acceptInput = {
  hypothesis: "More sleep improves comparable-session performance.",
  rationale: "Sleep and volume changed together.",
  controlledVariables: ["training volume"],
  variableUnderTest: "sleep duration",
  primaryOutcome: "RPE / comparable performance",
  secondaryOutcomes: [] as string[],
  experimentWindow: {
    start: "2026-09-18T00:00:00.000Z",
    end: "2026-09-25T00:00:00.000Z",
    durationDays: 7,
  },
  templateId: "SLEEP_VS_VOLUME" as const,
};

describe("nof1 — local supabase persistence smoke", () => {
  it("Confirm → ACTIVE, restore, confound, isolate across users", async () => {
    if (!(await localReachable())) {
      console.warn("[skip] local Supabase API not reachable at", LOCAL_URL);
      return;
    }

    const sessionA = await ensureUser(USER_A.email, USER_A.password);
    const sessionB = await ensureUser(USER_B.email, USER_B.password);
    const userAId = sessionA.data.user!.id;
    const userBId = sessionB.data.user!.id;

    const clientA = createClient(LOCAL_URL, LOCAL_ANON, {
      global: { headers: { Authorization: `Bearer ${sessionA.data.session!.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const clientB = createClient(LOCAL_URL, LOCAL_ANON, {
      global: { headers: { Authorization: `Bearer ${sessionB.data.session!.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Clear any prior ACTIVE for A
    const prior = await loadActiveNof1Experiment(clientA, userAId);
    if (prior) {
      await updateNof1Experiment(clientA, userAId, prior.id, {
        status: "CANCELLED",
        completedAt: new Date().toISOString(),
      });
    }

    const persisted = await persistAcceptedNof1Experiment(clientA, userAId, acceptInput);
    expect(persisted.success).toBe(true);
    if (!persisted.success) return;
    expect(persisted.data.status).toBe("ACTIVE");
    expect(persisted.data.userConfirmed).toBe(true);

    // Fresh-session restore (new client, same user token)
    const restored = await loadActiveNof1Experiment(clientA, userAId);
    expect(restored?.id).toBe(persisted.data.id);
    expect(restored?.variableUnderTest).toBe("sleep duration");

    // Cross-user isolation
    const leaked = await loadActiveNof1Experiment(clientB, userBId);
    expect(leaked?.id === persisted.data.id).toBe(false);
    const foreign = await clientB
      .from("dante_nof1_experiments")
      .select("id")
      .eq("id", persisted.data.id)
      .maybeSingle();
    expect(foreign.data).toBeNull();

    // Confounder update
    const confounded = await updateNof1Experiment(clientA, userAId, persisted.data.id, {
      status: "CONFOUNDED",
      confounders: ["alcohol", "calorie_change"],
      protocolAdherence: "POOR",
      completedAt: new Date().toISOString(),
    });
    expect(confounded.success).toBe(true);
    if (confounded.success) {
      expect(confounded.data.status).toBe("CONFOUNDED");
      expect(confounded.data.confounders).toEqual(
        expect.arrayContaining(["alcohol", "calorie_change"]),
      );
    }

    // INCONCLUSIVE conclusion (no SUPPORTS fabrication)
    const completed = await updateNof1Experiment(clientA, userAId, persisted.data.id, {
      status: "COMPLETED",
      conclusion: {
        result: "INCONCLUSIVE",
        confidence: "INSUFFICIENT_EVIDENCE",
        reasons: ["Material confounders make the window unclean."],
      },
    });
    expect(completed.success).toBe(true);
    if (completed.success) {
      expect(completed.data.conclusion?.result).toBe("INCONCLUSIVE");
    }

    // No longer ACTIVE after completion
    expect(await loadActiveNof1Experiment(clientA, userAId)).toBeNull();
  }, 60_000);
});
