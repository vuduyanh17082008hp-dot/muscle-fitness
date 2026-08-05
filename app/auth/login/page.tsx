"use client";

import {
  FormEvent,
  Suspense,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Dumbbell,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type LoadingMethod = "email" | "google" | null;

function getReadableError(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "Email hoặc mật khẩu không chính xác.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "Email chưa được xác nhận. Hãy kiểm tra hộp thư của bạn.";
  }

  if (normalizedMessage.includes("too many requests")) {
    return "Bạn đã thử đăng nhập quá nhiều lần. Hãy đợi một lát rồi thử lại.";
  }

  if (normalizedMessage.includes("user not found")) {
    return "Không tìm thấy tài khoản với email này.";
  }

  if (normalizedMessage.includes("network")) {
    return "Không thể kết nối tới máy chủ. Hãy kiểm tra Internet.";
  }

  return message || "Đăng nhập thất bại. Vui lòng thử lại.";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectPath = useMemo(() => {
    const next = searchParams.get("next");

    if (!next || !next.startsWith("/") || next.startsWith("//")) {
      return "/dashboard";
    }

    return next;
  }, [searchParams]);

  const queryMessage = searchParams.get("message");
  const queryError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingMethod, setLoadingMethod] =
    useState<LoadingMethod>(null);
  const [error, setError] = useState<string | null>(
    queryError ? getReadableError(queryError) : null,
  );

  const isLoading = loadingMethod !== null;

  async function handleEmailLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Hãy nhập địa chỉ email.");
      return;
    }

    if (!password) {
      setError("Hãy nhập mật khẩu.");
      return;
    }

    setError(null);
    setLoadingMethod("email");

    try {
      const supabase = createClient();

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

      if (signInError) {
        throw signInError;
      }

      router.replace(redirectPath);
      router.refresh();
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : "Đăng nhập thất bại.";

      setError(getReadableError(message));
    } finally {
      setLoadingMethod(null);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setLoadingMethod("google");

    try {
      const supabase = createClient();

      const callbackUrl =
        `${window.location.origin}/auth/callback` +
        `?next=${encodeURIComponent(redirectPath)}`;

      const { error: googleError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: callbackUrl,
          },
        });

      if (googleError) {
        throw googleError;
      }
    } catch (googleLoginError) {
      const message =
        googleLoginError instanceof Error
          ? googleLoginError.message
          : "Không thể đăng nhập bằng Google.";

      setError(getReadableError(message));
      setLoadingMethod(null);
    }
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#070707] text-white">
      {/* Background effects */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-[-15%] top-[-20%] h-[520px] w-[520px] rounded-full bg-red-600/10 blur-[140px]" />

        <div className="absolute bottom-[-25%] right-[-10%] h-[600px] w-[600px] rounded-full bg-amber-500/10 blur-[160px]" />

        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#070707_75%)]" />
      </div>

      <div className="relative mx-auto grid min-h-svh max-w-[1500px] lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left branding section */}
        <section className="relative hidden min-h-svh overflow-hidden border-r border-white/10 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-3"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                <Dumbbell
                  className="h-6 w-6 text-red-500"
                  aria-hidden="true"
                />
              </span>

              <span>
                <span className="block text-lg font-black uppercase tracking-[0.18em]">
                  Muscle Fitness
                </span>

                <span className="block text-[10px] font-semibold uppercase tracking-[0.35em] text-zinc-500">
                  Built through discipline
                </span>
              </span>
            </Link>
          </div>

          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">
              <ShieldCheck
                className="h-4 w-4 text-red-500"
                aria-hidden="true"
              />

              Secure client portal
            </div>

            <h1 className="max-w-xl text-5xl font-black uppercase leading-[0.95] tracking-[-0.05em] xl:text-7xl">
              Your next level
              <span className="mt-2 block bg-gradient-to-r from-red-500 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                starts here.
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-zinc-400 xl:text-lg">
              Access your personalised training, nutrition,
              progress tracking and AI coaching system. Every
              workout is another vote for the person you want to
              become.
            </p>

            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[
                ["4D", "Mindset"],
                ["100%", "Personalised"],
                ["24/7", "Progress"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-sm"
                >
                  <p className="text-xl font-black text-white">
                    {value}
                  </p>

                  <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <blockquote className="max-w-xl border-l-2 border-red-500 pl-5 text-sm leading-7 text-zinc-400">
            “Dedication. Determination. Drive. Discipline. You do
            not need to be perfect. You only need to refuse to
            quit.”
          </blockquote>
        </section>

        {/* Login section */}
        <section className="flex min-h-svh items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <Link
              href="/"
              className="mb-10 inline-flex items-center gap-3 lg:hidden"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
                <Dumbbell className="h-5 w-5 text-red-500" />
              </span>

              <span className="font-black uppercase tracking-[0.16em]">
                Muscle Fitness
              </span>
            </Link>

            <div className="mb-8">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-red-500">
                Welcome back
              </p>

              <h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                Sign in to continue
              </h2>

              <p className="mt-3 leading-7 text-zinc-500">
                Continue building the strongest version of
                yourself.
              </p>
            </div>

            {queryMessage && !error && (
              <div
                role="status"
                className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-300"
              >
                {queryMessage}
              </div>
            )}

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="group flex h-13 w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-5 font-semibold text-white transition duration-200 hover:border-white/20 hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMethod === "google" ? (
                <Loader2
                  className="h-5 w-5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <GoogleIcon />
              )}

              {loadingMethod === "google"
                ? "Connecting to Google..."
                : "Continue with Google"}
            </button>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />

              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                or email
              </span>

              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form
              onSubmit={handleEmailLogin}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-zinc-300"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-600"
                  />

                  <input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    placeholder="you@example.com"
                    disabled={isLoading}
                    className="h-13 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-12 pr-4 text-white outline-none transition placeholder:text-zinc-700 focus:border-red-500/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-4">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-zinc-300"
                  >
                    Password
                  </label>

                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-semibold text-red-400 transition hover:text-red-300"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="relative">
                  <LockKeyhole
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-600"
                  />

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    placeholder="Enter your password"
                    disabled={isLoading}
                    className="h-13 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-12 pr-12 text-white outline-none transition placeholder:text-zinc-700 focus:border-red-500/60 focus:bg-white/[0.06] focus:ring-4 focus:ring-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((current) => !current)
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 transition hover:text-white"
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
                disabled={isLoading}
                className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 to-red-500 px-5 font-black uppercase tracking-[0.08em] text-white shadow-[0_16px_50px_rgba(239,68,68,0.22)] transition duration-200 hover:from-red-500 hover:to-orange-500 hover:shadow-[0_20px_60px_rgba(239,68,68,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMethod === "email" ? (
                  <>
                    <Loader2
                      className="h-5 w-5 animate-spin"
                      aria-hidden="true"
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight
                      className="h-5 w-5 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-zinc-500">
              Do not have an account?{" "}
              <Link
                href="/auth/register"
                className="font-bold text-white transition hover:text-red-400"
              >
                Create your account
              </Link>
            </p>

            <p className="mt-8 text-center text-xs leading-6 text-zinc-700">
              By continuing, you agree to the Muscle Fitness terms
              and privacy policy.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#070707] text-white">
      <div className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin text-red-500" />
        Loading secure login...
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}