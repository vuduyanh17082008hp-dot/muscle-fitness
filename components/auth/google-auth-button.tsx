"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type GoogleAuthButtonProps = {
  className?: string;
  errorClassName?: string;
  label?: string;
  loadingLabel?: string;
  nextPath?: string;
};

export default function GoogleAuthButton({
  className,
  errorClassName,
  label = "CONTINUE WITH GOOGLE",
  loadingLabel = "CONNECTING TO GOOGLE...",
  nextPath = "/dashboard",
}: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleGoogleAuth() {
    setErrorMessage("");
    setIsLoading(true);

    try {
      const supabase = createClient();

      /*
       * Tạo callback URL theo port/domain hiện tại.
       * Localhost:3000 sẽ tự dùng localhost:3000.
       * Production sẽ tự dùng production domain.
       */
      const callbackUrl = new URL(
        "/auth/callback",
        window.location.origin
      );

      callbackUrl.searchParams.set("next", nextPath);

      const { error } =
        await supabase.auth.signInWithOAuth({
          provider: "google",

          options: {
            redirectTo: callbackUrl.toString(),

            queryParams: {
              prompt: "select_account",
            },
          },
        });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
      }

      /*
       * Khi thành công browser sẽ rời trang và sang Google,
       * vì vậy không cần setIsLoading(false) ở đây.
       */
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to connect with Google.";

      setErrorMessage(message);
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleGoogleAuth}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        <GoogleIcon />

        <span>
          {isLoading ? loadingLabel : label}
        </span>
      </button>

      {errorMessage && (
        <p
          className={errorClassName}
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </>
  );
}

function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{
        display: "block",
        width: "18px",
        height: "18px",
        flexShrink: 0,
      }}
    >
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.63-2.42l-3.24-2.51c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.39 13.9A6.02 6.02 0 0 1 6.07 12c0-.66.11-1.3.32-1.9V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.59Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.79.51 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"
      />
    </svg>
  );
}