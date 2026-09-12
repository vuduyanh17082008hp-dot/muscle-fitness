import {
  ArrowLeft,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";

import { adminLoginAction } from "./actions";

type AdminLoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const params = searchParams
    ? await searchParams
    : {};

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ============================================================
  // ALREADY LOGGED IN?
  // ============================================================

  if (user) {
    const {
      data: ownedBusinesses,
    } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    if (ownedBusinesses?.length) {
      redirect("/business");
    }

    const {
      data: staffRows,
    } = await supabase
      .from("business_staff")
      .select("business_id")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .limit(1);

    if (staffRows?.length) {
      redirect("/business");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090d] px-6 py-12 text-white">
      <div className="w-full max-w-md">
        {/* =====================================================
            BACK
        ===================================================== */}

        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Muscle Fitness
        </Link>

        {/* =====================================================
            LOGIN CARD
        ===================================================== */}

        <section className="rounded-3xl border border-white/10 bg-white/5 p-7 shadow-2xl sm:p-8">
          <Logo tagline="Business Portal" showTextOnMobile />

          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            Admin Login
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Sign in with a Business Owner or Admin account to
            access members, trainers, analytics and AI insights.
          </p>

          {/* ===================================================
              ERROR
          =================================================== */}

          {params.error ? (
            <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-300">
                {params.error}
              </p>
            </div>
          ) : null}

          {/* ===================================================
              FORM
          =================================================== */}

          <form
            action={adminLoginAction}
            className="mt-7 space-y-5"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Admin email
              </label>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@example.com"
                  className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/30"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Password
              </label>

              <div className="relative">
                <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />

                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-white/30"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 font-semibold text-black transition hover:bg-amber-400"
            >
              <ShieldCheck className="h-4 w-4" />
              Login as Admin
            </button>
          </form>

          {/* ===================================================
              CLIENT LOGIN
          =================================================== */}

          <div className="mt-7 border-t border-white/10 pt-6 text-center">
            <p className="text-sm text-zinc-500">
              Looking for your personal fitness account?
            </p>

            <Link
              href="/login"
              className="mt-3 inline-flex text-sm font-semibold text-white transition hover:text-zinc-300"
            >
              Go to Client Login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}