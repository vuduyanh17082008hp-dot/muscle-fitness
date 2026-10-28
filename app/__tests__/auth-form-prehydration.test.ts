import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Before hydration a React `onSubmit` handler is not attached, so the
 * server-rendered form is a plain HTML form: a click (or Enter) submits it
 * natively — GET puts every named field, passwords included, in the URL.
 * Each credential form must therefore server-render its submit button
 * disabled. The real-browser check of the same contract lives in the
 * security-repair harness; this pins the SSR markup.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import LoginPage from "@/app/login/page";
import { RegisterForm } from "@/app/register/register-form";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { ResendConfirmationForm } from "@/app/email-confirmation/resend-confirmation-form";
import RootLoading from "@/app/loading";

function credentialForms(html: string) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)]
    .filter(([, , body]) => /type="(password|email)"/.test(body))
    .map(([, attrs, body]) => ({
      attrs,
      body,
      submits: [...body.matchAll(/<button\b([^>]*)>/g)].map((m) => m[1]).filter((a) => /type="submit"/.test(a)),
    }));
}

const cases: Array<[string, ComponentType<never>, object, boolean]> = [
  ["login", LoginPage as ComponentType<never>, {}, true],
  ["register", RegisterForm as ComponentType<never>, {}, true],
  ["reset-password", ResetPasswordForm as ComponentType<never>, {}, true],
  ["forgot-password", ForgotPasswordForm as ComponentType<never>, { invalidLink: false }, false],
  // A prefilled email would otherwise make the resend button live before hydration.
  ["email-confirmation", ResendConfirmationForm as ComponentType<never>, { initialEmail: "prefill@example.test" }, false],
];

describe("credential forms cannot submit natively before hydration", () => {
  it.each(cases)("%s server-renders its submit button disabled", (_name, Component, props, hasPassword) => {
    const forms = credentialForms(renderToString(createElement(Component, props as never)));

    expect(forms).toHaveLength(1);
    const [form] = forms;
    expect(/type="password"/.test(form.body)).toBe(hasPassword);
    expect(form.submits.length).toBeGreaterThan(0);
    for (const submit of form.submits) expect(submit).toMatch(/\bdisabled=""/);
    // No server endpoint is wired for these forms; a native submit has nowhere safe to go.
    expect(form.attrs).not.toMatch(/\baction=/);
  });

  it("explains the disabled button when JavaScript never loads", () => {
    // /login is static; the other auth pages stream behind the root loading fallback.
    for (const html of [renderToString(createElement(RootLoading)), renderToString(createElement(LoginPage))]) {
      expect(html).toMatch(/<noscript>[\s\S]*needs JavaScript[\s\S]*<\/noscript>/);
    }
  });

  it("keeps labelled credential inputs in the server markup", () => {
    const html = renderToString(createElement(RegisterForm));
    for (const id of ["full-name", "register-email", "register-password", "confirm-password"]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`for="${id}"`);
    }
  });
});
