import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import CameraPage from "@/app/camera/page";
import ChatbotPage from "@/app/chatbot/page";
import TrainingPage from "@/app/training/page";
import WorkoutPage from "@/app/workout/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

describe("legacy public route redirects", () => {
  it("sends /chatbot to canonical Dante instead of a public Online shell", () => {
    expect(() => ChatbotPage()).toThrow("REDIRECT:/dashboard/ai-coach");
    const source = readFileSync(path.join(process.cwd(), "app/chatbot/page.tsx"), "utf8");
    expect(source).not.toMatch(/Online/);
    expect(source).not.toMatch(/DanteChat/);
  });

  it("sends /workout to canonical training", () => {
    expect(() => WorkoutPage()).toThrow("REDIRECT:/dashboard/workouts");
  });

  it("sends /camera to canonical Form Coach", () => {
    expect(() => CameraPage()).toThrow("REDIRECT:/dashboard/workouts/form-coach");
  });

  it("sends /training to canonical training", () => {
    expect(() => TrainingPage()).toThrow("REDIRECT:/dashboard/workouts");
  });
});

describe("meal-plan route semantics", () => {
  it("does not link to leftover /chatbot or /training", () => {
    const source = readFileSync(path.join(process.cwd(), "app/meal-plan/page.tsx"), "utf8");
    expect(source).not.toContain('href="/chatbot"');
    expect(source).not.toContain('href="/training"');
    expect(source).toContain('href="/dashboard/ai-coach"');
    expect(source).toContain('href="/dashboard/workouts"');
  });
});

describe("legal pages", () => {
  it("privacy copy is not a placeholder", () => {
    const source = readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8");
    expect(source).not.toMatch(/PLACEHOLDER/i);
    expect(source).toContain("/responsible-ai");
    expect(PrivacyPage().type).toBe("main");
  });

  it("terms copy is not a placeholder", () => {
    const source = readFileSync(path.join(process.cwd(), "app/terms/page.tsx"), "utf8");
    expect(source).not.toMatch(/PLACEHOLDER/i);
    expect(TermsPage().type).toBe("main");
  });

  it("signup still links to /privacy and /terms", () => {
    const source = readFileSync(path.join(process.cwd(), "app/register/register-form.tsx"), "utf8");
    expect(source).toContain('href="/privacy"');
    expect(source).toContain('href="/terms"');
  });
});

describe("legacy page files", () => {
  it("keeps compatibility routes as pages", () => {
    expect(existsSync(path.join(process.cwd(), "app/chatbot/page.tsx"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "app/workout/page.tsx"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "app/camera/page.tsx"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "app/training/page.tsx"))).toBe(true);
  });
});
