"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

export default function SignupPage() {
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    try {
      setIsLoading(true);

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage(
        "Account created. Please check your email to confirm your account."
      );
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignup() {
    setErrorMessage("");
    setSuccessMessage("");

    try {
      setIsLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
      }
    } catch {
      setErrorMessage("Google sign-up could not be started.");
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      {/* Background */}
      <div className={styles.background} />
      <div className={styles.overlay} />
      <div className={styles.grid} />
      <div className={styles.glow} />

      {/* Navbar */}
      <header className={styles.navbar}>
        <Link href="/" className={styles.logo}>
          <span className={styles.backArrow}>←</span>
          MUSCLE FITNESS
        </Link>

        <div className={styles.navStatus}>
          <span className={styles.statusDot} />
          NEW ATHLETE REGISTRATION
        </div>
      </header>

      <div className={styles.layout}>
        {/* Left side */}
        <section className={styles.introduction}>
          <div className={styles.chapter}>
            <span>01</span>
            <i />
            <span>YOUR BEGINNING</span>
          </div>

          <p className={styles.eyebrow}>A NEW STANDARD STARTS HERE</p>

          <h1 className={styles.title}>
            DON&apos;T JUST
            <br />
            JOIN A PROGRAM.
            <br />
            <span>BUILD YOURSELF.</span>
          </h1>

          <p className={styles.description}>
            Training, nutrition and preparation brought together in one
            structured system—built to help you stop guessing and start
            progressing.
          </p>

          <div className={styles.features}>
            <article>
              <span>01</span>

              <div>
                <h2>PERSONAL DIRECTION</h2>
                <p>
                  Training and nutrition built around your body, experience
                  and goal.
                </p>
              </div>
            </article>

            <article>
              <span>02</span>

              <div>
                <h2>MEASURABLE PROGRESS</h2>
                <p>
                  Track your consistency, performance and transformation over
                  time.
                </p>
              </div>
            </article>

            <article>
              <span>03</span>

              <div>
                <h2>A SYSTEM THAT LASTS</h2>
                <p>
                  Replace temporary motivation with preparation and repeatable
                  habits.
                </p>
              </div>
            </article>
          </div>

          <blockquote className={styles.quote}>
            <span>“</span>

            <p>
              The person you want to become is built through the decisions you
              are willing to repeat.
            </p>
          </blockquote>
        </section>

        {/* Form */}
        <section className={styles.formColumn}>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <div>
                <span>ATHLETE PROFILE</span>
                <span>01 / 01</span>
              </div>

              <h2>CREATE YOUR ACCOUNT</h2>

              <p>
                Your transformation begins with a clear starting point.
              </p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="fullName">FULL NAME</label>

                <div className={styles.inputWrapper}>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                  />

                  <span>01</span>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="email">EMAIL ADDRESS</label>

                <div className={styles.inputWrapper}>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />

                  <span>02</span>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="password">PASSWORD</label>

                <div className={styles.inputWrapper}>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    className={styles.showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="confirmPassword">CONFIRM PASSWORD</label>

                <div className={styles.inputWrapper}>
                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Enter your password again"
                    autoComplete="new-password"
                    required
                  />

                  <span>04</span>
                </div>
              </div>

              {errorMessage && (
                <p className={styles.errorMessage} role="alert">
                  {errorMessage}
                </p>
              )}

              {successMessage && (
                <p className={styles.successMessage} role="status">
                  {successMessage}
                </p>
              )}

              <label className={styles.agreement}>
                <input type="checkbox" required />

                <span>
                  I agree to the{" "}
                  <Link href="/terms">Terms and Conditions</Link> and{" "}
                  <Link href="/privacy">Privacy Policy</Link>.
                </span>
              </label>

              <button
                className={styles.submitButton}
                type="submit"
                disabled={isLoading}
              >
                <span>
                  {isLoading ? "CREATING ACCOUNT..." : "CREATE MY ACCOUNT"}
                </span>

                <b>→</b>
              </button>
            </form>

            <div className={styles.divider}>
              <span />
              <p>OR CONTINUE WITH</p>
              <span />
            </div>

            <button
              type="button"
              className={styles.googleButton}
              onClick={handleGoogleSignup}
              disabled={isLoading}
            >
              <GoogleIcon />

              <span>CONTINUE WITH GOOGLE</span>
            </button>

            <p className={styles.loginText}>
              ALREADY AN ATHLETE?
              <Link href="/login"> LOG IN</Link>
            </p>
          </div>

          <div className={styles.securityNote}>
            <span>SECURE REGISTRATION</span>
            <p>Your personal information is encrypted and protected.</p>
          </div>
        </section>
      </div>

      <div className={styles.backgroundText}>BEGIN</div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg
      className={styles.googleIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
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