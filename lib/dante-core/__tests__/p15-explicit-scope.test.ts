/**
 * P-15 — explicit reasoning scope. Available context is not automatically eligible.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const provider = vi.hoisted(() => ({
  text: "Keep it simple today.",
  prompts: [] as string[],
}));

vi.mock("@/lib/dante-core/openai/client", () => ({
  streamDanteReply: async function* (prompt: string) {
    provider.prompts.push(prompt);
    yield { kind: "delta", text: provider.text };
    yield { kind: "model", model: "stub-provider" };
  },
}));

import { POST } from "@/app/api/chatbot/route";
import { parseChatStreamChunk } from "@/lib/dante-core/chat-stream-protocol";
import { createClient } from "@/lib/supabase/server";
import { buildObligationLedger, finishCoherenceDraft, prepareCoherenceTurn } from "@/lib/dante-core/coherence";
import {
  applyObligationScopesToBlocks,
  applyScopeToText,
  blockSupportedByScope,
  buildObligationEnvelopes,
  eligibleContextFor,
  extractObligationEnvelopesFromPrompt,
  extractReasoningScope,
  hasDivergentReasoningScopes,
  insightAllowed,
  parseBoundObligationReplies,
  primaryObligationScope,
  restrictUserContext,
  scopedFallback,
  scopeOf,
  scopePromptDirective,
} from "@/lib/dante-core/reasoning-scope";
import {
  createFakeCoherenceTable,
  fakeCoherenceFrom,
  type FakeCoherenceTable,
} from "./support/fake-coherence-supabase";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-09-21T12:00:00.000Z";
const RAIN =
  "yo man, its raining so hard, despite all other factors, only considering raining, should i skip the gym";
const PROFILE_LEAK = /recovery score|lean bulk|calorie|training load|home workout|check-in|180g protein|effective sets/i;
const FAT_CONTEXT = {
  profile: { fullName: "Alex" },
  fitnessProfile: { goal: "lean bulk" },
  preferences: { sleepHoursTypical: 7 },
  currentNutritionPlan: { calories: 2800, protein: 180 },
  recovery: { todayScore: 41, status: "LOW", missingCheckin: true },
  trainingIntelligence: { hasLoggedTrainingData: true, trainingLoad: "high" },
  todayFoodLog: { protein: { consumed: 90, target: 180 } },
  digitalTwin: { missingData: ["check-in"] },
  dailyPlan: [{ title: "Recovery check-in", status: "planned" }],
  adaptiveTraining: [{ exerciseName: "Bench", action: "HOLD" }],
};

function clientFor(table: FakeCoherenceTable) {
  const from = fakeCoherenceFrom(table, { timezone: "Asia/Singapore" });
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: vi.fn((name: string) => from(name)),
  };
}

async function post(message: string) {
  const before = provider.prompts.length;
  const response = await POST(
    new Request("http://localhost/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, messages: [{ role: "user", content: message }] }),
    }),
  );
  const events = parseChatStreamChunk("", await response.text()).events;
  const done = events.find((e) => e.type === "done");
  const delta = events.find((e) => e.type === "delta");
  return {
    status: response.status,
    text: delta && delta.type === "delta" ? delta.text : "",
    model: done && done.type === "done" ? done.model : null,
    providerCalls: provider.prompts.length - before,
    prompt: provider.prompts.at(-1) ?? "",
  };
}

describe("P-15 explicit reasoning scope", () => {
  let table: FakeCoherenceTable;

  beforeEach(() => {
    table = createFakeCoherenceTable();
    provider.text = "Keep it simple today.";
    provider.prompts.length = 0;
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(clientFor(table) as never);
  });

  describe("TEST A — production rain repro", () => {
    it("extracts ONLY rain and strips ineligible profile families", () => {
      const scope = extractReasoningScope(RAIN);
      expect(scope.mode).toBe("ONLY");
      expect(scope.allowedFactors).toEqual(expect.arrayContaining(["rain", "weather"]));
      const eligible = restrictUserContext(FAT_CONTEXT, scope);
      expect(eligible.recovery).toBeNull();
      expect(eligible.currentNutritionPlan).toBeNull();
      expect(eligible.trainingIntelligence).toBeNull();
      expect(eligible.fitnessProfile).toBeNull();
      expect(JSON.stringify(eligible)).not.toMatch(PROFILE_LEAK);
    });

    it("answers rain/gym without unrelated profile factors", async () => {
      provider.text = "Considering rain only: not enough reason to skip if you can get there safely.";
      const turn = await post(RAIN);
      expect(turn.status).toBe(200);
      expect(turn.text).toMatch(/rain|skip|safely|gym/i);
      expect(turn.text).not.toMatch(PROFILE_LEAK);
      expect(turn.prompt).toMatch(/EXPLICIT REASONING SCOPE/);
      expect(turn.prompt).toMatch(/"recovery": null/);
      expect(turn.prompt).not.toMatch(/"todayScore": 41|"goal": "lean bulk"/);
      expect(turn.providerCalls).toBe(1);
      expect(applyScopeToText(
        "Considering rain only: go if safe. Your recovery score is 41, lean bulk is behind, do a home workout.",
        extractReasoningScope(RAIN),
        "en",
      )).not.toMatch(PROFILE_LEAK);
    });
  });

  describe("TEST B — recovery excluded", () => {
    it("uses sleep only", () => {
      const message = "Ignore my recovery. Just based on the fact I slept 8 hours, should I train?";
      const scope = extractReasoningScope(message);
      expect(scope.mode).toBe("ONLY");
      expect(scope.allowedFactors).toContain("sleep");
      expect(scope.allowedFactors).not.toContain("recovery");
      const eligible = restrictUserContext(FAT_CONTEXT, scope);
      expect(eligible.recovery).toBeNull();
      expect(applyScopeToText(
        "You slept 8 hours so train. Recovery score 41 says otherwise.",
        scope,
        "en",
      )).not.toMatch(/recovery score/i);
    });
  });

  describe("TEST C — nutrition only", () => {
    it("keeps protein data and drops training/recovery", () => {
      const message = "Only considering my protein intake today, am I under target?";
      const scope = extractReasoningScope(message);
      expect(scope.mode).toBe("ONLY");
      expect(scope.allowedFactors).toEqual(expect.arrayContaining(["protein", "nutrition"]));
      const eligible = restrictUserContext(FAT_CONTEXT, scope);
      expect(eligible.todayFoodLog).toEqual(FAT_CONTEXT.todayFoodLog);
      expect(eligible.recovery).toBeNull();
      expect(eligible.trainingIntelligence).toBeNull();
    });
  });

  describe("TEST D — explicit exclusion", () => {
    it("drops history and recovery for rain-alone skip", () => {
      const message = "Don't use my training history or recovery. Just tell me whether rain alone is enough reason to skip.";
      const scope = extractReasoningScope(message);
      expect(scope.mode).toBe("ONLY");
      expect(scope.allowedFactors).toEqual(expect.arrayContaining(["rain"]));
      const eligible = restrictUserContext(FAT_CONTEXT, scope);
      expect(eligible.recovery).toBeNull();
      expect(eligible.trainingIntelligence).toBeNull();
    });
  });

  describe("TEST E — safety override", () => {
    it("keeps weather safety and still blocks recovery lecture", () => {
      const message = "Only considering weather: there's lightning and flooding. Should I go?";
      const scope = extractReasoningScope(message);
      expect(scope.allowedFactors).toEqual(expect.arrayContaining(["weather"]));
      const text = applyScopeToText(
        "Lightning and flooding are enough reason to skip. Recovery score 41 also looks poor.",
        scope,
        "en",
      );
      expect(text).toMatch(/lightning|flooding/i);
      expect(text).not.toMatch(/recovery score/i);
    });
  });

  describe("TEST F — no explicit scope", () => {
    it("does not strip normal profile context", () => {
      const scope = extractReasoningScope("Should I train today?");
      expect(scope.mode).toBe("NONE");
      expect(restrictUserContext(FAT_CONTEXT, scope)).toEqual(FAT_CONTEXT);
      expect(insightAllowed("recovery", scope)).toBe(true);
    });
  });

  describe("TEST G — current-turn binding regression", () => {
    it("after volume talk, rain-only still owns the answer", async () => {
      await post("Volume giảm tuần này, performance tốt lên. Có phải giảm volume là nguyên nhân không?");
      provider.text = "Considering rain only: go if travel is safe.";
      const turn = await post("only considering rain, should I skip?");
      expect(turn.text).toMatch(/rain/i);
      expect(turn.text).not.toMatch(/attribute the improvement to lower volume|volume, sleep, calories/i);
      expect(turn.text).not.toMatch(PROFILE_LEAK);
    });
  });

  describe("TEST H — sibling scope isolation", () => {
    const SIBLING =
      "Only considering rain, should I skip the gym, and based on recovery, what should I log?";

    it("does not union rain and recovery onto a shared contract", () => {
      expect(extractReasoningScope(SIBLING).mode).toBe("NONE");
      const ledger = buildObligationLedger(SIBLING);
      const opens = ledger.obligations.filter((o) => o.intent === "OPEN_REQUEST");
      expect(opens.length).toBeGreaterThanOrEqual(2);
      expect(hasDivergentReasoningScopes(ledger.obligations)).toBe(true);
      expect(primaryObligationScope(ledger.obligations).mode).toBe("NONE");
      const rain = opens.find((o) => scopeOf(o).allowedFactors.includes("rain"));
      const recovery = opens.find((o) => scopeOf(o).allowedFactors.includes("recovery"));
      expect(rain).toBeDefined();
      expect(recovery).toBeDefined();
      expect(scopeOf(rain).allowedFactors).not.toContain("recovery");
      expect(eligibleContextFor(FAT_CONTEXT, scopeOf(rain)).recovery).toBeNull();
      expect(eligibleContextFor(FAT_CONTEXT, scopeOf(recovery)).recovery).toEqual(FAT_CONTEXT.recovery);
    });

    it("does not let rain-only erase a sibling logging question", async () => {
      const ledger = buildObligationLedger(SIBLING);
      const opens = ledger.obligations.filter((o) => o.intent === "OPEN_REQUEST");
      const rain = opens.find((o) => scopeOf(o).allowedFactors.includes("rain"));
      const recovery = opens.find((o) => scopeOf(o).allowedFactors.includes("recovery"));
      expect(rain && recovery).toBeTruthy();
      provider.text = JSON.stringify([
        { obligationId: rain?.id, text: "Rain alone is not enough to skip." },
        { obligationId: recovery?.id, text: "Log today's recovery score and sleep." },
      ]);
      const turn = await post(SIBLING);
      expect(turn.status).toBe(200);
      expect(turn.text).toMatch(/rain/i);
      expect(turn.text).toMatch(/log|recovery/i);
      expect(turn.providerCalls).toBe(1);
      const envelopes = extractObligationEnvelopesFromPrompt(turn.prompt);
      expect(envelopes).not.toBeNull();
      const rainEnv = envelopes?.find((e) => e.scope.allowedFactors.includes("rain"));
      const recEnv = envelopes?.find((e) => e.scope.allowedFactors.includes("recovery"));
      expect(rainEnv?.obligationId).toBe(rain?.id);
      expect(recEnv?.obligationId).toBe(recovery?.id);
      expect(JSON.stringify(rainEnv?.eligibleContext ?? {})).not.toMatch(/recovery|todayScore/);
      expect(turn.prompt).not.toMatch(/CLIENT PROFILE/);
      expect(turn.prompt.split("OBLIGATION_ENVELOPES=").length).toBe(2);
    });
  });

  describe("TEST H2 — exclude variants normalize to EXCLUDE(recovery)", () => {
    const phrases = [
      "exclude recovery, should I train?",
      "don't factor in recovery, should I train?",
      "forget recovery, should I train?",
      "leave recovery out, should I train?",
      "don't consider recovery, should I train?",
      "don't use recovery, should I train?",
      "bỏ qua recovery, tao có nên tập không?",
      "không tính recovery, tao có nên tập không?",
    ];
    it.each(phrases)("%s", (message) => {
      const scope = extractReasoningScope(message);
      expect(scope.mode).toBe("EXCLUDE");
      expect(scope.excludedFactors).toContain("recovery");
      expect(eligibleContextFor(FAT_CONTEXT, scope).recovery).toBeNull();
    });
  });

  describe("TEST H3 — only variants", () => {
    const phrases = [
      "only considering rain, should I skip the gym?",
      "just because of rain, should I skip the gym?",
      "only based on rain, should I skip the gym?",
      "forget everything else, just consider rain, should I skip the gym?",
      "rain only, should I skip the gym?",
      "consider nothing except rain, should I skip the gym?",
      "consider nothing but rain, should I skip the gym?",
      "only take rain into account, should I skip the gym?",
      "take only rain into account, should I skip the gym?",
      "nothing matters here except rain, should I skip the gym?",
      "base this only on rain, should I skip the gym?",
      "judge this only by rain, should I skip the gym?",
      "chỉ xét mưa, tao có nên nghỉ gym không?",
      "chỉ dựa vào mưa, tao có nên nghỉ gym không?",
      "chỉ tính mưa, tao có nên nghỉ gym không?",
      "chỉ tính chuyện mưa, tao có nên nghỉ gym không?",
      "ngoài mưa ra không xét gì khác, tao có nên nghỉ gym không?",
      "không xét gì ngoài mưa, tao có nên nghỉ gym không?",
      "chỉ lấy mưa làm yếu tố, tao có nên nghỉ gym không?",
      "chỉ dựa trên mưa, tao có nên nghỉ gym không?",
    ];
    it.each(phrases)("%s", (message) => {
      const scope = extractReasoningScope(message);
      expect(scope.mode).toBe("ONLY");
      expect(scope.allowedFactors).toEqual(expect.arrayContaining(["rain"]));
      expect(eligibleContextFor(FAT_CONTEXT, scope).recovery).toBeNull();
    });
  });

  describe("TEST H4 — fallback keeps obligation scope", () => {
    it("does not dump profile when the verifier falls back", async () => {
      provider.text = "Skip because your recovery score is 41 and calories are 2800.";
      const turn = await post(RAIN);
      expect(turn.text).not.toMatch(PROFILE_LEAK);
      expect(turn.text).toMatch(/rain|skip|safely|gym|factor you limited/i);
    });

    it("scopedFallback never receives unrestricted context", () => {
      const scope = extractReasoningScope(RAIN);
      expect(JSON.stringify(eligibleContextFor(FAT_CONTEXT, scope))).not.toMatch(/todayScore|lean bulk/);
      expect(scopedFallback(scope, "en")).not.toMatch(PROFILE_LEAK);
    });
  });

  describe("TEST H5 — authority + scope gate", () => {
    const rain = extractReasoningScope("only considering rain, should I skip the gym?");
    const obl = { id: "obl_req_0", intent: "OPEN_REQUEST", reasoningScope: rain };

    it("AUTHORIZED + OUT_OF_SCOPE is blocked", () => {
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "obl_req_0",
          text: "Recovery looks poor so skip.",
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: ["factor:recovery"],
        }],
        [obl],
        "en",
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
      expect(gated[0]?.text).toBe("");
    });

    it("IN_SCOPE + UNAUTHORIZED stays blocked", () => {
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "obl_req_0",
          text: "Rain is not enough reason to skip.",
          renderStatus: "DEGRADED",
          authority: "UNVERIFIED",
          semanticRefs: ["factor:rain"],
        }],
        [obl],
        "en",
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
      expect(gated[0]?.text).toBe("Rain is not enough reason to skip.");
    });

    it("AUTHORIZED + IN_SCOPE remains eligible", () => {
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "obl_req_0",
          text: "Rain is not enough reason to skip.",
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: ["factor:rain", "scope:obl:obl_req_0"],
        }],
        [obl],
        "en",
      );
      expect(gated[0]?.renderStatus).toBe("NORMAL");
      expect(gated[0]?.text).toMatch(/rain/i);
    });

    it("AUTHORIZED + NO_REFS under explicit scope is blocked", () => {
      expect(blockSupportedByScope({ semanticRefs: [] }, rain)).toBe(false);
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "obl_req_0",
          text: "Skip the gym.",
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: [],
        }],
        [obl],
        "en",
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
      expect(gated[0]?.text).toBe("");
    });

    it("unreferenced fallback block under explicit scope is blocked", () => {
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "obl_req_0",
          text: scopedFallback(rain, "en"),
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: [],
        }],
        [obl],
        "en",
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
    });
  });

  describe("TEST H6 — unsolicited expansion", () => {
    it("rain-only yes/no does not suggest a home workout", async () => {
      provider.text = "Skip. Do a home workout instead, your recovery score is 41.";
      const turn = await post("only considering rain, should I skip the gym?");
      expect(turn.text).not.toMatch(/home workout/i);
      expect(turn.text).not.toMatch(PROFILE_LEAK);
    });
  });

  describe("TEST H7 — multilingual sibling isolation", () => {
    it("Vietnamese ONLY and English sibling keep separate scopes", () => {
      const message = "Chỉ xét mưa, tao có nên nghỉ gym không? And based on recovery, what should I log?";
      const ledger = buildObligationLedger(message);
      const opens = ledger.obligations.filter((o) => o.intent === "OPEN_REQUEST");
      expect(opens.length).toBeGreaterThanOrEqual(2);
      const vi = opens.find((o) => scopeOf(o).allowedFactors.includes("rain"));
      const en = opens.find((o) => scopeOf(o).allowedFactors.includes("recovery"));
      expect(vi).toBeDefined();
      expect(en).toBeDefined();
      expect(eligibleContextFor(FAT_CONTEXT, scopeOf(vi)).recovery).toBeNull();
      expect(eligibleContextFor(FAT_CONTEXT, scopeOf(en)).recovery).toEqual(FAT_CONTEXT.recovery);
    });
  });

  describe("TEST H8 — unknown factors stay out before lexical redaction", () => {
    const UNKNOWN = {
      ...FAT_CONTEXT,
      commuteDuration: 45,
      trainingPartnerAvailability: false,
      gymCrowdLevel: "packed",
      musicPreference: "metal",
    };

    it("rain-only eligibleContext never receives unknown families", () => {
      const eligible = eligibleContextFor(UNKNOWN, extractReasoningScope(RAIN));
      expect(eligible).not.toHaveProperty("commuteDuration");
      expect(eligible).not.toHaveProperty("trainingPartnerAvailability");
      expect(eligible).not.toHaveProperty("gymCrowdLevel");
      expect(eligible).not.toHaveProperty("musicPreference");
      expect(JSON.stringify(eligible)).not.toMatch(/commute|trainingPartner|gymCrowd|musicPreference/i);
    });

    it("rain-only envelopes omit unknown families even with lexical disabled", () => {
      const obl = {
        id: "obl_req_0",
        intent: "OPEN_REQUEST",
        payload: { normalized: RAIN },
        reasoningScope: extractReasoningScope(RAIN),
      };
      const [envelope] = buildObligationEnvelopes([obl], UNKNOWN);
      expect(JSON.stringify(envelope?.eligibleContext ?? {})).not.toMatch(
        /commuteDuration|trainingPartnerAvailability|gymCrowdLevel|musicPreference|todayScore|recovery/,
      );
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "obl_req_0",
          text: "Commute is 45 minutes, partner is out, gym is packed, skip the metal playlist.",
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: ["context:commuteDuration", "context:trainingPartnerAvailability", "context:gymCrowdLevel", "context:musicPreference"],
        }],
        [obl],
        "en",
        { lexical: false },
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
    });
  });

  describe("TEST I — multilingual", () => {
    it("Vietnamese chỉ xét mưa matches English only-considering rain", () => {
      const vi = extractReasoningScope("Chỉ xét chuyện trời mưa thôi, tao có nên nghỉ gym không?");
      const en = extractReasoningScope("only considering rain, should I skip the gym?");
      expect(vi.mode).toBe(en.mode);
      expect(vi.allowedFactors).toEqual(expect.arrayContaining(["rain"]));
      expect(en.allowedFactors).toEqual(expect.arrayContaining(["rain"]));
    });
  });

  describe("TEST J — persona register not hardcoded", () => {
    it("scope copy does not force mày-tao or ông", () => {
      const scope = extractReasoningScope(RAIN);
      const directive = scopePromptDirective(scope, RAIN, "en");
      expect(directive).not.toMatch(/mày|tao|ông|bạn/i);
      expect(scopedFallback(scope, "en")).not.toMatch(/mày|tao|ông/i);
      expect(scopedFallback(scope, "vi")).not.toMatch(/mày|tao/i);
    });

    it("MAY_TAO plan survives a scoped rain turn", () => {
      const prepared = prepareCoherenceTurn({
        message: "Chỉ xét mưa thôi, tao có nên nghỉ gym không?",
        now: NOW,
        sessionId: "p15-j",
        history: [
          { role: "user", text: "mày-tao đi", at: NOW },
          { role: "assistant", text: "Ok.", at: NOW },
        ],
      });
      expect(prepared.expressionPlan.addressStyle).toBe("MAY_TAO");
      const finished = finishCoherenceDraft({
        prepared,
        message: "Chỉ xét mưa thôi, tao có nên nghỉ gym không?",
        phase1Draft: "Chỉ xét mưa: không đủ lý do để skip. Đi được thì đi.",
      });
      expect(finished.expressionPlan.addressStyle).toBe("MAY_TAO");
      expect(finished.response).not.toMatch(PROFILE_LEAK);
    });
  });

  describe("mutation checks", () => {
    const scope = extractReasoningScope(RAIN);
    const SIBLING =
      "Only considering rain, should I skip the gym, and based on recovery, what should I log?";

    it("fails if recovery re-enters rain-only", () => {
      expect(applyScopeToText("Recovery score 41 so skip.", scope, "en")).not.toMatch(/recovery score/i);
    });

    it("fails if nutrition leaks into rain-only", () => {
      expect(applyScopeToText("Your calorie target is 2800 so stay home.", scope, "en")).not.toMatch(/calorie target/i);
    });

    it("fails if ONLY is ignored", () => {
      expect(extractReasoningScope(RAIN).mode).toBe("ONLY");
    });

    it("fails if excluded-factor filter is bypassed", () => {
      const excluded = extractReasoningScope("Ignore my recovery. Just based on the fact I slept 8 hours, should I train?");
      const eligible = restrictUserContext(FAT_CONTEXT, excluded);
      expect(eligible.recovery).toBeNull();
    });

    it("does not suppress weather safety", () => {
      const weather = extractReasoningScope("Only considering weather: there's lightning and flooding. Should I go?");
      expect(applyScopeToText("Lightning and flooding: skip.", weather, "en")).toMatch(/lightning|flooding/i);
      expect(weather.safetyOverride).toBe(true);
    });

    it("does not let rain-only wipe a NONE sibling extract", () => {
      expect(extractReasoningScope("what should I log before training?").mode).toBe("NONE");
    });

    it("fails if sibling A receives sibling B scope", () => {
      const opens = buildObligationLedger(SIBLING).obligations.filter((o) => o.intent === "OPEN_REQUEST");
      const rain = opens.find((o) => scopeOf(o).allowedFactors.includes("rain"));
      const recovery = opens.find((o) => scopeOf(o).allowedFactors.includes("recovery"));
      expect(scopeOf(rain).allowedFactors).not.toEqual(scopeOf(recovery).allowedFactors);
    });

    it("fails if turn-global extract replaces per-obligation scope", () => {
      expect(extractReasoningScope(SIBLING).mode).toBe("NONE");
      expect(hasDivergentReasoningScopes(buildObligationLedger(SIBLING).obligations)).toBe(true);
    });

    it("fails if EXCLUDE normalization is disabled", () => {
      expect(extractReasoningScope("don't factor in recovery, should I train?").mode).toBe("EXCLUDE");
    });

    it("fails if fallback receives unrestricted context", () => {
      expect(eligibleContextFor(FAT_CONTEXT, extractReasoningScope(RAIN)).recovery).toBeNull();
    });

    it("fails if lexical redaction is the only filter", () => {
      const eligible = eligibleContextFor(FAT_CONTEXT, extractReasoningScope(RAIN));
      expect(eligible.recovery).toBeNull();
      expect(eligible.currentNutritionPlan).toBeNull();
      expect(JSON.stringify(eligible)).not.toMatch(/todayScore/);
    });

    it("fails if authority gate ignores scope", () => {
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "a",
          text: "ok",
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: ["factor:recovery"],
        }],
        [{ id: "a", intent: "OPEN_REQUEST", reasoningScope: extractReasoningScope(RAIN) }],
        "en",
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
    });

    it("fails if safety override is disabled", () => {
      expect(extractReasoningScope(RAIN).safetyOverride).toBe(true);
      expect(extractReasoningScope("exclude recovery, should I train?").safetyOverride).toBe(true);
    });

    it("A. fails if missing semanticRefs are treated as in-scope", () => {
      expect(blockSupportedByScope({ semanticRefs: [] }, scope)).toBe(false);
      expect(blockSupportedByScope({ semanticRefs: undefined }, scope)).toBe(false);
    });

    it("B. structural isolation holds when lexical filtering is disabled", () => {
      const fat = { ...FAT_CONTEXT, commuteDuration: 45, trainingPartnerAvailability: false, gymCrowdLevel: "packed", musicPreference: "metal" };
      const eligible = eligibleContextFor(fat, scope);
      expect(eligible).not.toHaveProperty("commuteDuration");
      expect(eligible).not.toHaveProperty("trainingPartnerAvailability");
      expect(eligible).not.toHaveProperty("gymCrowdLevel");
      expect(eligible).not.toHaveProperty("musicPreference");
      expect(eligible.recovery).toBeNull();
      const rain = extractReasoningScope(RAIN);
      const obl = { id: "obl_req_0", intent: "OPEN_REQUEST", reasoningScope: rain };
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "obl_req_0",
          text: "Commute duration is 45 minutes so skip.",
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: ["context:commuteDuration"],
        }],
        [obl],
        "en",
        { lexical: false },
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
    });

    it("C. fails if sibling B context is in a shared top-level pool", () => {
      const ledger = buildObligationLedger(SIBLING);
      const envelopes = buildObligationEnvelopes(
        ledger.obligations.filter((o) => o.intent === "OPEN_REQUEST"),
        { ...FAT_CONTEXT, commuteDuration: 45 },
      );
      expect(envelopes).toHaveLength(2);
      const rainEnv = envelopes.find((e) => e.scope.allowedFactors.includes("rain"));
      const recEnv = envelopes.find((e) => e.scope.allowedFactors.includes("recovery"));
      expect(JSON.stringify(rainEnv?.eligibleContext)).not.toMatch(/recovery|todayScore|commuteDuration/);
      expect(recEnv?.eligibleContext.recovery).toEqual(FAT_CONTEXT.recovery);
      expect(JSON.stringify(envelopes)).not.toMatch(/"commuteDuration"/);
    });

    it("D. fails if provider output omits obligationId", () => {
      expect(parseBoundObligationReplies(
        JSON.stringify([{ text: "Rain is not enough to skip." }]),
        ["obl_a", "obl_b"],
      )).toBeNull();
      expect(parseBoundObligationReplies("Rain alone is not enough to skip.", ["obl_a"])).toBeNull();
    });

    it("E. fails if ONLY paraphrase for consider-nothing-except-rain is removed", () => {
      expect(extractReasoningScope("consider nothing except rain, should I skip the gym?").mode).toBe("ONLY");
      expect(extractReasoningScope("consider nothing except rain, should I skip the gym?").allowedFactors).toContain("rain");
    });

    it("F. fails if scope validator trusts authority without scope proof", () => {
      const gated = applyObligationScopesToBlocks(
        [{
          obligationId: "a",
          text: "ok",
          renderStatus: "NORMAL",
          authority: "AUTHORITATIVE",
          semanticRefs: [],
        }],
        [{ id: "a", intent: "OPEN_REQUEST", reasoningScope: extractReasoningScope(RAIN) }],
        "en",
      );
      expect(gated[0]?.renderStatus).toBe("DEGRADED");
    });

    it("G. fails if one sibling's factor IDs are used by another sibling", () => {
      const opens = buildObligationLedger(SIBLING).obligations.filter((o) => o.intent === "OPEN_REQUEST");
      const rain = opens.find((o) => scopeOf(o).allowedFactors.includes("rain"));
      expect(blockSupportedByScope(
        { obligationId: rain?.id, semanticRefs: [`scope:obl:${rain?.id}`, "factor:recovery"] },
        scopeOf(rain),
      )).toBe(false);
    });

    it("NONE-scope no-ref blocks remain eligible", () => {
      expect(blockSupportedByScope({ semanticRefs: [] }, extractReasoningScope("Should I train today?"))).toBe(true);
    });
  });
});
