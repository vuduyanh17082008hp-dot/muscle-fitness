"use client";

import Link from "next/link";
import {
  useRouter,
} from "next/navigation";

import {
  useState,
  type FormEvent,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";

type LoginFormProps = {
  nextPath?: string;
  initialError?: string;
};

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.32 2.98-7.39Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.61A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.39 13.91A6.02 6.02 0 0 1 6.07 12c0-.66.11-1.31.32-1.91V7.48H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.52l3.35-2.61Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.35 2.61C7.18 7.72 9.39 5.95 12 5.95Z"
      />
    </svg>
  );
}

function normalizeLoginError(
  message: string,
): string {
  const normalizedMessage =
    message.toLowerCase();

  if (
    normalizedMessage.includes(
      "invalid login credentials",
    )
  ) {
    return "Email hoặc mật khẩu không chính xác.";
  }

  if (
    normalizedMessage.includes(
      "email not confirmed",
    )
  ) {
    return "Email chưa được xác nhận. Hãy kiểm tra hộp thư.";
  }

  if (
    normalizedMessage.includes(
      "too many requests",
    )
  ) {
    return "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.";
  }

  if (
    normalizedMessage.includes(
      "supabase",
    ) ||
    normalizedMessage.includes(
      "chưa được cấu hình",
    )
  ) {
    return message;
  }

  return "Không thể đăng nhập. Vui lòng thử lại.";
}

export function LoginForm({
  nextPath = "/dashboard",
  initialError,
}: LoginFormProps) {
  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState(
    initialError ?? "",
  );

  const [
    isEmailLoading,
    setIsEmailLoading,
  ] = useState(false);

  const [
    isGoogleLoading,
    setIsGoogleLoading,
  ] = useState(false);

  const isLoading =
    isEmailLoading ||
    isGoogleLoading;

  async function handleEmailLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setErrorMessage("");
    setIsEmailLoading(true);

    try {
      const supabase =
        createClient();

      const {
        error,
      } =
        await supabase.auth
          .signInWithPassword({
            email: email.trim(),
            password,
          });

      if (error) {
        setErrorMessage(
          normalizeLoginError(
            error.message,
          ),
        );

        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      console.error(
        "Email login error:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? normalizeLoginError(
              error.message,
            )
          : "Không thể kết nối tới hệ thống đăng nhập.",
      );
    } finally {
      setIsEmailLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setErrorMessage("");
    setIsGoogleLoading(true);

    try {
      const supabase =
        createClient();

      const callbackUrl =
        new URL(
          "/auth/callback",
          window.location.origin,
        );

      callbackUrl.searchParams.set(
        "next",
        nextPath,
      );

      const {
        error,
      } =
        await supabase.auth
          .signInWithOAuth({
            provider: "google",

            options: {
              redirectTo:
                callbackUrl.toString(),
            },
          });

      if (error) {
        setErrorMessage(
          normalizeLoginError(
            error.message,
          ),
        );

        setIsGoogleLoading(false);
      }
    } catch (error) {
      console.error(
        "Google login error:",
        error,
      );

      setErrorMessage(
        error instanceof Error
          ? normalizeLoginError(
              error.message,
            )
          : "Không thể mở đăng nhập bằng Google.",
      );

      setIsGoogleLoading(false);
    }
  }

  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.32em] text-primary">
        WELCOME BACK
      </p>

      <h1 className="mt-4 text-4xl font-bold tracking-[-0.045em] text-foreground sm:text-5xl">
        Đăng nhập
      </h1>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Điền Gmail hoặc email của bạn,
        hoặc tiếp tục bằng tài khoản Google.
      </p>

      {errorMessage ? (
        <div
          role="alert"
          className={[
            "mt-6 rounded-xl",
            "border border-red-200",
            "bg-red-50 px-4 py-3",
            "text-sm leading-6",
            "text-red-700",
          ].join(" ")}
        >
          {errorMessage}
        </div>
      ) : null}

      <button
        type="button"
        onClick={
          handleGoogleLogin
        }
        disabled={isLoading}
        className={[
          "mt-8 flex min-h-12",
          "w-full items-center",
          "justify-center gap-3",
          "rounded-xl",
          "border border-border",
          "bg-white px-4",
          "text-sm font-semibold",
          "text-foreground",
          "shadow-sm",
          "transition-colors",
          "hover:bg-muted",
          "disabled:opacity-60",
        ].join(" ")}
      >
        {isGoogleLoading ? (
          <span
            aria-hidden="true"
            className={[
              "size-5",
              "animate-spin",
              "rounded-full",
              "border-2",
              "border-current",
              "border-r-transparent",
            ].join(" ")}
          />
        ) : (
          <GoogleIcon />
        )}

        {isGoogleLoading
          ? "Đang chuyển hướng..."
          : "Tiếp tục với Google"}
      </button>

      <div className="my-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />

        <span className="text-xs text-muted-foreground">
          hoặc dùng email
        </span>

        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        onSubmit={
          handleEmailLogin
        }
        className="space-y-5"
      >
        <div>
          <label
            htmlFor="login-email"
            className="text-sm font-semibold"
          >
            Gmail hoặc email
          </label>

          <input
            id="login-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(
                event.target.value,
              );
            }}
            autoComplete="email"
            placeholder="name@gmail.com"
            required
            disabled={isLoading}
            className={[
              "mt-2 h-12 w-full",
              "rounded-xl",
              "border border-input",
              "bg-white px-4",
              "text-sm outline-none",
              "focus:border-primary",
              "focus:ring-4",
              "focus:ring-primary/10",
            ].join(" ")}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="login-password"
              className="text-sm font-semibold"
            >
              Mật khẩu
            </label>

            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>

          <input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(
                event.target.value,
              );
            }}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            minLength={6}
            required
            disabled={isLoading}
            className={[
              "mt-2 h-12 w-full",
              "rounded-xl",
              "border border-input",
              "bg-white px-4",
              "text-sm outline-none",
              "focus:border-primary",
              "focus:ring-4",
              "focus:ring-primary/10",
            ].join(" ")}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={[
            "flex min-h-12",
            "w-full items-center",
            "justify-center gap-3",
            "rounded-xl",
            "bg-[#111811]",
            "px-5 text-sm",
            "font-semibold text-white",
            "hover:bg-[#1e2a20]",
            "disabled:opacity-60",
          ].join(" ")}
        >
          {isEmailLoading
            ? "Đang đăng nhập..."
            : "Đăng nhập"}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{" "}

        <Link
          href="/signup"
          className="font-semibold text-primary hover:underline"
        >
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}