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
import { buildDanteQuickActions, buildDanteTodayContext, type TodayContextInput } from "@/lib/dante-core/today-context";
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

describe("Dante quick actions follow the safety hold", () => {
  const base: TodayContextInput = {
    now: new Date("2026-11-01T09:00:00Z"),
    localDate: "2026-11-01",
    hold: null,
    training: { status: "ok", session: { id: "s1", name: "Push Day", state: "not_started" } },
    recovery: { checkinsUnavailable: false, status: "CURRENT", score: 88, recordedDate: "2026-11-01", todayUpdatedAt: null },
    nutrition: { targets: { calories: 2400, protein: 150 }, log: { unavailable: false, entries: 2, calories: 900, protein: 110, lastLoggedAt: null } },
  };

  it("on hold, nothing offers to plan or push the session", () => {
    const text = buildDanteQuickActions({ ...base, hold: "recovery" }).map((a) => `${a.label} ${a.prompt}`).join(" | ");
    expect(text).toMatch(/flagged pain or illness/);
    expect(text).not.toMatch(/focus on Push Day|train hard|still train/);
  });

  it("without a hold the session starter is back, and no label carries an emoji", () => {
    const actions = buildDanteQuickActions(base);
    expect(actions.map((a) => a.prompt).join(" ")).toMatch(/focus on for my Push Day session/);
    expect(actions.every((a) => /^[A-Z]/.test(a.label))).toBe(true);
  });
});

describe("Dante chat surface", () => {
  const today = buildDanteTodayContext({ ...{
    now: new Date("2026-11-01T09:00:00Z"),
    localDate: "2026-11-01",
    hold: null,
    training: { status: "ok" as const, session: null },
    recovery: { checkinsUnavailable: false, status: "MISSING" as const, score: null, recordedDate: null, todayUpdatedAt: null },
    nutrition: { targets: { calories: 2400, protein: 150 }, log: { unavailable: false, entries: 1, calories: 600, protein: 110, lastLoggedAt: null } },
  } });
  const html = renderToStaticMarkup(createElement(DanteChat as FC<DanteChatProps>, { todayContext: today, restoreHistory: true }));

  it("is a conversation, not a demo: no robot, terminal prompt or LIVE/ONLINE badges", () => {
    const visible = text(html);
    for (const banned of ["$>", "ONLINE", "LIVE", "INTELLIGENCE COACH", "ANALYZING BIOMETRICS"]) expect(visible).not.toContain(banned);
    expect(read("components/dante-chat.tsx")).not.toMatch(/DanteRobot|BiometricFieldCanvas|holographic-telemetry-pod|DanteAvatar/);
  });

  it("shows a structured Today context that never treats a missing check-in as recovered, and a 16px, 44px-tall composer", () => {
    const visible = text(html);
    expect(visible).toContain("Today");
    expect(visible).toMatch(/Recovery\s*No check-in today/);
    expect(visible).toMatch(/Nutrition\s*600 kcal · 110 g protein logged/);
    expect(html).toContain('aria-expanded="false"');
    expect(visible).toContain("View context");
    expect(visible).not.toMatch(/recovered|ready to train/i);
    expect(html).toMatch(/aria-label="Message to Dante"[^>]*class="[^"]*min-h-11[^"]*text-base/);
    expect(html).toContain("mf-touch-inputs");
  });

  it("has a compact, labelled header: Dante heading, history and new chat", () => {
    expect(html).toMatch(/<h1[^>]*>Dante<\/h1>/);
    expect(html).toContain('aria-label="Conversation history"');
    expect(html).toContain('aria-label="New chat"');
    expect(html).not.toMatch(/<select[^>]*aria-label="Dante conversations"/);
  });

  it("offers quick actions as a labelled group of real prompts", () => {
    expect(html).toContain('role="group" aria-label="Quick actions"');
  });

  it("states a hold where it can't be missed", () => {
    const held = renderToStaticMarkup(createElement(DanteChat as FC<DanteChatProps>, { todayContext: { ...today, hold: "recovery", holdNote: "Training is on hold — today's check-in flagged pain or illness." }, restoreHistory: true }));
    expect(text(held)).toMatch(/Training is on hold/);
  });

  it("returns to the conversation this tab last had open, and marks where reopened history ends", () => {
    const chat = read("components/dante-chat.tsx");
    // One Day, One Thread: the tab's active thread is shared with the Nutrition page chat; with nothing remembered,
    // only today's most recent conversation reopens (never an older day's).
    expect(read("lib/dante-core/active-thread.ts")).toContain('export const LAST_THREAD_KEY = "mf.dante.lastThread"');
    expect(chat).toContain("fromUrl ?? (remembered === null ? todaysThread(list) : remembered || null)");
    expect(chat).toContain("Earlier conversation · figures above were current");
  });

  it("generic starters make no claims about today's state", () => {
    expect(text(renderToStaticMarkup(createElement(DanteChat, {})))).not.toMatch(/haven't checked in/i);
  });
});
