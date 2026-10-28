import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * UX-R1.3: Dante is conversation-first (no robot/HUD, 16px composer, a current-data line, one "earlier conversation"
 * marker, hold-aware starters) and Recovery shows one verdict: failed read > safety hold > no check-in > score.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import DanteChat, { type DanteChatProps } from "@/components/dante-chat";
import { RecoveryScoreCard } from "@/components/recovery/recovery-score-card";
import { TrainingRecoveryCard } from "@/components/recovery/training-recovery-card";
import { buildChatSuggestions } from "@/lib/dante-core/build-chat-suggestions";
import { buildRecoveryRecommendation } from "@/lib/recovery/recommendation";
import type { RecoveryScoreResult, TrainingLoadSummary } from "@/lib/recovery/types";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

const ready: RecoveryScoreResult = {
  score: 88,
  status: "ready",
  drivers: [{ key: "sleep", label: "Sleep", score: 90, weight: 0.3, available: true }],
  missingInputs: [],
  baseline: null,
} as unknown as RecoveryScoreResult;
const empty: RecoveryScoreResult = { score: null, status: null, drivers: [], missingInputs: [], baseline: null };
const noCheckinLoad: TrainingLoadSummary = {
  state: "green",
  reason: "No recovery check-in yet today — log one to connect training load with readiness.",
  sessionsLast7Days: 2, restDaysLast7Days: 5, averageSessionRpe: null, totalVolumeKgLast7Days: null, lastSessionDaysAgo: 1,
};

const card = (props: Parameters<typeof RecoveryScoreCard>[0]) => text(renderToStaticMarkup(createElement(RecoveryScoreCard, props)));

describe("Recovery: one verdict, in order of authority", () => {
  it("pain/illness beats a 'ready' score: recovery first, no 'Ready' status", () => {
    const html = card({ result: ready, recommendation: buildRecoveryRecommendation(ready, noCheckinLoad, "recovery"), hold: "recovery" });
    expect(html).toMatch(/Recovery first today/);
    expect(html).toMatch(/flagged pain or illness/);
    expect(html).not.toMatch(/\bReady\b|Proceed with your planned session/);
    expect(html).toMatch(/doesn't clear training while this hold is in place/);
  });

  it("an unconfirmed check-in doesn't clear training", () => {
    const html = card({ result: ready, recommendation: buildRecoveryRecommendation(ready, noCheckinLoad, "unverified"), hold: "unverified" });
    expect(html).toMatch(/Training not cleared yet/);
    expect(html).not.toMatch(/\bReady\b/);
  });

  it("a failed read, no check-in and a valid check-in are three different states", () => {
    expect(card({ result: empty, recommendation: "x", checkinUnavailable: true, hold: "unverified" })).toMatch(/Recovery status unavailable.*couldn't be loaded/);
    const none = card({ result: empty, recommendation: "x", lastCheckin: { date: "2026-10-27", score: 61 } });
    expect(none).toMatch(/No check-in yet today/);
    expect(none).toMatch(/Last check-in: 2026-10-27 \(score 61\/100\) — that is not today's readiness/);
    expect(card({ result: ready, recommendation: buildRecoveryRecommendation(ready, noCheckinLoad) })).toMatch(/Ready .*Check-in score 88/);
  });

  it("the load card on Recovery shows load facts only — no GREEN chip without a check-in", () => {
    const html = text(renderToStaticMarkup(createElement(TrainingRecoveryCard, { summary: noCheckinLoad, signalsOnly: true })));
    expect(html).toMatch(/Training load · last 7 days/);
    expect(html).not.toMatch(/GREEN|RED|AMBER|Train normally/);
  });

  it("the page puts a missing check-in first, keeps every tool, and embeds no second chat", () => {
    const page = read("app/dashboard/recovery/page.tsx");
    expect(page.indexOf("{needsCheckin ? <RecoveryCheckinForm")).toBeLessThan(page.indexOf("<RecoveryScoreCard"));
    for (const kept of ["<RecoveryAdjustmentPanel", "<TrainingRecoveryCard", "<RecoveryTrendsChart", "<DecisionCard", "<MuscleReadinessPanel", "<RecoveryKnowledgeHub", "Not Medical Diagnosis"]) {
      expect(page).toContain(kept);
    }
    expect(page).toContain("hold={hold}");
    expect(page).not.toContain("<DanteChat");
    expect(page.match(/\/dashboard\/ai-coach\?ask=/g)).toHaveLength(1);
  });
});

describe("Dante starters follow the safety hold", () => {
  const base = { recoveryScore: 88, hasCheckinToday: true, todayWorkoutName: "Push Day", todayWorkoutSessionId: "s1", proteinRemainingG: 40, proteinTargetG: 150 };

  it("on hold, nothing offers to plan or push the session", () => {
    const labels = buildChatSuggestions({ ...base, trainingHold: "recovery" }).map((s) => s.action).join(" | ");
    expect(labels).toMatch(/flagged pain or illness/);
    expect(labels).not.toMatch(/focus on Push Day|train hard|still train/);
  });

  it("without a hold the session starter is back, and no starter carries an emoji", () => {
    const suggestions = buildChatSuggestions(base);
    expect(suggestions[0].action).toBe("What should I focus on for Push Day today?");
    expect(suggestions.every((s) => /^[A-Z]/.test(s.action))).toBe(true);
  });
});

describe("Dante chat surface", () => {
  const html = renderToStaticMarkup(createElement(DanteChat as FC<DanteChatProps>, { contextLine: "No check-in today · 40 g protein left", restoreHistory: true }));

  it("is a conversation, not a demo: no robot, terminal prompt or LIVE/ONLINE badges", () => {
    const visible = text(html);
    for (const banned of ["$>", "ONLINE", "LIVE", "INTELLIGENCE COACH", "ANALYZING BIOMETRICS"]) expect(visible).not.toContain(banned);
    expect(read("components/dante-chat.tsx")).not.toMatch(/DanteRobot|BiometricFieldCanvas|holographic-telemetry-pod/);
  });

  it("shows the current-data line and a 16px, 44px-tall composer", () => {
    expect(text(html)).toContain("Your data now · No check-in today · 40 g protein left");
    expect(html).toMatch(/aria-label="Message to Dante"[^>]*class="[^"]*min-h-11[^"]*text-base/);
    expect(html).toContain("mf-touch-inputs");
  });

  it("returns to the conversation this tab last had open, and marks where reopened history ends", () => {
    const chat = read("components/dante-chat.tsx");
    expect(chat).toContain('const LAST_THREAD_KEY = "mf.dante.lastThread"');
    expect(chat).toContain("fromUrl ?? (remembered === null ? list[0]?.id ?? null : remembered || null)");
    expect(chat).toContain("Earlier conversation · figures above were current");
  });

  it("generic starters make no claims about today's state", () => {
    expect(text(renderToStaticMarkup(createElement(DanteChat, {})))).not.toMatch(/haven't checked in/i);
  });
});
