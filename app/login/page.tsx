"use client";

import {
  FormEvent,
  Suspense,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
} from "lucide-react";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import {
  GOOGLE_UNAVAILABLE_MESSAGE,
  useGoogleAuthEnabled,
} from "@/lib/auth/google-availability";
import { getSafeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/client";
import { SquatLifterFigure } from "@/components/brand/athletic-figures";
import { Wordmark } from "@/components/brand/wordmark";

type LoadingType = "email" | "google" | null;

const AUTH_SERVICE_UNREACHABLE_MESSAGE =
  "Unable to connect to the authentication service. Please try again.";

function getLoginErrorMessage(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("invalid login credentials") ||
    normalizedMessage.includes("invalid credentials")
  ) {
    return "Incorrect email or password. If your account was created with Google, sign in with Google instead.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "Your email hasn't been confirmed yet. Please check your inbox.";
  }

  if (
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("rate limit")
  ) {
    return "Too many sign-in attempts. Please wait a few minutes and try again.";
  }

  if (normalizedMessage.includes("provider is not enabled")) {
    return "This sign-in method isn't enabled yet.";
  }

  if (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network")
  ) {
    return "Couldn't reach the server. Please check your connection and try again.";
  }

  if (
    normalizedMessage.includes("missing supabase") ||
    normalizedMessage.includes("environment")
  ) {
    return "The app isn't configured correctly. Please try again later.";
  }

  return message || "Couldn't complete this request. Please try again.";
}


function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = useMemo(
    () => getSafeNext(searchParams.get("next")),
    [searchParams],
  );

  const callbackError = searchParams.get("error");
  const callbackMessage = searchParams.get("message");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Until hydration the submit handler isn't attached; a native submit would send the fields as a GET query string.
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

  const [loadingType, setLoadingType] =
    useState<LoadingType>(null);

  const [error, setError] = useState<string | null>(
    callbackError
      ? getLoginErrorMessage(callbackError)
      : null,
  );

  const isLoading = loadingType !== null;
  const googleEnabled = useGoogleAuthEnabled();

  async function handleEmailLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setError(null);
    setLoadingType("email");

    try {
      const supabase = createClient();

      const {
        data,
        error: signInError,
      } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        // console.error would raise the Next.js dev overlay for an expected, recoverable failure.
        console.warn("Supabase login error:", {
          name: signInError.name,
          message: signInError.message,
          status: signInError.status,
        });

        setError(
          isAuthRetryableFetchError(signInError)
            ? AUTH_SERVICE_UNREACHABLE_MESSAGE
            : getLoginErrorMessage(signInError.message),
        );

        return;
      }

      if (!data.user || !data.session) {
        console.warn(
          "Login succeeded but session was missing:",
          { hasUser: Boolean(data.user), hasSession: Boolean(data.session) },
        );

        setError(
          "Signed in, but couldn't start your session. Please try again.",
        );

        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (unknownError) {
      console.warn("Unexpected login error:", {
        name: unknownError instanceof Error ? unknownError.name : typeof unknownError,
        message: unknownError instanceof Error ? unknownError.message : undefined,
      });

      if (isAuthRetryableFetchError(unknownError) || unknownError instanceof TypeError) {
        setError(AUTH_SERVICE_UNREACHABLE_MESSAGE);
        return;
      }

      const message =
        unknownError instanceof Error
          ? unknownError.message
          : "Couldn't reach the sign-in system.";

      setError(getLoginErrorMessage(message));
    } finally {
      setLoadingType(null);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setLoadingType("google");

    try {
      const supabase = createClient();

      const callbackUrl = new URL(
        "/auth/callback",
        window.location.origin,
      );

      callbackUrl.searchParams.set(
        "next",
        redirectTo,
      );

      const { error: googleError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: callbackUrl.toString(),
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

      if (googleError) {
        console.error(
          "Google login error:",
          googleError,
        );

        setError(
          getLoginErrorMessage(
            googleError.message,
          ),
        );

        setLoadingType(null);
      }
    } catch (unknownError) {
      console.error(
        "Unexpected Google login error:",
        unknownError,
      );

      const message =
        unknownError instanceof Error
          ? unknownError.message
          : "Couldn't sign in with Google.";

      setError(getLoginErrorMessage(message));
      setLoadingType(null);
    }
  }

  return (
    <main data-theme="paper" className="relative flex min-h-screen items-center justify-center bg-mf-glass-bg px-4 py-10 text-mf-glass-text">
      <section className="relative w-full max-w-[540px] rounded-2xl border-2 border-mf-glass-text bg-mf-glass-surface p-6 shadow-[var(--shadow-card)] sm:p-10">
        {/* Brand */}
        <div className="flex items-center justify-between gap-4">
          <Wordmark />
          <SquatLifterFigure className="hidden size-16 shrink-0 sm:block" />
        </div>

        {/* Heading */}
        <div className="mt-10">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-mf-glass-text-secondary">
            Member access
          </p>

          <h1 className="mt-1 font-heading text-5xl font-black uppercase tracking-tight">
            Welcome back
          </h1>

          <p className="mt-2 max-w-md text-base leading-7 text-mf-glass-text-secondary">
            Continue your transformation. Your
            training, nutrition and progress are
            waiting.
          </p>
        </div>

        {/* Messages */}
        {callbackMessage && !error && (
          <div
            role="status"
            className="mt-8 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm leading-6 text-emerald-300"
          >
            {callbackMessage}
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-8 rounded-3xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm leading-6 text-red-300"
          >
            {error}
          </div>
        )}

        <noscript>
          <p className="mt-8 rounded-3xl border border-sky-400/20 bg-sky-500/10 px-5 py-4 text-sm leading-6 text-sky-200">
            Signing in needs JavaScript. Enable it in your browser and reload the page.
          </p>
        </noscript>

        {/* Login form */}
        <form
          onSubmit={handleEmailLogin}
          method="post"
          className="mt-7 space-y-6"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-3 block text-sm font-bold text-zinc-300"
            >
              Email address
            </label>

            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-600"
              />

              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                disabled={isLoading}
                onChange={(event) => {
                  setEmail(event.target.value);

                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="your@email.com"
                className="h-14 w-full rounded-md border bg-mf-glass-surface pl-14 pr-6 text-base text-mf-glass-text outline-none transition placeholder:text-mf-glass-text-muted focus:ring-4 focus:ring-mf-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <label
                htmlFor="password"
                className="text-sm font-bold text-zinc-300"
              >
                Password
              </label>

              <Link
                href="/forgot-password"
                className="text-sm font-bold text-zinc-300 transition hover:text-mf-brand-hover"
              >
                Forgot password?
              </Link>
            </div>

            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-600"
              />

              <input
                id="password"
                name="password"
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                disabled={isLoading}
                onChange={(event) => {
                  setPassword(event.target.value);

                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="Enter your password"
                className="h-14 w-full rounded-md border bg-mf-glass-surface pl-14 pr-14 text-base text-mf-glass-text outline-none transition placeholder:text-mf-glass-text-muted focus:ring-4 focus:ring-mf-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (current) => !current,
                  )
                }
                disabled={isLoading}
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-mf-glass-text-muted transition hover:text-mf-glass-text disabled:cursor-not-allowed"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !hydrated}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-md border-2 border-mf-glass-text bg-mf-brand px-6 font-heading text-lg font-bold uppercase tracking-[0.08em] text-mf-brand-ink transition hover:bg-mf-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingType === "email" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Signing in
              </>
            ) : (
              "Enter dashboard"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10" />

          <span className="text-xs font-black uppercase tracking-[0.12em] text-zinc-600">
            Or continue with
          </span>

          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Google */}
        <button
          type="button"
          disabled={isLoading || googleEnabled === false}
          aria-describedby={
            googleEnabled === false ? "google-unavailable" : undefined
          }
          onClick={handleGoogleLogin}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-md border border-mf-glass-border-strong bg-mf-glass-surface px-6 font-semibold text-mf-glass-text transition hover:bg-mf-glass-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingType === "google" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Connecting
            </>
          ) : (
            <>
              <GoogleIcon />
              Continue with Google
            </>
          )}
        </button>

        {googleEnabled === false ? (
          <p
            id="google-unavailable"
            className="mt-3 text-center text-sm text-zinc-400"
          >
            {GOOGLE_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}

        <p className="mt-8 text-center text-sm text-zinc-400">
          New to Muscle Fitness?{" "}
          <Link
            href="/register"
            className="font-bold text-mf-glass-text underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.227c0-.709-.064-1.391-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.509h3.232c1.891-1.741 2.982-4.309 2.982-7.35Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.041.955-3.386.955-2.605 0-4.809-1.759-5.595-4.123H3.064v2.591A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.405 13.9A6.01 6.01 0 0 1 6.091 12c0-.659.114-1.3.314-1.9V7.509H3.064A10 10 0 0 0 2 12c0 1.609.386 3.132 1.064 4.491L6.405 13.9Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.959 2.991 14.695 2 12 2a10 10 0 0 0-8.936 5.509L6.405 10.1C7.191 7.736 9.395 5.977 12 5.977Z"
      />
    </svg>
  );
}

function LoginFallback() {
  return (
    <main data-theme="paper" className="flex min-h-screen items-center justify-center bg-mf-glass-bg text-mf-glass-text">
      <div className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin text-mf-brand" />
        Loading secure login...
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}
