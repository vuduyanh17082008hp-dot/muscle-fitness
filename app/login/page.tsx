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
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type LoadingType = "email" | "google" | null;

function getLoginErrorMessage(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("invalid login credentials") ||
    normalizedMessage.includes("invalid credentials")
  ) {
    return "Email hoặc mật khẩu không chính xác. Nếu tài khoản được tạo bằng Google, hãy đăng nhập bằng Google.";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "Email chưa được xác nhận. Hãy kiểm tra hộp thư của bạn.";
  }

  if (
    normalizedMessage.includes("too many requests") ||
    normalizedMessage.includes("rate limit")
  ) {
    return "Bạn đã thử đăng nhập quá nhiều lần. Hãy đợi vài phút rồi thử lại.";
  }

  if (normalizedMessage.includes("provider is not enabled")) {
    return "Phương thức đăng nhập này chưa được bật trong Supabase.";
  }

  if (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("network")
  ) {
    return "Không thể kết nối tới Supabase. Hãy kiểm tra Internet và file .env.local.";
  }

  if (
    normalizedMessage.includes("missing supabase") ||
    normalizedMessage.includes("environment")
  ) {
    return "Thiếu cấu hình Supabase trong file .env.local.";
  }

  return message || "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

function getSafeRedirect(next: string | null): string {
  if (!next) {
    return "/dashboard";
  }

  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }

  return next;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectTo = useMemo(
    () => getSafeRedirect(searchParams.get("next")),
    [searchParams],
  );

  const callbackError = searchParams.get("error");
  const callbackMessage = searchParams.get("message");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loadingType, setLoadingType] =
    useState<LoadingType>(null);

  const [error, setError] = useState<string | null>(
    callbackError
      ? getLoginErrorMessage(callbackError)
      : null,
  );

  const isLoading = loadingType !== null;

  async function handleEmailLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedEmail = email
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      setError("Vui lòng nhập địa chỉ email.");
      return;
    }

    if (!password) {
      setError("Vui lòng nhập mật khẩu.");
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
        console.error("Supabase login error:", {
          name: signInError.name,
          message: signInError.message,
          status: signInError.status,
        });

        setError(
          getLoginErrorMessage(signInError.message),
        );

        return;
      }

      if (!data.user || !data.session) {
        console.error(
          "Login succeeded but session was missing:",
          data,
        );

        setError(
          "Đăng nhập thành công nhưng không tạo được phiên đăng nhập. Hãy thử lại.",
        );

        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (unknownError) {
      console.error(
        "Unexpected login error:",
        unknownError,
      );

      const message =
        unknownError instanceof Error
          ? unknownError.message
          : "Không thể kết nối tới hệ thống đăng nhập.";

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
          : "Không thể đăng nhập bằng Google.";

      setError(getLoginErrorMessage(message));
      setLoadingType(null);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-4 py-10 text-white">
      {/* Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:90px_90px]" />

        <div className="absolute left-1/2 top-[-260px] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-orange-500/[0.08] blur-[130px]" />

        <div className="absolute bottom-[-350px] right-[-150px] h-[700px] w-[700px] rounded-full bg-violet-500/[0.07] blur-[150px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_75%)]" />
      </div>

      <section className="relative w-full max-w-[580px] rounded-[34px] border border-white/10 bg-black/90 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-10">
        {/* Brand */}
        <Link
          href="/"
          className="inline-flex items-center gap-4"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/10 text-lg font-black text-orange-400">
            MF
          </span>

          <span>
            <span className="block text-lg font-black uppercase tracking-[0.25em] text-white sm:text-xl">
              Muscle Fitness
            </span>

            <span className="mt-1 block text-sm text-zinc-600">
              Built through discipline
            </span>
          </span>
        </Link>

        {/* Heading */}
        <div className="mt-10">
          <p className="text-sm font-black uppercase tracking-[0.25em] text-orange-400">
            Member access
          </p>

          <h1 className="mt-1 text-4xl font-light uppercase tracking-tight sm:text-5xl">
            Welcome back
          </h1>

          <p className="mt-2 max-w-md text-base leading-7 text-zinc-500">
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

        {/* Login form */}
        <form
          onSubmit={handleEmailLogin}
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
                className="h-16 w-full rounded-full border border-white/10 bg-[#151515] pl-14 pr-6 text-base text-white outline-none transition placeholder:text-zinc-700 hover:border-white/20 focus:border-orange-400/70 focus:ring-4 focus:ring-orange-500/10 disabled:cursor-not-allowed disabled:opacity-60"
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
                href="/auth/forgot-password"
                className="text-sm font-bold text-zinc-300 transition hover:text-orange-400"
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
                className="h-16 w-full rounded-full border border-white/10 bg-[#151515] pl-14 pr-14 text-base text-white outline-none transition placeholder:text-zinc-700 hover:border-white/20 focus:border-orange-400/70 focus:ring-4 focus:ring-orange-500/10 disabled:cursor-not-allowed disabled:opacity-60"
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
                    ? "Ẩn mật khẩu"
                    : "Hiện mật khẩu"
                }
                className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-600 transition hover:text-white disabled:cursor-not-allowed"
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
            className="flex h-16 w-full items-center justify-center gap-3 rounded-full bg-orange-400 px-6 text-base font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
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

          <span className="text-xs font-black uppercase tracking-[0.28em] text-zinc-600">
            Or continue with
          </span>

          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Google */}
        <button
          type="button"
          disabled={isLoading}
          onClick={handleGoogleLogin}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-6 font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
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

        <p className="mt-8 text-center text-sm text-zinc-600">
          New to Muscle Fitness?{" "}
          <Link
            href="/auth/register"
            className="font-bold text-orange-400 transition hover:text-orange-300"
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
    <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
      <div className="flex items-center gap-3 text-sm font-semibold text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
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