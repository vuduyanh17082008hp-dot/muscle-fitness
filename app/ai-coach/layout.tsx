import {
  Bot,
  History,
  Home,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiCoachLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/ai-coach");
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/ai-coach"
            className="flex items-center gap-3"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10">
              <Bot className="h-5 w-5 text-amber-400" />
            </span>

            <span>
              <span className="block text-sm font-black tracking-wide">
                AI COACH
              </span>

              <span className="block text-[10px] uppercase tracking-[0.22em] text-zinc-600">
                Muscle Fitness
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            <Link
              href="/dashboard"
              className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">
                Dashboard
              </span>
            </Link>

            <Link
              href="/ai-coach"
              className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Bot className="h-4 w-4" />
              <span className="hidden sm:inline">
                Coach
              </span>
            </Link>

            <Link
              href="/ai-coach/history"
              className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">
                History
              </span>
            </Link>

            <Link
              href="/ai-coach/settings"
              className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">
                Settings
              </span>
            </Link>
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}